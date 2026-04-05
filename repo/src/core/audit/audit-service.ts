import { db } from '../db/database';

interface AuditInput {
  actorUserId: string | null;
  actionType: string;
  entityType: string;
  entityId: string;
  previousState: unknown;
  newState: unknown;
}

export async function appendAuditEvent(input: AuditInput): Promise<void> {
  await db.auditEvents.add({
    id: crypto.randomUUID(),
    actorUserId: input.actorUserId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: input.entityId,
    previousState: input.previousState,
    newState: input.newState,
    createdAt: new Date().toISOString()
  });
}
