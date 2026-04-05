import { getBrowserCapabilityReport } from './browser-support';
import { db } from '../db/database';

export interface LockAttempt {
  resourceKey: string;
  holderTabId: string;
  ttlMs: number;
}

export interface LockResult {
  acquired: boolean;
  expiresAt?: string;
  reason?: 'LOCK_HELD' | 'INVALID_TTL' | 'UNSUPPORTED_BROWSER';
}

interface LockCoordinationMessage {
  type: 'LOCK_ACQUIRED' | 'LOCK_RELEASED';
  resourceKey: string;
  holderTabId: string;
  expiresAt: string;
  strategy: 'webLocks' | 'leaseFallback';
  emittedAt: string;
}

interface ActiveWebLock {
  release: () => void;
  completion: Promise<void>;
}

const LOCK_COORDINATION_CHANNEL = 'localops-lock-coordination-v1';
const remoteActiveLocks = new Map<string, string>();
const activeWebLocks = new Map<string, ActiveWebLock>();

let lockChannel: BroadcastChannel | null = null;

function makeLockOwnerKey(resourceKey: string, holderTabId: string): string {
  return `${resourceKey}::${holderTabId}`;
}

function parseIsoOrZero(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function pruneExpiredRemoteLockState(nowMs = Date.now()): void {
  for (const [lockOwnerKey, expiresAtIso] of remoteActiveLocks.entries()) {
    if (parseIsoOrZero(expiresAtIso) <= nowMs) {
      remoteActiveLocks.delete(lockOwnerKey);
    }
  }
}

function getLockCoordinationChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (lockChannel) {
    return lockChannel;
  }

  lockChannel = new BroadcastChannel(LOCK_COORDINATION_CHANNEL);
  lockChannel.onmessage = (event: MessageEvent<LockCoordinationMessage>) => {
    const payload = event.data;
    if (!payload || !payload.resourceKey || !payload.holderTabId || !payload.expiresAt) {
      return;
    }

    const lockOwnerKey = makeLockOwnerKey(payload.resourceKey, payload.holderTabId);
    if (payload.type === 'LOCK_RELEASED') {
      remoteActiveLocks.delete(lockOwnerKey);
      return;
    }

    remoteActiveLocks.set(lockOwnerKey, payload.expiresAt);
    pruneExpiredRemoteLockState();
  };

  return lockChannel;
}

function publishLockEvent(payload: LockCoordinationMessage): void {
  const channel = getLockCoordinationChannel();
  channel?.postMessage(payload);
}

function hasActiveRemoteHolder(resourceKey: string, holderTabId: string): boolean {
  pruneExpiredRemoteLockState();

  for (const [lockOwnerKey] of remoteActiveLocks.entries()) {
    const [remoteResourceKey, remoteHolderTabId] = lockOwnerKey.split('::');
    if (remoteResourceKey !== resourceKey) {
      continue;
    }

    if (remoteHolderTabId !== holderTabId) {
      return true;
    }
  }

  return false;
}

export function supportsWebLocks(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.locks !== 'undefined';
}

async function acquireDexieLeaseFallback(input: LockAttempt): Promise<LockResult> {
  const now = Date.now();
  const expiresAt = new Date(now + input.ttlMs).toISOString();

  return db.transaction('rw', db.bookingLocks, async () => {
    const currentLock = await db.bookingLocks.get(input.resourceKey);
    if (currentLock && new Date(currentLock.expiresAt).getTime() > now) {
      return { acquired: false, reason: 'LOCK_HELD' } as LockResult;
    }

    if (currentLock) {
      await db.bookingLocks.delete(input.resourceKey);
    }

    try {
      await db.bookingLocks.add({
        resourceKey: input.resourceKey,
        holderTabId: input.holderTabId,
        expiresAt
      });
    } catch {
      return { acquired: false, reason: 'LOCK_HELD' } as LockResult;
    }

    publishLockEvent({
      type: 'LOCK_ACQUIRED',
      resourceKey: input.resourceKey,
      holderTabId: input.holderTabId,
      expiresAt,
      strategy: 'leaseFallback',
      emittedAt: new Date().toISOString()
    });

    return { acquired: true, expiresAt } as LockResult;
  });
}

