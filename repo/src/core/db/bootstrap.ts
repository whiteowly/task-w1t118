import { logger } from '../logging/logger';
import { db } from './database';

const ROLE_SEED = [
  'Administrator',
  'MerchantEditor',
  'ContentReviewerPublisher',
  'BookingAgent',
  'HRManager',
  'Recruiter'
] as const;

export async function initializeDatabase(): Promise<void> {
  await db.open();

  const existingRoles = await db.roles.count();
  if (existingRoles === 0) {
    const now = new Date().toISOString();
    await db.roles.bulkAdd(
      ROLE_SEED.map((role) => ({
        id: role,
        name: role,
        createdAt: now
      }))
    );

    logger.info('storage', 'Seeded role catalog for first run.', { roleCount: ROLE_SEED.length });
  }
}

export async function isBootstrapRequired(): Promise<boolean> {
  const count = await db.users.count();
  return count === 0;
}
