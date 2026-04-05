import { get } from 'svelte/store';
import type { Table } from 'dexie';

import { appendAuditEvent } from '../audit/audit-service';
import { assertPromptCriticalMutationSupportOrThrow } from '../concurrency/browser-support';
import { acquireLeaseLock, releaseLeaseLock } from '../concurrency/lock-manager';
import { db } from '../db/database';
import { logger } from '../logging/logger';
import { assertCapability } from '../permissions/service';
import { AppError } from '../validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { RoleName } from '../../shared/types/auth';
import {
  IMPORT_ENTITY_TYPES,
  bookingImportSchema,
  collaborationMessageImportSchema,
  collaborationNoteImportSchema,
  importEntityTypeSchema,
  importFormatSchema,
  importModeSchema,
  merchantImportSchema,
  orgHierarchyNodeImportSchema,
  orgPositionImportSchema,
  parseImportPayloadOrThrow,
  recruitingOfferImportSchema,
  workspaceBackupSchema,
  type ImportEntityType
} from './import-export-validation';

export type ImportFormat = 'csv' | 'json';
export type ImportMode = 'upsert' | 'replace';

const IMPORT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;
const CSV_NULL_TOKEN = '__NULL__';

interface ActorContext {
  userId: string;
  username: string;
  roles: RoleName[];
}

interface EntityAdapter<TRecord extends Record<string, unknown>> {
  label: string;
  keyField: keyof TRecord & string;
  table: () => Table<TRecord, string>;
  validateRecord: (record: unknown) => TRecord;
}

export interface ImportExportEntityOption {
  entityType: ImportEntityType;
  label: string;
  supportedFormats: ImportFormat[];
}

export interface ImportValidationIssue {
  rowNumber: number;
  message: string;
}

export interface ImportPreview {
  entityType: ImportEntityType;
  format: ImportFormat;
  mode: ImportMode;
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  fingerprint: string;
  validationIssues: ImportValidationIssue[];
  records: Record<string, unknown>[];
  backupTables?: Record<string, Record<string, unknown>[]>;
}

export interface ImportCommitResult {
  entityType: ImportEntityType;
  mode: ImportMode;
  committedRows: number;
  fingerprint: string;
}

export interface ExportArtifact {
  entityType: ImportEntityType;
  format: ImportFormat;
  blob: Blob;
  fileName: string;
  mimeType: string;
  recordCount: number;
}

function getActorOrThrow(): ActorContext {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An authenticated session is required for import/export operations.'
    });
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    roles: session.user.roles
  };
}

function parseJsonRecordArrayOrThrow(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Import JSON must be an array of records.'
    });
  }

  return parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Import JSON contains an invalid non-object record.'
      });
    }
    return entry as Record<string, unknown>;
  });
}

async function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read import file.'));
    reader.readAsText(file);
  });
}

function parseCsvTable(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        field += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      field += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Malformed CSV: unterminated quoted field.'
    });
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  const contentRows = rows.slice(1);

  return contentRows
    .filter((contentRow) => contentRow.some((value) => value.trim().length > 0))
    .map((contentRow) =>
      Object.fromEntries(
        headers.map((header, headerIndex) => [header, contentRow[headerIndex] ?? ''])
      )
    );
}

function parseSmartCsvCell(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === CSV_NULL_TOKEN) {
    return null;
  }

  if (trimmed.length === 0) {
    return '';
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }

  return value;
}

function parseCsvRecordArrayOrThrow(text: string): Record<string, unknown>[] {
  const rawRows = parseCsvTable(text);
  return rawRows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, parseSmartCsvCell(value)]))
  );
}

