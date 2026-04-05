import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { createManagedUser } from '../../../src/core/auth/user-admin-service';
import {
  __resetLockManagerStateForTests,
  acquireLeaseLock,
  releaseLeaseLock
} from '../../../src/core/concurrency/lock-manager';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  commitImport,
  exportEntity,
  previewImport
} from '../../../src/core/import-export/import-export-service';

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') {
    return blob.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob payload.'));
    reader.readAsText(blob);
  });
}

describe('import/export service integration', () => {
  const originalBroadcastChannel = globalThis.BroadcastChannel;

  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
    __resetLockManagerStateForTests();
  });

  afterEach(async () => {
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: originalBroadcastChannel,
      configurable: true,
      writable: true
    });

    __resetLockManagerStateForTests();
    logout();
    await db.delete();
  });

  it('exports, previews, and commits entity imports with idempotency + audit coverage', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const now = new Date().toISOString();
    const importPayload = [
      {
        id: 'note-import-1',
        contextKey: '/merchant',
        contextLabel: 'Merchant Console',
        noteBody: 'Imported shared note body',
        archived: false,
        archivedAt: null,
        archivedBy: null,
        createdBy: 'admin-user-id',
        updatedBy: 'admin-user-id',
        createdAt: now,
        updatedAt: now
      }
    ];

    const importFile = new File([JSON.stringify(importPayload)], 'notes-import.json', {
      type: 'application/json'
    });

    const preview = await previewImport({
      file: importFile,
      entityType: 'collaborationNotes',
      format: 'json',
      mode: 'upsert'
    });

    expect(preview.totalRows).toBe(1);
    expect(preview.invalidRows).toBe(0);

    const commitResult = await commitImport(preview);
    expect(commitResult.committedRows).toBe(1);
    expect(await db.collaborationNotes.get('note-import-1')).toBeTruthy();

    await expect(commitImport(preview)).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' });

    const exportArtifact = await exportEntity({
      entityType: 'collaborationNotes',
      format: 'csv'
    });
    expect(exportArtifact.recordCount).toBeGreaterThanOrEqual(1);
    expect(exportArtifact.fileName).toMatch(/collaborationNotes-bulk-\d{8}-\d{6}\.csv/);

    const auditEvents = await db.auditEvents.toArray();
    expect(auditEvents.some((event) => event.actionType === 'IMPORT_ENTITY_COMMITTED')).toBe(true);
    expect(auditEvents.some((event) => event.actionType === 'EXPORT_ENTITY_GENERATED')).toBe(true);
  });

  it('supports workspace backup export/import and blocks locked commit attempts', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await db.collaborationMessages.add({
      id: 'message-seed-1',
      contextKey: '/booking',
      contextLabel: 'Booking Desk',
      messageBody: 'Seed collaboration message',
      source: 'manual',
      archived: false,
      archivedAt: null,
      archivedBy: null,
      createdBy: 'admin-user-id',
      createdAt: new Date().toISOString()
    });

    const backupArtifact = await exportEntity({ entityType: 'workspaceBackup', format: 'json' });
    expect(backupArtifact.fileName).toMatch(/workspace-backup-\d{8}-\d{6}\.json/);
    expect(backupArtifact.recordCount).toBeGreaterThanOrEqual(1);

    const backupFile = new File(
      [await readBlobText(backupArtifact.blob)],
      'workspace-backup.json',
      {
        type: 'application/json'
      }
    );

    const backupPreview = await previewImport({
      file: backupFile,
      entityType: 'workspaceBackup',
      format: 'json',
      mode: 'upsert'
    });

    expect(backupPreview.invalidRows).toBe(0);

    const lock = await acquireLeaseLock({
      resourceKey: 'import-export:workspaceBackup',
      holderTabId: 'external-tab',
      ttlMs: 60_000
    });
    expect(lock.acquired).toBe(true);

    await expect(commitImport(backupPreview)).rejects.toMatchObject({ code: 'LOCK_UNAVAILABLE' });
    await releaseLeaseLock('import-export:workspaceBackup', 'external-tab');

    const committed = await commitImport(backupPreview);
    expect(committed.committedRows).toBeGreaterThanOrEqual(1);

    const auditEvents = await db.auditEvents.toArray();
    expect(
      auditEvents.some((event) => event.actionType === 'EXPORT_WORKSPACE_BACKUP_GENERATED')
    ).toBe(true);
    expect(
      auditEvents.some((event) => event.actionType === 'IMPORT_WORKSPACE_BACKUP_COMMITTED')
    ).toBe(true);
  });

  it('enforces org-admin manage capability for import preview', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await createManagedUser({
      username: 'hr.viewer',
      password: 'password-234',
      confirmPassword: 'password-234',
      roles: ['HRManager']
    });

    logout();
    await login({ username: 'hr.viewer', password: 'password-234' });

    const now = new Date().toISOString();
    const file = new File(
      [
        JSON.stringify([
          {
            id: 'note-hr-denied',
            contextKey: '/org-admin',
            contextLabel: 'Org Admin',
            noteBody: 'Should fail for viewer-only role',
            archived: false,
            archivedAt: null,
            archivedBy: null,
            createdBy: 'viewer',
            updatedBy: 'viewer',
            createdAt: now,
            updatedAt: now
          }
        ])
      ],
      'hr-denied.json',
      { type: 'application/json' }
    );

    await expect(
      previewImport({
        file,
        entityType: 'collaborationNotes',
        format: 'json',
        mode: 'upsert'
      })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('rejects malformed CSV payloads with unterminated quoted fields', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const malformedCsv = [
      'id,contextKey,contextLabel,noteBody,archived,archivedAt,archivedBy,createdBy,updatedBy,createdAt,updatedAt',
      'note-bad-1,/merchant,Merchant Console,"Unclosed note body,false,__NULL__,__NULL__,admin-user-id,admin-user-id,2026-01-01T00:00:00.000Z,2026-01-01T00:00:00.000Z'
    ].join('\n');

    const file = new File([malformedCsv], 'malformed-notes.csv', { type: 'text/csv' });

    await expect(
      previewImport({
        file,
        entityType: 'collaborationNotes',
        format: 'csv',
        mode: 'upsert'
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('hard-blocks import commits when prompt-critical multi-tab support is unavailable', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const now = new Date().toISOString();
    const file = new File(
      [
        JSON.stringify([
          {
            id: 'note-unsupported-1',
            contextKey: '/merchant',
            contextLabel: 'Merchant Console',
            noteBody: 'Should be blocked before commit when BroadcastChannel is unavailable.',
            archived: false,
            archivedAt: null,
            archivedBy: null,
            createdBy: 'admin-user-id',
            updatedBy: 'admin-user-id',
            createdAt: now,
            updatedAt: now
          }
        ])
      ],
      'unsupported-notes.json',
      { type: 'application/json' }
    );

    const preview = await previewImport({
      file,
      entityType: 'collaborationNotes',
      format: 'json',
      mode: 'upsert'
    });

    Object.defineProperty(globalThis, 'BroadcastChannel', {
      value: undefined,
      configurable: true,
      writable: true
    });
    __resetLockManagerStateForTests();

    await expect(commitImport(preview)).rejects.toMatchObject({ code: 'UNSUPPORTED_BROWSER' });
  });

  it('preserves immutable audit trail during replace-mode workspace backup import', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    // Create pre-existing audit events
    const preExistingAuditEvents = await db.auditEvents.toArray();
    expect(preExistingAuditEvents.length).toBeGreaterThan(0);

    const originalIds = preExistingAuditEvents.map((e) => e.id);

    // Build a backup payload with different audit events AND one duplicate
    const duplicateId = originalIds[0];
    const backupPayload = {
      metadata: {
        workspace: 'localops_workspace',
        generatedAt: new Date().toISOString(),
        schemaVersion: 5
      },
      tables: {
        auditEvents: [
          {
            id: duplicateId,
            actorUserId: 'attacker',
            actionType: 'TAMPERED_EVENT',
            entityType: 'user',
            entityId: 'x',
            previousState: null,
            newState: { tampered: true },
            createdAt: new Date().toISOString()
          },
          {
            id: 'new-audit-from-backup-1',
            actorUserId: null,
            actionType: 'HISTORIC_EVENT',
            entityType: 'system',
            entityId: 'sys-1',
            previousState: null,
            newState: { restored: true },
            createdAt: new Date().toISOString()
          }
        ],
        users: [],
        roles: []
      }
    };

    const backupFile = new File([JSON.stringify(backupPayload)], 'audit-test-backup.json', {
      type: 'application/json'
    });

    const preview = await previewImport({
      file: backupFile,
      entityType: 'workspaceBackup',
      format: 'json',
      mode: 'replace'
    });

    await commitImport(preview);

    // Original audit events must still exist (NOT cleared)
    for (const id of originalIds) {
      const record = await db.auditEvents.get(id);
      expect(record).toBeTruthy();
    }

    // Duplicate must NOT have been overwritten — actionType should be original, not TAMPERED_EVENT
    const duplicateRecord = await db.auditEvents.get(duplicateId);
    expect(duplicateRecord).toBeTruthy();
    expect(duplicateRecord!.actionType).not.toBe('TAMPERED_EVENT');

    // New non-duplicate audit event from backup should have been appended
    const appendedRecord = await db.auditEvents.get('new-audit-from-backup-1');
    expect(appendedRecord).toBeTruthy();
    expect(appendedRecord!.actionType).toBe('HISTORIC_EVENT');
  });

  it('rejects workspace backup import with malformed rows missing required id field', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const malformedBackup = {
      metadata: {
        workspace: 'localops_workspace',
        generatedAt: new Date().toISOString(),
        schemaVersion: 5
      },
      tables: {
        users: [
          {
            username: 'no-id-user',
            roles: ['Administrator'],
            status: 'active',
            createdAt: new Date().toISOString()
          }
        ]
      }
    };

    const file = new File([JSON.stringify(malformedBackup)], 'malformed-backup.json', {
      type: 'application/json'
    });

    await expect(
      previewImport({
        file,
        entityType: 'workspaceBackup',
        format: 'json',
        mode: 'replace'
      })
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
