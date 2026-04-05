import { get } from 'svelte/store';

import { appendAuditEvent } from '../../core/audit/audit-service';
import {
  db,
  type CollaborationCannedResponseRecord,
  type CollaborationMessageRecord,
  type CollaborationMessageSource,
  type CollaborationNoteRecord
} from '../../core/db/database';
import { logger } from '../../core/logging/logger';
import { assertCapability } from '../../core/permissions/service';
import { AppError } from '../../core/validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { RoleName } from '../../shared/types/auth';
import {
  DEFAULT_COLLABORATION_CANNED_RESPONSES,
  collaborationContextLabelForPath,
  normalizeCollaborationContextKey
} from './collaboration-config';
import {
  collaborationArchiveSchema,
  collaborationCannedResponseSchema,
  collaborationHistoryQuerySchema,
  collaborationMessageSchema,
  collaborationNoteCreateSchema,
  collaborationNoteUpdateSchema,
  collaborationSearchSchema,
  parseCollaborationPayloadOrThrow
} from './collaboration-validation';

interface ActorContext {
  userId: string;
  username: string;
  roles: RoleName[];
}

export interface CollaborationMessageView {
  id: string;
  contextKey: string;
  contextLabel: string;
  messageBody: string;
  source: CollaborationMessageSource;
  archived: boolean;
  createdAt: string;
  createdBy: string;
}

export interface CollaborationNoteView {
  id: string;
  contextKey: string;
  contextLabel: string;
  noteBody: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CollaborationCannedResponseView {
  id: string;
  title: string;
  body: string;
  tags: string[];
  archived: boolean;
  updatedAt: string;
}

export interface CollaborationSearchResultView {
  resultType: 'message' | 'note';
  id: string;
  contextKey: string;
  contextLabel: string;
  body: string;
  archived: boolean;
  timestamp: string;
}

function getActorOrThrow(): ActorContext {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An authenticated session is required for collaboration operations.'
    });
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    roles: session.user.roles
  };
}

function mapMessage(record: CollaborationMessageRecord): CollaborationMessageView {
  return {
    id: record.id,
    contextKey: record.contextKey,
    contextLabel: record.contextLabel,
    messageBody: record.messageBody,
    source: record.source,
    archived: record.archived,
    createdAt: record.createdAt,
    createdBy: record.createdBy
  };
}

function mapNote(record: CollaborationNoteRecord): CollaborationNoteView {
  return {
    id: record.id,
    contextKey: record.contextKey,
    contextLabel: record.contextLabel,
    noteBody: record.noteBody,
    archived: record.archived,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy
  };
}

function mapCannedResponse(
  record: CollaborationCannedResponseRecord
): CollaborationCannedResponseView {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    tags: [...record.tags],
    archived: record.archived,
    updatedAt: record.updatedAt
  };
}

function normalizedContext(input: { contextKey: string; contextLabel?: string }) {
  const contextKey = normalizeCollaborationContextKey(input.contextKey);
  const contextLabel =
    input.contextLabel && input.contextLabel.trim().length > 0
      ? input.contextLabel.trim()
      : collaborationContextLabelForPath(contextKey);

  return {
    contextKey,
    contextLabel
  };
}

function searchDateRange(input: { startDate?: string | null; endDate?: string | null }): {
  startMs: number | null;
  endMs: number | null;
} {
  const startMs = input.startDate ? new Date(`${input.startDate}T00:00:00.000`).getTime() : null;
  const endMs = input.endDate ? new Date(`${input.endDate}T23:59:59.999`).getTime() : null;

  return { startMs, endMs };
}

async function ensureCannedResponseSeedData(): Promise<void> {
  if ((await db.collaborationCannedResponses.count()) > 0) {
    return;
  }

  const now = new Date().toISOString();
  await db.collaborationCannedResponses.bulkPut(
    DEFAULT_COLLABORATION_CANNED_RESPONSES.map((response) => ({
      id: response.id,
      title: response.title,
      body: response.body,
      tags: [...response.tags],
      archived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now
    }))
  );
}

