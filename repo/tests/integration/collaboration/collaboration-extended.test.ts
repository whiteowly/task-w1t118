import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  createCannedResponse,
  createSharedNote,
  listCannedResponses,
  setCannedResponseArchived,
  updateSharedNote
} from '../../../src/modules/collaboration/collaboration-service';

describe('collaboration extended coverage', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('updates a shared note body', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const note = await createSharedNote({
      contextKey: '/merchant',
      contextLabel: 'Merchant Console',
      noteBody: 'Original note body.'
    });

    const updated = await updateSharedNote({
      noteId: note.id,
      noteBody: 'Revised note body with additional detail.'
    });

    expect(updated.id).toBe(note.id);
    expect(updated.noteBody).toBe('Revised note body with additional detail.');
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(note.updatedAt).getTime()
    );
  });

  it('creates a custom canned response', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createCannedResponse({
      title: 'Custom Escalation',
      body: 'This issue has been escalated to the operations lead.',
      tags: ['escalation', 'operations']
    });

    expect(created.id).toBeTruthy();
    expect(created.title).toBe('Custom Escalation');
    expect(created.tags).toEqual(['escalation', 'operations']);

    const all = await listCannedResponses();
    expect(all.some((response) => response.id === created.id)).toBe(true);
  });

  it('archives and restores a canned response', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const created = await createCannedResponse({
      title: 'Archive Test Response',
      body: 'Body for archive test.',
      tags: ['test']
    });

    const archived = await setCannedResponseArchived({ recordId: created.id, archived: true });
    expect(archived.archived).toBe(true);

    const activeList = await listCannedResponses(false);
    expect(activeList.some((response) => response.id === created.id)).toBe(false);

    const archivedList = await listCannedResponses(true);
    expect(archivedList.some((response) => response.id === created.id)).toBe(true);

    const restored = await setCannedResponseArchived({ recordId: created.id, archived: false });
    expect(restored.archived).toBe(false);
  });
});
