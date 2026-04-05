import { z } from 'zod';

import { AppError } from '../validation/errors';

export const IMPORT_ENTITY_TYPES = [
  'merchants',
  'bookings',
  'recruitingOffers',
  'orgHierarchyNodes',
  'orgPositions',
  'collaborationMessages',
  'collaborationNotes',
  'workspaceBackup'
] as const;

export type ImportEntityType = (typeof IMPORT_ENTITY_TYPES)[number];

export const importEntityTypeSchema = z.enum(IMPORT_ENTITY_TYPES);
export const importFormatSchema = z.enum(['csv', 'json']);
export const importModeSchema = z.enum(['upsert', 'replace']);

const encryptedFieldSchema = z.object({
  keyVersion: z.number().int().nonnegative(),
  kdfIterations: z.number().int().positive(),
  kdfSalt: z.string().min(1),
  iv: z.string().min(1),
  ciphertext: z.string().min(1)
});

const merchantSnapshotSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  amenities: z.array(z.string()),
  imageAssetId: z.string().nullable()
});

export const merchantImportSchema = z.object({
  id: z.string().min(1),
  workflowState: z.enum(['draft', 'in_review', 'approved', 'rejected', 'published']),
  currentSnapshot: merchantSnapshotSchema,
  latestVersionNo: z.number().int().nonnegative(),
  draftVersionNo: z.number().int().nonnegative(),
  inReviewVersionNo: z.number().int().nullable(),
  publishedVersionNo: z.number().int().nullable(),
  rejectionReason: z.string().nullable(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const bookingImportSchema = z.object({
  id: z.string().min(1),
  resourceId: z.string().min(1),
  resourceLabel: z.string().min(1),
  customerName: z.string().min(1),
  partySize: z.number().int().positive(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  notes: z.string(),
  status: z.enum(['confirmed', 'cancelled', 'late_cancelled']),
  cancellationReason: z.string().nullable(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const recruitingOfferImportSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  positionId: z.string().min(1),
  positionTitle: z.string().min(1),
  departmentId: z.string().min(1),
  departmentName: z.string().min(1),
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  approvalStatus: z.enum(['pending_hr_approval', 'approved', 'rejected']),
  approvalRoutingRole: z.enum([
    'Administrator',
    'MerchantEditor',
    'ContentReviewerPublisher',
    'BookingAgent',
    'HRManager',
    'Recruiter'
  ]),
  rejectionReason: z.string().nullable(),
  compensationEncrypted: encryptedFieldSchema,
  compensationMasked: z.string().min(1),
  approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(),
  signatureTypedName: z.string().nullable(),
  signatureDrawnDataUrl: z.string().nullable(),
  signatureSignedAt: z.string().nullable(),
  onboardingStatus: z.enum(['not_started', 'in_progress', 'complete']),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const orgHierarchyNodeImportSchema = z.object({
  id: z.string().min(1),
  nodeType: z.enum(['organization', 'department', 'grade', 'class']),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const orgPositionImportSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  departmentNodeId: z.string().min(1),
  gradeNodeId: z.string().min(1),
  classNodeId: z.string().min(1),
  responsibilities: z.array(z.string()),
  eligibilityRules: z.array(z.string()),
  headcountLimit: z.number().int().nonnegative(),
  createdBy: z.string().nullable(),
  updatedBy: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export const collaborationMessageImportSchema = z.object({
  id: z.string().min(1),
  contextKey: z.string().min(1),
  contextLabel: z.string().min(1),
  messageBody: z.string().min(1),
  source: z.enum(['manual', 'canned']),
  archived: z.boolean(),
  archivedAt: z.string().nullable(),
  archivedBy: z.string().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1)
});

export const collaborationNoteImportSchema = z.object({
  id: z.string().min(1),
  contextKey: z.string().min(1),
  contextLabel: z.string().min(1),
  noteBody: z.string().min(1),
  archived: z.boolean(),
  archivedAt: z.string().nullable(),
  archivedBy: z.string().nullable(),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

const baseRowSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1)
}).passthrough();

const usersRowSchema = z.object({
  id: z.string().min(1),
  username: z.string().min(1),
  roles: z.array(z.unknown()),
  status: z.string().min(1),
  createdAt: z.string().min(1)
}).passthrough();

const auditEventsRowSchema = z.object({
  id: z.string().min(1),
  actionType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  createdAt: z.string().min(1)
}).passthrough();

const bookingsRowSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  createdAt: z.string().min(1)
}).passthrough();

const recruitingOffersRowSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1).optional(),
  createdAt: z.string().min(1)
}).passthrough();

const rolesRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1)
}).passthrough();

const workspaceBackupTablesSchema = z.object({
  users: z.array(usersRowSchema).optional(),
  roles: z.array(rolesRowSchema).optional(),
  auditEvents: z.array(auditEventsRowSchema).optional(),
  merchants: z.array(baseRowSchema).optional(),
  merchantVersions: z.array(baseRowSchema).optional(),
  merchantMediaAssets: z.array(baseRowSchema).optional(),
  stores: z.array(baseRowSchema).optional(),
  menus: z.array(baseRowSchema).optional(),
  combos: z.array(baseRowSchema).optional(),
  bookings: z.array(bookingsRowSchema).optional(),
  recruitingOfferTemplates: z.array(baseRowSchema).optional(),
  recruitingOffers: z.array(recruitingOffersRowSchema).optional(),
  recruitingOnboardingDocuments: z.array(baseRowSchema).optional(),
  recruitingChecklistItems: z.array(baseRowSchema).optional(),
  orgHierarchyNodes: z.array(baseRowSchema).optional(),
  orgPositions: z.array(baseRowSchema).optional(),
  collaborationMessages: z.array(baseRowSchema).optional(),
  collaborationNotes: z.array(baseRowSchema).optional(),
  collaborationCannedResponses: z.array(baseRowSchema).optional()
});

export const workspaceBackupSchema = z.object({
  metadata: z.object({
    workspace: z.string().min(1),
    generatedAt: z.string().min(1),
    schemaVersion: z.number().int().nonnegative()
  }),
  tables: workspaceBackupTablesSchema
});

export function parseImportPayloadOrThrow<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) {
    return result.data;
  }

  const fieldErrors = Object.entries(result.error.flatten().fieldErrors).reduce<
    Record<string, string[]>
  >((accumulator, [field, value]) => {
    const messages = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [];
    if (messages.length > 0) {
      accumulator[field] = messages;
    }
    return accumulator;
  }, {});

  throw new AppError({
    code: 'VALIDATION_ERROR',
    message: 'Invalid import/export payload.',
    fieldErrors
  });
}