export async function listContextHistory(input: {
  contextKey: string;
  includeArchived?: boolean;
}): Promise<CollaborationMessageView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationHistoryQuerySchema, {
    contextKey: normalizeCollaborationContextKey(input.contextKey),
    includeArchived: input.includeArchived ?? false
  });

  const records = await db.collaborationMessages
    .where('contextKey')
    .equals(payload.contextKey)
    .toArray();

  return records
    .filter((record) => (payload.includeArchived ? true : !record.archived))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .map(mapMessage);
}

export async function postContextMessage(input: {
  contextKey: string;
  contextLabel?: string;
  messageBody: string;
  source?: CollaborationMessageSource;
}): Promise<CollaborationMessageView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const context = normalizedContext(input);
  const payload = parseCollaborationPayloadOrThrow(collaborationMessageSchema, {
    contextKey: context.contextKey,
    contextLabel: context.contextLabel,
    messageBody: input.messageBody,
    source: input.source ?? 'manual'
  });

  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();

  await db.transaction('rw', db.collaborationMessages, db.auditEvents, async () => {
    await db.collaborationMessages.add({
      id: messageId,
      contextKey: payload.contextKey,
      contextLabel: payload.contextLabel,
      messageBody: payload.messageBody,
      source: payload.source ?? 'manual',
      archived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: actor.userId,
      createdAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'COLLABORATION_MESSAGE_POSTED',
      entityType: 'collaborationMessage',
      entityId: messageId,
      previousState: null,
      newState: {
        contextKey: payload.contextKey,
        source: payload.source ?? 'manual',
        messageLength: payload.messageBody.length
      }
    });
  });

  logger.info('app', 'Posted collaboration message.', {
    actorUserId: actor.userId,
    messageId,
    contextKey: payload.contextKey,
    source: payload.source ?? 'manual'
  });

  const created = await db.collaborationMessages.get(messageId);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Collaboration message was not found after save.'
    });
  }

  return mapMessage(created);
}

export async function setContextMessageArchived(input: {
  recordId: string;
  archived: boolean;
}): Promise<CollaborationMessageView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationArchiveSchema, input);
  const record = await db.collaborationMessages.get(payload.recordId);
  if (!record) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Collaboration message not found.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.collaborationMessages, db.auditEvents, async () => {
    await db.collaborationMessages.update(record.id, {
      archived: payload.archived,
      archivedAt: payload.archived ? now : null,
      archivedBy: payload.archived ? actor.userId : null
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: payload.archived
        ? 'COLLABORATION_MESSAGE_ARCHIVED'
        : 'COLLABORATION_MESSAGE_UNARCHIVED',
      entityType: 'collaborationMessage',
      entityId: record.id,
      previousState: { archived: record.archived },
      newState: { archived: payload.archived }
    });
  });

  const updated = await db.collaborationMessages.get(record.id);
  if (!updated) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Updated collaboration message not found.'
    });
  }

  return mapMessage(updated);
}

export async function listSharedNotes(input: {
  contextKey: string;
  includeArchived?: boolean;
}): Promise<CollaborationNoteView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationHistoryQuerySchema, {
    contextKey: normalizeCollaborationContextKey(input.contextKey),
    includeArchived: input.includeArchived ?? false
  });

  const records = await db.collaborationNotes
    .where('contextKey')
    .equals(payload.contextKey)
    .toArray();

  return records
    .filter((record) => (payload.includeArchived ? true : !record.archived))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .map(mapNote);
}

