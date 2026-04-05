import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  createSharedNote,
  listCannedResponses,
  listContextHistory,
  listSharedNotes,
  postContextMessage,
  searchCollaborationRecords,
  setContextMessageArchived,
  setSharedNoteArchived
} from '../../../src/modules/collaboration/collaboration-service';

describe('collaboration service integration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('persists context history/notes, supports archive, and searches by keyword/date', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const cannedResponses = await listCannedResponses();
    expect(cannedResponses.length).toBeGreaterThan(0);

    const postedMessage = await postContextMessage({
      contextKey: '/merchant',
      contextLabel: 'Merchant Console',
      messageBody: 'Investigate pricing conflict on combo sync.',
      source: 'manual'
    });

    await postContextMessage({
      contextKey: '/merchant',
      contextLabel: 'Merchant Console',
      messageBody: cannedResponses[0].body,
      source: 'canned'
    });

    const createdNote = await createSharedNote({
      contextKey: '/merchant',
      contextLabel: 'Merchant Console',
      noteBody: 'Shared note: follow up with publisher after review pass.'
    });

    const history = await listContextHistory({ contextKey: '/merchant' });
    const notes = await listSharedNotes({ contextKey: '/merchant' });

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(notes.some((note) => note.id === createdNote.id)).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    const searchResults = await searchCollaborationRecords({
      keyword: 'pricing conflict',
      startDate: today,
      endDate: today,
      contextKey: '/merchant'
    });

    expect(searchResults.some((result) => result.id === postedMessage.id)).toBe(true);

    await setContextMessageArchived({ recordId: postedMessage.id, archived: true });
    await setSharedNoteArchived({ recordId: createdNote.id, archived: true });

    const activeHistory = await listContextHistory({
      contextKey: '/merchant',
      includeArchived: false
    });
    const activeNotes = await listSharedNotes({ contextKey: '/merchant', includeArchived: false });
    const archivedHistory = await listContextHistory({
      contextKey: '/merchant',
      includeArchived: true
    });

    expect(activeHistory.some((record) => record.id === postedMessage.id)).toBe(false);
    expect(activeNotes.some((record) => record.id === createdNote.id)).toBe(false);
    expect(
      archivedHistory.some((record) => record.id === postedMessage.id && record.archived)
    ).toBe(true);

    const auditEvents = await db.auditEvents.toArray();
    expect(
      auditEvents.some(
        (event) =>
          event.actionType === 'COLLABORATION_MESSAGE_POSTED' && event.entityId === postedMessage.id
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) =>
          event.actionType === 'COLLABORATION_NOTE_CREATED' && event.entityId === createdNote.id
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) =>
          event.actionType === 'COLLABORATION_MESSAGE_ARCHIVED' &&
          event.entityId === postedMessage.id
      )
    ).toBe(true);
  });

  it('validates date-range search input', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await expect(
      searchCollaborationRecords({
        keyword: 'anything',
        startDate: '2026-12-31',
        endDate: '2026-01-01'
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps keyword searches isolated when a specific context key is provided', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const merchantMessage = await postContextMessage({
      contextKey: '/merchant',
      contextLabel: 'Merchant Console',
      messageBody: 'Escalate overlapping-keyword incident now.',
      source: 'manual'
    });

    await postContextMessage({
      contextKey: '/booking',
      contextLabel: 'Booking Desk',
      messageBody: 'Escalate overlapping-keyword incident now.',
      source: 'manual'
    });

    const merchantScopedResults = await searchCollaborationRecords({
      keyword: 'overlapping-keyword',
      contextKey: '/merchant'
    });
    const allContextResults = await searchCollaborationRecords({
      keyword: 'overlapping-keyword'
    });

    expect(merchantScopedResults).toHaveLength(1);
    expect(merchantScopedResults[0]?.id).toBe(merchantMessage.id);
    expect(merchantScopedResults[0]?.contextKey).toBe('/merchant');
    expect(allContextResults.length).toBeGreaterThanOrEqual(2);
  });
});
