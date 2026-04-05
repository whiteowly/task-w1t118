import {
  db,
  type BookingLockRecord,
  type IdempotencyRecord,
  type OrderHoldRecord
} from '../db/database';
import { logger } from '../logging/logger';

export interface RecoverySummary {
  expiredLocksCleared: number;
  expiredHoldsReleased: number;
  expiredIdempotencyPruned: number;
}

export async function runStartupRecovery(nowMs = Date.now()): Promise<RecoverySummary> {
  const nowIso = new Date(nowMs).toISOString();

  const expiredLocks = (await db.bookingLocks
    .where('expiresAt')
    .belowOrEqual(nowIso)
    .toArray()) as BookingLockRecord[];
  const expiredHolds = (await db.orderHolds
    .where('expiresAt')
    .belowOrEqual(nowIso)
    .toArray()) as OrderHoldRecord[];
  const expiredIdempotency = (await db.idempotencyKeys
    .where('expiresAt')
    .belowOrEqual(nowIso)
    .toArray()) as IdempotencyRecord[];

  await db.transaction('rw', db.bookingLocks, db.orderHolds, db.idempotencyKeys, async () => {
    await Promise.all(expiredLocks.map((record) => db.bookingLocks.delete(record.resourceKey)));

    await Promise.all(
      expiredHolds.map((record) =>
        db.orderHolds.update(record.id, {
          status: 'released'
        })
      )
    );

    await Promise.all(expiredIdempotency.map((record) => db.idempotencyKeys.delete(record.key)));
  });

  const summary: RecoverySummary = {
    expiredLocksCleared: expiredLocks.length,
    expiredHoldsReleased: expiredHolds.length,
    expiredIdempotencyPruned: expiredIdempotency.length
  };

  logger.info('recovery', 'Startup recovery sweep completed.', summary);
  return summary;
}