export async function createSharedNote(input: {
  contextKey: string;
  contextLabel?: string;
  noteBody: string;
}): Promise<CollaborationNoteView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const context = normalizedContext(input);
  const payload = parseCollaborationPayloadOrThrow(collaborationNoteCreateSchema, {
    contextKey: context.contextKey,
    contextLabel: context.contextLabel,
    noteBody: input.noteBody
  });

  const now = new Date().toISOString();
  const noteId = crypto.randomUUID();

  await db.transaction('rw', db.collaborationNotes, db.auditEvents, async () => {
    await db.collaborationNotes.add({
      id: noteId,
      contextKey: payload.contextKey,
      contextLabel: payload.contextLabel,
      noteBody: payload.noteBody,
      archived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      createdAt: now,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'COLLABORATION_NOTE_CREATED',
      entityType: 'collaborationNote',
      entityId: noteId,
      previousState: null,
      newState: {
        contextKey: payload.contextKey,
        noteLength: payload.noteBody.length
      }
    });
  });

  const created = await db.collaborationNotes.get(noteId);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Shared note was not found after save.'
    });
  }

  return mapNote(created);
}

export async function updateSharedNote(input: {
  noteId: string;
  noteBody: string;
}): Promise<CollaborationNoteView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationNoteUpdateSchema, input);
  const existing = await db.collaborationNotes.get(payload.noteId);
  if (!existing) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Shared note not found.' });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.collaborationNotes, db.auditEvents, async () => {
    await db.collaborationNotes.update(existing.id, {
      noteBody: payload.noteBody,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'COLLABORATION_NOTE_UPDATED',
      entityType: 'collaborationNote',
      entityId: existing.id,
      previousState: { noteLength: existing.noteBody.length },
      newState: { noteLength: payload.noteBody.length }
    });
  });

  const updated = await db.collaborationNotes.get(existing.id);
  if (!updated) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Updated shared note not found.' });
  }

  return mapNote(updated);
}

export async function setSharedNoteArchived(input: {
  recordId: string;
  archived: boolean;
}): Promise<CollaborationNoteView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationArchiveSchema, input);
  const record = await db.collaborationNotes.get(payload.recordId);
  if (!record) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Shared note not found.' });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.collaborationNotes, db.auditEvents, async () => {
    await db.collaborationNotes.update(record.id, {
      archived: payload.archived,
      archivedAt: payload.archived ? now : null,
      archivedBy: payload.archived ? actor.userId : null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: payload.archived
        ? 'COLLABORATION_NOTE_ARCHIVED'
        : 'COLLABORATION_NOTE_UNARCHIVED',
      entityType: 'collaborationNote',
      entityId: record.id,
      previousState: { archived: record.archived },
      newState: { archived: payload.archived }
    });
  });

  const updated = await db.collaborationNotes.get(record.id);
  if (!updated) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Updated shared note not found.' });
  }

  return mapNote(updated);
}

export async function listCannedResponses(
  includeArchived = false
): Promise<CollaborationCannedResponseView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');
  await ensureCannedResponseSeedData();

  const records = await db.collaborationCannedResponses.toArray();
  return records
    .filter((record) => (includeArchived ? true : !record.archived))
    .sort((left, right) => left.title.localeCompare(right.title))
    .map(mapCannedResponse);
}

export async function createCannedResponse(input: {
  title: string;
  body: string;
  tags: string[];
}): Promise<CollaborationCannedResponseView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationCannedResponseSchema, input);
  const tags = payload.tags ?? [];
  const now = new Date().toISOString();
  const recordId = crypto.randomUUID();

  await db.transaction('rw', db.collaborationCannedResponses, db.auditEvents, async () => {
    await db.collaborationCannedResponses.add({
      id: recordId,
      title: payload.title,
      body: payload.body,
      tags: [...tags],
      archived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      createdAt: now,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'COLLABORATION_CANNED_RESPONSE_CREATED',
      entityType: 'collaborationCannedResponse',
      entityId: recordId,
      previousState: null,
      newState: {
        title: payload.title,
        tagCount: tags.length
      }
    });
  });

  const created = await db.collaborationCannedResponses.get(recordId);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Canned response was not found after save.'
    });
  }

  return mapCannedResponse(created);
}