async function acquireWebLocksPath(input: LockAttempt): Promise<LockResult> {
  const lockOwnerKey = makeLockOwnerKey(input.resourceKey, input.holderTabId);
  const existing = activeWebLocks.get(lockOwnerKey);
  if (existing) {
    return {
      acquired: true,
      expiresAt: new Date(Date.now() + input.ttlMs).toISOString()
    };
  }

  if (hasActiveRemoteHolder(input.resourceKey, input.holderTabId)) {
    return { acquired: false, reason: 'LOCK_HELD' };
  }

  const lockManager = navigator.locks;
  if (!lockManager) {
    return { acquired: false, reason: 'UNSUPPORTED_BROWSER' };
  }

  let readyResolve: (() => void) | null = null;
  const ready = new Promise<void>((resolve) => {
    readyResolve = resolve;
  });

  let releaseResolver: (() => void) | null = null;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseResolver = resolve;
  });

  let acquired = false;
  let expiresAt = new Date(Date.now() + input.ttlMs).toISOString();

  const lockCompletion = lockManager.request(
    input.resourceKey,
    { mode: 'exclusive', ifAvailable: true },
    async (lock) => {
      if (!lock) {
        readyResolve?.();
        return false;
      }

      acquired = true;
      expiresAt = new Date(Date.now() + input.ttlMs).toISOString();

      publishLockEvent({
        type: 'LOCK_ACQUIRED',
        resourceKey: input.resourceKey,
        holderTabId: input.holderTabId,
        expiresAt,
        strategy: 'webLocks',
        emittedAt: new Date().toISOString()
      });

      readyResolve?.();
      await releaseSignal;

      publishLockEvent({
        type: 'LOCK_RELEASED',
        resourceKey: input.resourceKey,
        holderTabId: input.holderTabId,
        expiresAt: new Date().toISOString(),
        strategy: 'webLocks',
        emittedAt: new Date().toISOString()
      });

      return true;
    }
  );

  lockCompletion.catch(() => {
    readyResolve?.();
  });

  await ready;

  if (!acquired || !releaseResolver) {
    return { acquired: false, reason: 'LOCK_HELD' };
  }

  activeWebLocks.set(lockOwnerKey, {
    release: releaseResolver,
    completion: lockCompletion.then(() => undefined).catch(() => undefined)
  });

  return { acquired: true, expiresAt };
}

/**
 * Primary lock path uses Web Locks + BroadcastChannel coordination.
 * Fallback uses Dexie lease locking + BroadcastChannel coordination.
 */
export async function acquireLeaseLock(input: LockAttempt): Promise<LockResult> {
  if (input.ttlMs <= 0) {
    return { acquired: false, reason: 'INVALID_TTL' };
  }

  const capabilityReport = getBrowserCapabilityReport();
  if (capabilityReport.coordinationMode === 'unsupported') {
    return { acquired: false, reason: 'UNSUPPORTED_BROWSER' };
  }

  return capabilityReport.coordinationMode === 'webLocks'
    ? acquireWebLocksPath(input)
    : acquireDexieLeaseFallback(input);
}

export async function releaseLeaseLock(resourceKey: string, holderTabId: string): Promise<void> {
  const capabilityReport = getBrowserCapabilityReport();
  const lockOwnerKey = makeLockOwnerKey(resourceKey, holderTabId);

  if (capabilityReport.coordinationMode === 'webLocks') {
    const activeWebLock = activeWebLocks.get(lockOwnerKey);
    if (!activeWebLock) {
      return;
    }

    activeWebLock.release();
    await activeWebLock.completion;
    activeWebLocks.delete(lockOwnerKey);
    return;
  }

  const lock = await db.bookingLocks.get(resourceKey);
  if (lock?.holderTabId !== holderTabId) {
    return;
  }

  await db.bookingLocks.delete(resourceKey);

  publishLockEvent({
    type: 'LOCK_RELEASED',
    resourceKey,
    holderTabId,
    expiresAt: new Date().toISOString(),
    strategy: 'leaseFallback',
    emittedAt: new Date().toISOString()
  });
}

export function __resetLockManagerStateForTests(): void {
  remoteActiveLocks.clear();

  for (const activeLock of activeWebLocks.values()) {
    activeLock.release();
  }
  activeWebLocks.clear();

  if (lockChannel) {
    lockChannel.close();
    lockChannel = null;
  }
}
