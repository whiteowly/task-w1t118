import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import { runStartupRecovery } from '../../../src/core/recovery/startup-recovery';

describe('startup recovery', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    await db.delete();
  });

  it('cleans expired booking locks/holds and idempotency records', async () => {
    const nowMs = Date.now();
    const pastIso = new Date(nowMs - 60_000).toISOString();
    const futureIso = new Date(nowMs + 60_000).toISOString();

    await db.bookingLocks.bulkAdd([
      { resourceKey: 'expired-lock', holderTabId: 'tab-1', expiresAt: pastIso },
      { resourceKey: 'live-lock', holderTabId: 'tab-2', expiresAt: futureIso },
      {
        resourceKey: 'import-export:workspaceBackup',
        holderTabId: 'tab-import',
        expiresAt: pastIso
      }
    ]);

    await db.orderHolds.bulkAdd([
      {
        id: 'expired-hold',
        resourceKey: 'booking-hold|patio-a|a|b',
        status: 'active',
        expiresAt: pastIso
      },
      {
        id: 'live-hold',
        resourceKey: 'booking-hold|patio-a|c|d',
        status: 'active',
        expiresAt: futureIso
      }
    ]);

    await db.idempotencyKeys.bulkAdd([
      {
        key: 'expired-idempotency',
        operationType: 'booking.create',
        requestHash: 'a',
        responseHash: 'a',
        createdAt: pastIso,
        expiresAt: pastIso
      },
      {
        key: 'live-idempotency',
        operationType: 'booking.create',
        requestHash: 'b',
        responseHash: 'b',
        createdAt: pastIso,
        expiresAt: futureIso
      },
      {
        key: 'import.workspaceBackup.expired',
        operationType: 'import.workspaceBackup',
        requestHash: 'hash-a',
        responseHash: 'hash-a',
        createdAt: pastIso,
        expiresAt: pastIso
      }
    ]);

    const summary = await runStartupRecovery(nowMs);

    expect(summary.expiredLocksCleared).toBe(2);
    expect(summary.expiredHoldsReleased).toBe(1);
    expect(summary.expiredIdempotencyPruned).toBe(2);

    expect(await db.bookingLocks.get('expired-lock')).toBeUndefined();
    expect(await db.bookingLocks.get('import-export:workspaceBackup')).toBeUndefined();
    expect(await db.bookingLocks.get('live-lock')).toBeDefined();

    expect((await db.orderHolds.get('expired-hold'))?.status).toBe('released');
    expect((await db.orderHolds.get('live-hold'))?.status).toBe('active');

    expect(await db.idempotencyKeys.get('expired-idempotency')).toBeUndefined();
    expect(await db.idempotencyKeys.get('import.workspaceBackup.expired')).toBeUndefined();
    expect(await db.idempotencyKeys.get('live-idempotency')).toBeDefined();
  });
});