export async function setCannedResponseArchived(input: {
  recordId: string;
  archived: boolean;
}): Promise<CollaborationCannedResponseView> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationArchiveSchema, input);
  const existing = await db.collaborationCannedResponses.get(payload.recordId);
  if (!existing) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Canned response not found.' });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.collaborationCannedResponses, db.auditEvents, async () => {
    await db.collaborationCannedResponses.update(existing.id, {
      archived: payload.archived,
      archivedAt: payload.archived ? now : null,
      archivedBy: payload.archived ? actor.userId : null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: payload.archived
        ? 'COLLABORATION_CANNED_RESPONSE_ARCHIVED'
        : 'COLLABORATION_CANNED_RESPONSE_UNARCHIVED',
      entityType: 'collaborationCannedResponse',
      entityId: existing.id,
      previousState: { archived: existing.archived },
      newState: { archived: payload.archived }
    });
  });

  const updated = await db.collaborationCannedResponses.get(existing.id);
  if (!updated) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Updated canned response not found.' });
  }

  return mapCannedResponse(updated);
}

export async function searchCollaborationRecords(input: {
  keyword?: string;
  startDate?: string | null;
  endDate?: string | null;
  includeArchived?: boolean;
  contextKey?: string;
}): Promise<CollaborationSearchResultView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.collaboration.use');

  const payload = parseCollaborationPayloadOrThrow(collaborationSearchSchema, {
    keyword: input.keyword ?? '',
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    includeArchived: input.includeArchived ?? false,
    contextKey: input.contextKey ? normalizeCollaborationContextKey(input.contextKey) : undefined
  });

  const { startMs, endMs } = searchDateRange(payload);
  const keyword = (payload.keyword ?? '').trim().toLowerCase();
  const hasKeyword = keyword.length > 0;

  const [messages, notes] = await Promise.all([
    payload.contextKey
      ? db.collaborationMessages.where('contextKey').equals(payload.contextKey).toArray()
      : db.collaborationMessages.toArray(),
    payload.contextKey
      ? db.collaborationNotes.where('contextKey').equals(payload.contextKey).toArray()
      : db.collaborationNotes.toArray()
  ]);

  const messageResults: CollaborationSearchResultView[] = messages
    .filter((record) => (payload.includeArchived ? true : !record.archived))
    .filter((record) => {
      const timestampMs = new Date(record.createdAt).getTime();
      if (startMs !== null && timestampMs < startMs) {
        return false;
      }
      if (endMs !== null && timestampMs > endMs) {
        return false;
      }
      if (!hasKeyword) {
        return true;
      }
      const searchable = `${record.messageBody} ${record.contextLabel}`.toLowerCase();
      return searchable.includes(keyword);
    })
    .map((record) => ({
      resultType: 'message' as const,
      id: record.id,
      contextKey: record.contextKey,
      contextLabel: record.contextLabel,
      body: record.messageBody,
      archived: record.archived,
      timestamp: record.createdAt
    }));

  const noteResults: CollaborationSearchResultView[] = notes
    .filter((record) => (payload.includeArchived ? true : !record.archived))
    .filter((record) => {
      const timestampMs = new Date(record.updatedAt).getTime();
      if (startMs !== null && timestampMs < startMs) {
        return false;
      }
      if (endMs !== null && timestampMs > endMs) {
        return false;
      }
      if (!hasKeyword) {
        return true;
      }
      const searchable = `${record.noteBody} ${record.contextLabel}`.toLowerCase();
      return searchable.includes(keyword);
    })
    .map((record) => ({
      resultType: 'note' as const,
      id: record.id,
      contextKey: record.contextKey,
      contextLabel: record.contextLabel,
      body: record.noteBody,
      archived: record.archived,
      timestamp: record.updatedAt
    }));

  return [...messageResults, ...noteResults].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  );
}

export { normalizeCollaborationContextKey, collaborationContextLabelForPath };
