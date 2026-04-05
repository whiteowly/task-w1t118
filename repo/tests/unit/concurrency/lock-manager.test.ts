import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  __resetLockManagerStateForTests,
  acquireLeaseLock,
  releaseLeaseLock
} from '../../../src/core/concurrency/lock-manager';

class InMemoryBroadcastChannel {
  static channels = new Map<string, Set<InMemoryBroadcastChannel>>();

  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
    const channelSet = InMemoryBroadcastChannel.channels.get(name) ?? new Set();
    channelSet.add(this);
    InMemoryBroadcastChannel.channels.set(name, channelSet);
  }

  postMessage(data: unknown): void {
    const channelSet = InMemoryBroadcastChannel.channels.get(this.name) ?? new Set();
    for (const channel of channelSet) {
      if (channel === this) {
        continue;
      }

      channel.onmessage?.({ data } as MessageEvent);
    }
  }

  close(): void {
    const channelSet = InMemoryBroadcastChannel.channels.get(this.name);
    channelSet?.delete(this);
  }

  static reset(): void {
    for (const channelSet of InMemoryBroadcastChannel.channels.values()) {
      for (const channel of channelSet) {
        channel.close();
      }
    }

    InMemoryBroadcastChannel.channels.clear();
  }
}

const originalBroadcastChannel = globalThis.BroadcastChannel;
const originalNavigatorLocks = navigator.locks;

function setBroadcastChannelMock(enabled: boolean): void {
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    value: enabled ? InMemoryBroadcastChannel : undefined,
    configurable: true,
    writable: true
  });
}

function setNavigatorLocksMock(value: unknown): void {
  Object.defineProperty(navigator, 'locks', {
    value,
    configurable: true,
    writable: true
  });
}

describe('lock manager coordination strategy', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    __resetLockManagerStateForTests();
    InMemoryBroadcastChannel.reset();
  });

  afterEach(async () => {
    __resetLockManagerStateForTests();
    InMemoryBroadcastChannel.reset();

    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: originalBroadcastChannel,
      configurable: true,
      writable: true
    });

    Object.defineProperty(navigator, 'locks', {
      value: originalNavigatorLocks,
      configurable: true,
      writable: true
    });

    await db.delete();
  });

  it('returns unsupported-browser lock result when BroadcastChannel is unavailable', async () => {
    setBroadcastChannelMock(false);
    setNavigatorLocksMock(undefined);

    const result = await acquireLeaseLock({
      resourceKey: 'booking-lock|unsupported|1',
      holderTabId: 'tab-a',
      ttlMs: 30_000
    });

    expect(result).toEqual({ acquired: false, reason: 'UNSUPPORTED_BROWSER' });
  });

  it('falls back to Dexie lease locking when Web Locks is unavailable', async () => {
    setBroadcastChannelMock(true);
    setNavigatorLocksMock(undefined);

    const first = await acquireLeaseLock({
      resourceKey: 'booking-lock|fallback|1',
      holderTabId: 'tab-a',
      ttlMs: 30_000
    });
    const second = await acquireLeaseLock({
      resourceKey: 'booking-lock|fallback|1',
      holderTabId: 'tab-b',
      ttlMs: 30_000
    });

    expect(first.acquired).toBe(true);
    expect(second).toEqual({ acquired: false, reason: 'LOCK_HELD' });

    await releaseLeaseLock('booking-lock|fallback|1', 'tab-a');

    const third = await acquireLeaseLock({
      resourceKey: 'booking-lock|fallback|1',
      holderTabId: 'tab-b',
      ttlMs: 30_000
    });

    expect(third.acquired).toBe(true);
  });

  it('uses navigator.locks coordination when Web Locks is available', async () => {
    setBroadcastChannelMock(true);

    const heldLocks = new Set<string>();
    const requestSpy = vi.fn(
      async (
        lockName: string,
        options: { mode?: string; ifAvailable?: boolean },
        callback: (lock: object | null) => Promise<boolean>
      ) => {
        if (options.ifAvailable && heldLocks.has(lockName)) {
          return callback(null);
        }

        heldLocks.add(lockName);
        try {
          return await callback({ name: lockName });
        } finally {
          heldLocks.delete(lockName);
        }
      }
    );

    setNavigatorLocksMock({ request: requestSpy });

    const first = await acquireLeaseLock({
      resourceKey: 'booking-lock|weblocks|1',
      holderTabId: 'tab-a',
      ttlMs: 30_000
    });

    const second = await acquireLeaseLock({
      resourceKey: 'booking-lock|weblocks|1',
      holderTabId: 'tab-b',
      ttlMs: 30_000
    });

    expect(first.acquired).toBe(true);
    expect(second).toEqual({ acquired: false, reason: 'LOCK_HELD' });

    await releaseLeaseLock('booking-lock|weblocks|1', 'tab-a');

    const third = await acquireLeaseLock({
      resourceKey: 'booking-lock|weblocks|1',
      holderTabId: 'tab-b',
      ttlMs: 30_000
    });

    expect(third.acquired).toBe(true);
    expect(requestSpy).toHaveBeenCalled();

    await releaseLeaseLock('booking-lock|weblocks|1', 'tab-b');
  });
});
