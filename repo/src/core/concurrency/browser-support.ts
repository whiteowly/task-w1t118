import { AppError } from '../validation/errors';

export interface BrowserCapabilityReport {
  indexedDb: boolean;
  broadcastChannel: boolean;
  serviceWorker: boolean;
  webLocks: boolean;
  coordinationMode: 'webLocks' | 'leaseFallback' | 'unsupported';
  promptCriticalMutationSupported: boolean;
  blockingReasons: string[];
  warnings: string[];
}

export function getBrowserCapabilityReport(): BrowserCapabilityReport {
  const indexedDb = typeof indexedDB !== 'undefined';
  const broadcastChannel = typeof BroadcastChannel !== 'undefined';
  const serviceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const webLocks =
    typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';

  const warnings: string[] = [];
  const blockingReasons: string[] = [];

  let coordinationMode: BrowserCapabilityReport['coordinationMode'] = 'unsupported';

  if (!indexedDb) {
    blockingReasons.push(
      'IndexedDB is unavailable. Prompt-critical booking/import mutation coordination cannot run safely.'
    );
  }

  if (!broadcastChannel) {
    blockingReasons.push(
      'BroadcastChannel is unavailable. Prompt-critical multi-tab booking/import mutations are blocked.'
    );
  }

  if (indexedDb && broadcastChannel && webLocks) {
    coordinationMode = 'webLocks';
  } else if (indexedDb && broadcastChannel && !webLocks) {
    coordinationMode = 'leaseFallback';
    warnings.push(
      'Web Locks API is unavailable. Dexie lease-lock fallback is active for multi-tab mutation coordination.'
    );
  }

  return {
    indexedDb,
    broadcastChannel,
    serviceWorker,
    webLocks,
    coordinationMode,
    promptCriticalMutationSupported: coordinationMode !== 'unsupported',
    blockingReasons,
    warnings
  };
}

export function assertPromptCriticalMutationSupportOrThrow(input: {
  mutationFamily: 'booking' | 'importExport';
}): void {
  const report = getBrowserCapabilityReport();
  if (report.promptCriticalMutationSupported) {
    return;
  }

  const mutationLabel = input.mutationFamily === 'booking' ? 'Booking mutations' : 'Import commits';
  throw new AppError({
    code: 'UNSUPPORTED_BROWSER',
    message: `${mutationLabel} require BroadcastChannel-enabled multi-tab coordination support in this browser.`,
    details: {
      coordinationMode: report.coordinationMode,
      blockingReasons: report.blockingReasons
    }
  });
}