function serializeCsvCell(value: unknown): string {
  let stringValue = '';

  if (value === null) {
    stringValue = CSV_NULL_TOKEN;
  } else if (value === undefined) {
    stringValue = '';
  } else if (typeof value === 'string') {
    stringValue = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    stringValue = String(value);
  } else {
    stringValue = JSON.stringify(value);
  }

  const requiresQuote =
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    /^\s|\s$/.test(stringValue);

  if (!requiresQuote) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function recordsToCsv(records: Record<string, unknown>[]): string {
  if (records.length === 0) {
    return '';
  }

  const headerSet = new Set<string>();
  records.forEach((record) => {
    Object.keys(record).forEach((key) => headerSet.add(key));
  });
  const headers = [...headerSet];

  const lines = [headers.map((header) => serializeCsvCell(header)).join(',')];
  for (const record of records) {
    lines.push(headers.map((header) => serializeCsvCell(record[header])).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }

  return Math.abs(hash >>> 0).toString(16);
}

function dateStampForFile(value: Date): string {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  const hours = `${value.getHours()}`.padStart(2, '0');
  const minutes = `${value.getMinutes()}`.padStart(2, '0');
  const seconds = `${value.getSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function inferMimeType(format: ImportFormat): string {
  return format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
}

const WORKSPACE_BACKUP_TABLE_NAMES = [
  'users',
  'roles',
  'merchants',
  'merchantVersions',
  'merchantMediaAssets',
  'stores',
  'menus',
  'combos',
  'bookings',
  'recruitingOfferTemplates',
  'recruitingOffers',
  'recruitingOnboardingDocuments',
  'recruitingChecklistItems',
  'orgHierarchyNodes',
  'orgPositions',
  'collaborationMessages',
  'collaborationNotes',
  'collaborationCannedResponses'
] as const;

const ENTITY_ADAPTERS: Record<Exclude<ImportEntityType, 'workspaceBackup'>, EntityAdapter<any>> = {
  merchants: {
    label: 'Merchants',
    keyField: 'id',
    table: () => db.merchants,
    validateRecord: (record) => parseImportPayloadOrThrow(merchantImportSchema, record)
  },
  bookings: {
    label: 'Bookings',
    keyField: 'id',
    table: () => db.bookings,
    validateRecord: (record) => parseImportPayloadOrThrow(bookingImportSchema, record)
  },
  recruitingOffers: {
    label: 'Recruiting offers',
    keyField: 'id',
    table: () => db.recruitingOffers,
    validateRecord: (record) => parseImportPayloadOrThrow(recruitingOfferImportSchema, record)
  },
  orgHierarchyNodes: {
    label: 'Org hierarchy nodes',
    keyField: 'id',
    table: () => db.orgHierarchyNodes,
    validateRecord: (record) => parseImportPayloadOrThrow(orgHierarchyNodeImportSchema, record)
  },
  orgPositions: {
    label: 'Org positions',
    keyField: 'id',
    table: () => db.orgPositions,
    validateRecord: (record) => parseImportPayloadOrThrow(orgPositionImportSchema, record)
  },
  collaborationMessages: {
    label: 'Collaboration messages',
    keyField: 'id',
    table: () => db.collaborationMessages,
    validateRecord: (record) => parseImportPayloadOrThrow(collaborationMessageImportSchema, record)
  },
  collaborationNotes: {
    label: 'Collaboration notes',
    keyField: 'id',
    table: () => db.collaborationNotes,
    validateRecord: (record) => parseImportPayloadOrThrow(collaborationNoteImportSchema, record)
  }
};

export const IMPORT_EXPORT_ENTITY_OPTIONS: ImportExportEntityOption[] = [
  ...Object.entries(ENTITY_ADAPTERS).map(([entityType, adapter]) => ({
    entityType: entityType as Exclude<ImportEntityType, 'workspaceBackup'>,
    label: adapter.label,
    supportedFormats: ['json', 'csv'] as ImportFormat[]
  })),
  {
    entityType: 'workspaceBackup',
    label: 'Workspace backup',
    supportedFormats: ['json']
  }
];

function parseEntityRecordsOrThrow(
  format: ImportFormat,
  text: string,
  entityType: Exclude<ImportEntityType, 'workspaceBackup'>
): {
  validRecords: Record<string, unknown>[];
  validationIssues: ImportValidationIssue[];
  totalRows: number;
} {
  const adapter = ENTITY_ADAPTERS[entityType];
  const rawRecords =
    format === 'json' ? parseJsonRecordArrayOrThrow(text) : parseCsvRecordArrayOrThrow(text);

  const validRecords: Record<string, unknown>[] = [];
  const validationIssues: ImportValidationIssue[] = [];

  rawRecords.forEach((record, index) => {
    try {
      const validatedRecord = adapter.validateRecord(record);
      validRecords.push(validatedRecord as Record<string, unknown>);
    } catch (error) {
      validationIssues.push({
        rowNumber: index + 1,
        message: error instanceof Error ? error.message : 'Unknown validation error.'
      });
    }
  });

  return {
    validRecords,
    validationIssues,
    totalRows: rawRecords.length
  };
}

function idempotencyKeyForPreview(preview: ImportPreview): string {
  return `import.${preview.entityType}.${preview.mode}.${preview.fingerprint}`;
}

async function assertIdempotencyKeyAvailableOrThrow(key: string, nowIso: string): Promise<void> {
  const existing = await db.idempotencyKeys.get(key);
  if (!existing) {
    return;
  }

  if (new Date(existing.expiresAt).getTime() <= new Date(nowIso).getTime()) {
    await db.idempotencyKeys.delete(key);
    return;
  }

  throw new AppError({
    code: 'DUPLICATE_REQUEST',
    message: 'Duplicate import commit blocked by idempotency guard.'
  });
}

async function writeImportIdempotencyRecord(input: {
  key: string;
  operationType: string;
  requestHash: string;
  responseHash: string;
  nowIso: string;
}): Promise<void> {
  await db.idempotencyKeys.put({
    key: input.key,
    operationType: input.operationType,
    requestHash: input.requestHash,
    responseHash: input.responseHash,
    createdAt: input.nowIso,
    expiresAt: new Date(new Date(input.nowIso).getTime() + IMPORT_IDEMPOTENCY_TTL_MS).toISOString()
  });
}

export function listImportExportEntityOptions(): ImportExportEntityOption[] {
  return [...IMPORT_EXPORT_ENTITY_OPTIONS];
}

export async function previewImport(input: {
  file: File;
  format: ImportFormat;
  entityType: ImportEntityType;
  mode: ImportMode;
}): Promise<ImportPreview> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');

  const format = parseImportPayloadOrThrow(importFormatSchema, input.format);
  const entityType = parseImportPayloadOrThrow(importEntityTypeSchema, input.entityType);
  const mode = parseImportPayloadOrThrow(importModeSchema, input.mode);

  if (!input.file) {
    throw new AppError({ code: 'VALIDATION_ERROR', message: 'Import file is required.' });
  }

  const fileText = await readFileText(input.file);
  if (fileText.trim().length === 0) {
    throw new AppError({ code: 'VALIDATION_ERROR', message: 'Import file is empty.' });
  }

  if (entityType === 'workspaceBackup') {
    if (format !== 'json') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Workspace backup import supports JSON only.'
      });
    }

    const payload = parseImportPayloadOrThrow(workspaceBackupSchema, JSON.parse(fileText));
    const allBackupTableNames = [...WORKSPACE_BACKUP_TABLE_NAMES, 'auditEvents'] as const;
    const knownTables = Object.fromEntries(
      allBackupTableNames.map((tableName) => [tableName, payload.tables[tableName] ?? []])
    ) as Record<string, Record<string, unknown>[]>;

    const totalRows = Object.values(knownTables).reduce(
      (total, tableRows) => total + tableRows.length,
      0
    );

    const fingerprint = hashString(JSON.stringify(payload));

    return {
      entityType,
      format,
      mode,
      fileName: input.file.name,
      totalRows,
      validRows: totalRows,
      invalidRows: 0,
      fingerprint,
      validationIssues: [],
      records: [],
      backupTables: knownTables
    };
  }

  const parsedEntityType = entityType as Exclude<ImportEntityType, 'workspaceBackup'>;
  const { validRecords, validationIssues, totalRows } = parseEntityRecordsOrThrow(
    format,
    fileText,
    parsedEntityType
  );

  const fingerprint = hashString(
    JSON.stringify({
      entityType,
      format,
      mode,
      records: validRecords
    })
  );

  logger.info('importExport', 'Prepared import preview.', {
    actorUserId: actor.userId,
    entityType,
    format,
    totalRows,
    validRows: validRecords.length,
    invalidRows: validationIssues.length
  });

  return {
    entityType,
    format,
    mode,
    fileName: input.file.name,
    totalRows,
    validRows: validRecords.length,
    invalidRows: validationIssues.length,
    fingerprint,
    validationIssues,
    records: validRecords
  };
}

export async function commitImport(preview: ImportPreview): Promise<ImportCommitResult> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');
  assertPromptCriticalMutationSupportOrThrow({ mutationFamily: 'importExport' });

  parseImportPayloadOrThrow(importEntityTypeSchema, preview.entityType);
  parseImportPayloadOrThrow(importFormatSchema, preview.format);
  parseImportPayloadOrThrow(importModeSchema, preview.mode);

  if (preview.invalidRows > 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Import preview contains invalid rows. Resolve issues before commit.',
      details: { invalidRows: preview.invalidRows }
    });
  }

  const holderTabId = crypto.randomUUID();
  const lockResourceKey = `import-export:${preview.entityType}`;
  const lock = await acquireLeaseLock({
    resourceKey: lockResourceKey,
    holderTabId,
    ttlMs: 60_000
  });

  if (!lock.acquired) {
    if (lock.reason === 'UNSUPPORTED_BROWSER') {
      throw new AppError({
        code: 'UNSUPPORTED_BROWSER',
        message:
          'Import commits require BroadcastChannel-enabled multi-tab coordination in this browser.'
      });
    }

    throw new AppError({
      code: 'LOCK_UNAVAILABLE',
      message: 'Import operation is currently locked by another active tab.',
      retryable: true
    });
  }

  try {
    const now = new Date().toISOString();
    const idempotencyKey = idempotencyKeyForPreview(preview);
    await assertIdempotencyKeyAvailableOrThrow(idempotencyKey, now);

    if (preview.entityType === 'workspaceBackup') {
      const backupTables = preview.backupTables ?? {};
      const tableRefs = WORKSPACE_BACKUP_TABLE_NAMES.map((tableName) => db.table(tableName));
      const totalRows = Object.values(backupTables).reduce((total, rows) => total + rows.length, 0);

      await db.transaction('rw', [...tableRefs, db.idempotencyKeys, db.auditEvents], async () => {
        if (preview.mode === 'replace') {
          for (const tableName of WORKSPACE_BACKUP_TABLE_NAMES) {
            await db.table(tableName).clear();
          }
        }

        for (const tableName of WORKSPACE_BACKUP_TABLE_NAMES) {
          const rows = backupTables[tableName] ?? [];
          if (rows.length > 0) {
            await db.table(tableName).bulkPut(rows as never[]);
          }
        }

        // Append audit events from backup — never clear, never overwrite existing records
        const backupAuditRows = backupTables['auditEvents'] ?? [];
        if (backupAuditRows.length > 0) {
          const existingAuditIds = new Set(
            (await db.auditEvents.toArray()).map((e) => e.id)
          );
          const newAuditRows = backupAuditRows.filter(
            (row) => !existingAuditIds.has((row as { id: string }).id)
          );
          if (newAuditRows.length > 0) {
            await db.auditEvents.bulkAdd(newAuditRows as never[]);
          }
        }

        await appendAuditEvent({
          actorUserId: actor.userId,
          actionType: 'IMPORT_WORKSPACE_BACKUP_COMMITTED',
          entityType: 'workspaceBackup',
          entityId: preview.fingerprint,
          previousState: null,
          newState: {
            mode: preview.mode,
            totalRows,
            fileName: preview.fileName
          }
        });

        await writeImportIdempotencyRecord({
          key: idempotencyKey,
          operationType: 'import.workspaceBackup',
          requestHash: preview.fingerprint,
          responseHash: hashString(JSON.stringify({ totalRows, mode: preview.mode })),
          nowIso: now
        });
      });

      logger.info('importExport', 'Committed workspace backup import.', {
        actorUserId: actor.userId,
        mode: preview.mode,
        totalRows
      });

      return {
        entityType: preview.entityType,
        mode: preview.mode,
        committedRows: totalRows,
        fingerprint: preview.fingerprint
      };
    }

    const parsedEntityType = preview.entityType as Exclude<ImportEntityType, 'workspaceBackup'>;
    const adapter = ENTITY_ADAPTERS[parsedEntityType];
    const validatedRecords = preview.records.map((record) =>
      adapter.validateRecord(record)
    ) as Record<string, unknown>[];

    if (validatedRecords.length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: 'Import preview did not produce any valid rows to commit.'
      });
    }

    const table = adapter.table();
    await db.transaction('rw', table, db.idempotencyKeys, db.auditEvents, async () => {
      if (preview.mode === 'replace') {
        await table.clear();
      }

      await table.bulkPut(validatedRecords as never[]);

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'IMPORT_ENTITY_COMMITTED',
        entityType: parsedEntityType,
        entityId: preview.fingerprint,
        previousState: null,
        newState: {
          mode: preview.mode,
          format: preview.format,
          committedRows: validatedRecords.length,
          fileName: preview.fileName
        }
      });

      await writeImportIdempotencyRecord({
        key: idempotencyKey,
        operationType: `import.${parsedEntityType}`,
        requestHash: preview.fingerprint,
        responseHash: hashString(
          JSON.stringify({ committedRows: validatedRecords.length, mode: preview.mode })
        ),
        nowIso: now
      });
    });

    logger.info('importExport', 'Committed entity import.', {
      actorUserId: actor.userId,
      entityType: parsedEntityType,
      mode: preview.mode,
      committedRows: validatedRecords.length
    });

    return {
      entityType: preview.entityType,
      mode: preview.mode,
      committedRows: validatedRecords.length,
      fingerprint: preview.fingerprint
    };
  } finally {
    await releaseLeaseLock(lockResourceKey, holderTabId);
  }
}

async function loadEntityRecords(
  entityType: Exclude<ImportEntityType, 'workspaceBackup'>
): Promise<Record<string, unknown>[]> {
  const adapter = ENTITY_ADAPTERS[entityType];
  return (await adapter.table().toArray()) as Record<string, unknown>[];
}

export async function exportEntity(input: {
  entityType: ImportEntityType;
  format: ImportFormat;
}): Promise<ExportArtifact> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');

  const entityType = parseImportPayloadOrThrow(importEntityTypeSchema, input.entityType);
  const format = parseImportPayloadOrThrow(importFormatSchema, input.format);

  if (entityType === 'workspaceBackup' && format !== 'json') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Workspace backup export supports JSON only.'
    });
  }

  const now = new Date();
  const stamp = dateStampForFile(now);

  if (entityType === 'workspaceBackup') {
    const tables = Object.fromEntries(
      await Promise.all(
        [...WORKSPACE_BACKUP_TABLE_NAMES, 'auditEvents'].map(async (tableName) => [
          tableName,
          await db.table(tableName).toArray()
        ])
      )
    ) as Record<string, unknown[]>;

    const payload = {
      metadata: {
        workspace: 'localops_workspace',
        generatedAt: now.toISOString(),
        schemaVersion: 5
      },
      tables
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: inferMimeType('json') });
    const recordCount = Object.values(tables).reduce((total, records) => total + records.length, 0);
    const fileName = `workspace-backup-${stamp}.json`;

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'EXPORT_WORKSPACE_BACKUP_GENERATED',
      entityType: 'workspaceBackup',
      entityId: fileName,
      previousState: null,
      newState: {
        tableCount: WORKSPACE_BACKUP_TABLE_NAMES.length,
        recordCount
      }
    });

    logger.info('importExport', 'Generated workspace backup export.', {
      actorUserId: actor.userId,
      fileName,
      recordCount
    });

    return {
      entityType,
      format: 'json',
      blob,
      fileName,
      mimeType: inferMimeType('json'),
      recordCount
    };
  }

  const records = await loadEntityRecords(
    entityType as Exclude<ImportEntityType, 'workspaceBackup'>
  );
  const output = format === 'json' ? JSON.stringify(records, null, 2) : recordsToCsv(records);
  const mimeType = inferMimeType(format);
  const extension = format === 'json' ? 'json' : 'csv';
  const fileName = `${entityType}-bulk-${stamp}.${extension}`;
  const blob = new Blob([output], { type: mimeType });

  await appendAuditEvent({
    actorUserId: actor.userId,
    actionType: 'EXPORT_ENTITY_GENERATED',
    entityType,
    entityId: fileName,
    previousState: null,
    newState: {
      format,
      recordCount: records.length
    }
  });

  logger.info('importExport', 'Generated entity export.', {
    actorUserId: actor.userId,
    entityType,
    format,
    fileName,
    recordCount: records.length
  });

  return {
    entityType,
    format,
    blob,
    fileName,
    mimeType,
    recordCount: records.length
  };
}

export { IMPORT_ENTITY_TYPES };
