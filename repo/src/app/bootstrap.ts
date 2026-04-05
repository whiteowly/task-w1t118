import { appBootstrapStore } from '../shared/stores/app-store';
import { initializeDatabase, isBootstrapRequired } from '../core/db/bootstrap';
import { logger } from '../core/logging/logger';
import { runStartupRecovery } from '../core/recovery/startup-recovery';

const RECOVERY_SYNC_TAG = 'localops-recovery-sync-v1';
const RECOVERY_MESSAGE_TYPE = 'LOCALOPS_RUN_RECOVERY';

let recoveryBridgeAttached = false;

export async function initializeApp(): Promise<void> {
  try {
    await initializeDatabase();
    await runStartupRecovery();
    const bootstrapRequired = await isBootstrapRequired();

    appBootstrapStore.set({
      initialized: true,
      bootstrapRequired,
      startupError: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown startup failure';
    logger.error('app', 'Application bootstrap failed.', { message });

    appBootstrapStore.set({
      initialized: true,
      bootstrapRequired: false,
      startupError: message
    });
  }
}

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>;
  };
  periodicSync?: {
    register: (tag: string, options: { minInterval: number }) => Promise<void>;
  };
};

async function notifyServiceWorkerToScheduleRecovery(
  registration: ServiceWorkerRegistration,
  reason: string
): Promise<void> {
  const targetWorker =
    registration.active ??
    registration.waiting ??
    registration.installing ??
    navigator.serviceWorker.controller;

  targetWorker?.postMessage({
    type: 'LOCALOPS_REGISTER_BACKGROUND_RECOVERY',
    syncTag: RECOVERY_SYNC_TAG,
    reason
  });
}

async function registerBackgroundRecoverySync(
  registration: ServiceWorkerRegistration
): Promise<void> {
  const syncRegistration = registration as SyncCapableRegistration;

  if (syncRegistration.sync?.register) {
    try {
      await syncRegistration.sync.register(RECOVERY_SYNC_TAG);
      logger.info('app', 'Registered service-worker one-off recovery sync.', {
        syncTag: RECOVERY_SYNC_TAG
      });
    } catch (error) {
      logger.warn('app', 'Failed to register one-off service-worker recovery sync.', {
        syncTag: RECOVERY_SYNC_TAG,
        message: error instanceof Error ? error.message : 'Unknown sync registration error'
      });
    }
  }

  if (syncRegistration.periodicSync?.register) {
    try {
      await syncRegistration.periodicSync.register(RECOVERY_SYNC_TAG, {
        minInterval: 15 * 60 * 1_000
      });
      logger.info('app', 'Registered service-worker periodic recovery sync.', {
        syncTag: RECOVERY_SYNC_TAG
      });
    } catch (error) {
      logger.warn('app', 'Failed to register service-worker periodic recovery sync.', {
        syncTag: RECOVERY_SYNC_TAG,
        message: error instanceof Error ? error.message : 'Unknown periodic sync registration error'
      });
    }
  }
}

export async function handleServiceWorkerRecoveryMessage(data: unknown): Promise<void> {
  if (!data || typeof data !== 'object') {
    return;
  }

  const message = data as { type?: string; reason?: string };
  if (message.type !== RECOVERY_MESSAGE_TYPE) {
    return;
  }

  const summary = await runStartupRecovery();
  logger.info('recovery', 'Service worker requested recovery sweep completed.', {
    reason: message.reason ?? 'unspecified',
    ...summary
  });

  navigator.serviceWorker.controller?.postMessage({
    type: 'LOCALOPS_RECOVERY_COMPLETED',
    reason: message.reason ?? 'unspecified',
    summary,
    completedAt: new Date().toISOString()
  });
}

function attachRecoveryBridgeIfNeeded(): void {
  if (recoveryBridgeAttached) {
    return;
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    void handleServiceWorkerRecoveryMessage(event.data).catch((error) => {
      logger.warn('recovery', 'Service-worker recovery message handling failed.', {
        message: error instanceof Error ? error.message : 'Unknown recovery bridge error'
      });
    });
  });

  recoveryBridgeAttached = true;
}

export function __resetServiceWorkerRecoveryBridgeForTests(): void {
  recoveryBridgeAttached = false;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    logger.warn('app', 'Service worker not supported in this browser.');
    return null;
  }

  attachRecoveryBridgeIfNeeded();

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await registerBackgroundRecoverySync(registration);
    await notifyServiceWorkerToScheduleRecovery(registration, 'app-bootstrap');

    logger.info('app', 'Service worker registered successfully.', {
      recoverySyncTag: RECOVERY_SYNC_TAG
    });
    return registration;
  } catch (error) {
    logger.error('app', 'Service worker registration failed.', {
      message: error instanceof Error ? error.message : 'Unknown registration error'
    });
    return null;
  }
}
