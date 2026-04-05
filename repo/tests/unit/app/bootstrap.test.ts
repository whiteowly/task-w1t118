import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/recovery/startup-recovery', () => ({
  runStartupRecovery: vi.fn(async () => ({
    expiredLocksCleared: 2,
    expiredHoldsReleased: 3,
    expiredIdempotencyPruned: 4
  }))
}));

import {
  __resetServiceWorkerRecoveryBridgeForTests,
  handleServiceWorkerRecoveryMessage,
  registerServiceWorker
} from '../../../src/app/bootstrap';
import { runStartupRecovery } from '../../../src/core/recovery/startup-recovery';

describe('service-worker recovery bridge', () => {
  const originalServiceWorker = navigator.serviceWorker;

  beforeEach(() => {
    __resetServiceWorkerRecoveryBridgeForTests();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: originalServiceWorker,
      configurable: true,
      writable: true
    });
    vi.clearAllMocks();
  });

  it('registers service worker sync hooks and notifies worker to schedule recovery', async () => {
    const workerPostMessage = vi.fn();
    const registration = {
      active: { postMessage: workerPostMessage },
      waiting: null,
      installing: null,
      sync: {
        register: vi.fn(async () => undefined)
      }
    };

    const addEventListener = vi.fn();
    const register = vi.fn(async () => registration);

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        addEventListener,
        register,
        controller: null
      },
      configurable: true,
      writable: true
    });

    const result = await registerServiceWorker();

    expect(result).toBe(registration);
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(registration.sync.register).toHaveBeenCalledWith('localops-recovery-sync-v1');
    expect(workerPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOCALOPS_REGISTER_BACKGROUND_RECOVERY',
        syncTag: 'localops-recovery-sync-v1'
      })
    );
    expect(addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('runs recovery sweep and posts completion when worker requests recovery', async () => {
    const controllerPostMessage = vi.fn();

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        controller: {
          postMessage: controllerPostMessage
        }
      },
      configurable: true,
      writable: true
    });

    await handleServiceWorkerRecoveryMessage({
      type: 'LOCALOPS_RUN_RECOVERY',
      reason: 'background-sync'
    });

    expect(runStartupRecovery).toHaveBeenCalledTimes(1);
    expect(controllerPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'LOCALOPS_RECOVERY_COMPLETED',
        reason: 'background-sync',
        summary: {
          expiredLocksCleared: 2,
          expiredHoldsReleased: 3,
          expiredIdempotencyPruned: 4
        }
      })
    );
  });
});
