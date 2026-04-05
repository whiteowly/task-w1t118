import { get } from 'svelte/store';

import { appendAuditEvent } from '../../core/audit/audit-service';
import {
  db,
  type EncryptedFieldValue,
  type OnboardingChecklistItemStatus,
  type OnboardingProgressStatus,
  type RecruitingOfferRecord,
  type RecruitingOfferTemplateRecord
} from '../../core/db/database';
import { logger } from '../../core/logging/logger';
import { assertCapability, hasCapability } from '../../core/permissions/service';
import { decryptStringAtRest, encryptStringAtRest } from '../../core/security/field-crypto';
import { getWorkspaceFieldEncryptionPassphrase } from '../../core/security/workspace-field-key';
import { AppError } from '../../core/validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { RoleName } from '../../shared/types/auth';
import { ensureOrgAdminSeedData } from '../org-admin/org-admin-structure-service';
import {
  DEFAULT_ONBOARDING_CHECKLIST_ITEMS,
  DEFAULT_RECRUITING_OFFER_TEMPLATES,
  formatCompensationCurrency,
  maskSsn
} from './recruiting-config';
import {
  checklistItemStatusSchema,
  createOfferFromTemplateSchema,
  listChecklistSchema,
  offerDecisionSchema,
  onboardingDocumentSchema,
  parseRecruitingPayloadOrThrow,
  signatureCaptureSchema
} from './recruiting-validation';

interface ActorContext {
  userId: string;
  username: string;
  roles: RoleName[];
}

export interface RecruitingOfferTemplateView {
  id: string;
  name: string;
  positionId: string;
  positionTitle: string;
  compensationPreview: string;
  responsibilities: string[];
  eligibilityRules: string[];
}

export interface RecruitingOfferView {
  id: string;
  templateId: string;
  templateName: string;
  candidateName: string;
  candidateEmail: string;
  positionId: string;
  positionTitle: string;
  departmentName: string;
  approvalStatus: RecruitingOfferRecord['approvalStatus'];
  approvalRoutingRole: RoleName;
  rejectionReason: string | null;
  compensationDisplay: string;
  signatureTypedName: string | null;
  signatureSignedAt: string | null;
  onboardingStatus: OnboardingProgressStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingDocumentView {
  id: string;
  offerId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  ssnMasked: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  updatedAt: string;
}

export interface OnboardingChecklistItemView {
  id: string;
  offerId: string;
  itemCode: string;
  label: string;
  status: OnboardingChecklistItemStatus;
  updatedAt: string;
}

function getActorOrThrow(): ActorContext {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An authenticated session is required for recruiting operations.'
    });
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    roles: session.user.roles
  };
}

export function canManageRecruitingActions(roles: RoleName[]): boolean {
  return hasCapability(roles, 'workspace.recruiting.manage');
}

export function canApproveRecruitingActions(roles: RoleName[]): boolean {
  return hasCapability(roles, 'workspace.recruiting.approve');
}

function compensationAadContext(offerId: string): string {
  return `localops.recruiting.offer.${offerId}.compensation`;
}

function ssnAadContext(offerId: string): string {
  return `localops.recruiting.offer.${offerId}.ssn`;
}

function maskedCompensation(amountCents: number, currency: string): string {
  const roundedThousands = Math.round(amountCents / 100_000) * 1_000;
  return `${currency} ~${roundedThousands / 1_000}k band`;
}

function overallChecklistStatus(
  statuses: OnboardingChecklistItemStatus[]
): OnboardingProgressStatus {
  if (statuses.length > 0 && statuses.every((status) => status === 'complete')) {
    return 'complete';
  }

  if (statuses.some((status) => status !== 'not_started')) {
    return 'in_progress';
  }

  return 'not_started';
}

function mapTemplateView(
  template: RecruitingOfferTemplateRecord,
  positionTitle: string
): RecruitingOfferTemplateView {
  return {
    id: template.id,
    name: template.name,
    positionId: template.positionId,
    positionTitle,
    compensationPreview: formatCompensationCurrency(
      template.compensationAmountCents,
      template.compensationCurrency
    ),
    responsibilities: [...template.responsibilities],
    eligibilityRules: [...template.eligibilityRules]
  };
}

function mapOfferView(
  offer: RecruitingOfferRecord,
  templateName: string,
  compensationDisplay: string
): RecruitingOfferView {
  return {
    id: offer.id,
    templateId: offer.templateId,
    templateName,
    candidateName: offer.candidateName,
    candidateEmail: offer.candidateEmail,
    positionId: offer.positionId,
    positionTitle: offer.positionTitle,
    departmentName: offer.departmentName,
    approvalStatus: offer.approvalStatus,
    approvalRoutingRole: offer.approvalRoutingRole,
    rejectionReason: offer.rejectionReason,
    compensationDisplay,
    signatureTypedName: offer.signatureTypedName,
    signatureSignedAt: offer.signatureSignedAt,
    onboardingStatus: offer.onboardingStatus,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt
  };
}

async function ensureRecruitingTemplateSeedData(): Promise<void> {
  await ensureOrgAdminSeedData();
  if ((await db.recruitingOfferTemplates.count()) > 0) {
    return;
  }

  const now = new Date().toISOString();
  const existingPositions = new Set(
    (await db.orgPositions.toArray()).map((position) => position.id)
  );
  const templatesToSeed = DEFAULT_RECRUITING_OFFER_TEMPLATES.filter((template) =>
    existingPositions.has(template.positionId)
  ).map((template) => ({
    id: template.id,
    name: template.name,
    positionId: template.positionId,
    compensationAmountCents: template.compensationAmountCents,
    compensationCurrency: template.compensationCurrency,
    responsibilities: [...template.responsibilities],
    eligibilityRules: [...template.eligibilityRules],
    createdAt: now,
    updatedAt: now
  }));

  if (templatesToSeed.length === 0) {
    logger.warn('recruiting', 'No templates seeded because seeded positions are missing.');
    return;
  }

  await db.recruitingOfferTemplates.bulkPut(templatesToSeed);
  logger.info('recruiting', 'Seeded recruiting offer templates.', {
    templateCount: templatesToSeed.length
  });
}

async function ensureChecklistForOffer(
  offerId: string,
  actorUserId: string,
  nowIso: string
): Promise<void> {
  const existingItems = await db.recruitingChecklistItems
    .where('offerId')
    .equals(offerId)
    .toArray();
  if (existingItems.length > 0) {
    return;
  }

  await db.recruitingChecklistItems.bulkAdd(
    DEFAULT_ONBOARDING_CHECKLIST_ITEMS.map((item) => ({
      id: crypto.randomUUID(),
      offerId,
      itemCode: item.itemCode,
      label: item.label,
      status: 'not_started',
      updatedBy: actorUserId,
      updatedAt: nowIso
    }))
  );
}

function fieldEnvelopeFromUnknown(value: unknown): EncryptedFieldValue {
  if (!value || typeof value !== 'object') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Encrypted compensation payload is invalid.'
    });
  }

  const envelope = value as EncryptedFieldValue;
  if (
    !envelope.ciphertext ||
    !envelope.iv ||
    !envelope.kdfSalt ||
    typeof envelope.kdfIterations !== 'number'
  ) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Encrypted compensation payload is missing required fields.'
    });
  }

  return envelope;
}

async function decryptCompensationForOffer(offer: RecruitingOfferRecord): Promise<string> {
  const passphrase = getWorkspaceFieldEncryptionPassphrase();
  const decrypted = await decryptStringAtRest({
    envelope: fieldEnvelopeFromUnknown(offer.compensationEncrypted),
    passphrase,
    aadContext: compensationAadContext(offer.id)
  });

  const parsed = JSON.parse(decrypted) as { amountCents: number; currency: string };
  return formatCompensationCurrency(parsed.amountCents, parsed.currency);
}

async function requireOfferOrThrow(offerId: string): Promise<RecruitingOfferRecord> {
  const offer = await db.recruitingOffers.get(offerId);
  if (!offer) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Offer was not found.' });
  }
  return offer;
}

export async function listOfferTemplates(): Promise<RecruitingOfferTemplateView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.view');
  await ensureRecruitingTemplateSeedData();

  const [templates, positions] = await Promise.all([
    db.recruitingOfferTemplates.toArray(),
    db.orgPositions.toArray()
  ]);

  const positionNames = new Map(positions.map((position) => [position.id, position.title]));

  return templates
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((template) =>
      mapTemplateView(template, positionNames.get(template.positionId) ?? template.positionId)
    );
}

export async function createOfferFromTemplate(input: {
  templateId: string;
  candidateName: string;
  candidateEmail: string;
}): Promise<RecruitingOfferView> {
  const payload = parseRecruitingPayloadOrThrow(createOfferFromTemplateSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.manage');
  await ensureRecruitingTemplateSeedData();

  const template = await db.recruitingOfferTemplates.get(payload.templateId);

  if (!template) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Offer template was not found.' });
  }

  const linkedPosition = await db.orgPositions.get(template.positionId);
  if (!linkedPosition) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Offer template points to a missing position definition.'
    });
  }

  const departmentNode = await db.orgHierarchyNodes.get(linkedPosition.departmentNodeId);
  if (!departmentNode) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Position department node is missing.'
    });
  }

  const now = new Date().toISOString();
  const offerId = crypto.randomUUID();

  const passphrase = getWorkspaceFieldEncryptionPassphrase();
  const compensationEncrypted = (await encryptStringAtRest({
    plaintext: JSON.stringify({
      amountCents: template.compensationAmountCents,
      currency: template.compensationCurrency
    }),
    passphrase,
    aadContext: compensationAadContext(offerId)
  })) as EncryptedFieldValue;

  const compensationDisplay = maskedCompensation(
    template.compensationAmountCents,
    template.compensationCurrency
  );

  await db.transaction(
    'rw',
    db.recruitingOffers,
    db.recruitingChecklistItems,
    db.auditEvents,
    async () => {
      await db.recruitingOffers.add({
        id: offerId,
        templateId: template.id,
        positionId: linkedPosition.id,
        positionTitle: linkedPosition.title,
        departmentId: linkedPosition.departmentNodeId,
        departmentName: departmentNode.name,
        candidateName: payload.candidateName,
        candidateEmail: payload.candidateEmail,
        approvalStatus: 'pending_hr_approval',
        approvalRoutingRole: 'HRManager',
        rejectionReason: null,
        compensationEncrypted,
        compensationMasked: compensationDisplay,
        approvedBy: null,
        approvedAt: null,
        signatureTypedName: null,
        signatureDrawnDataUrl: null,
        signatureSignedAt: null,
        onboardingStatus: 'not_started',
        createdBy: actor.userId,
        updatedBy: actor.userId,
        createdAt: now,
        updatedAt: now
      });

      await ensureChecklistForOffer(offerId, actor.userId, now);

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'RECRUITING_OFFER_CREATED',
        entityType: 'recruitingOffer',
        entityId: offerId,
        previousState: null,
        newState: {
          templateId: template.id,
          positionId: linkedPosition.id,
          approvalStatus: 'pending_hr_approval',
          approvalRoutingRole: 'HRManager'
        }
      });
    }
  );

  logger.info('recruiting', 'Created recruiting offer from template.', {
    actorUserId: actor.userId,
    offerId,
    templateId: template.id,
    approvalRoutingRole: 'HRManager'
  });

  const created = await requireOfferOrThrow(offerId);
  return mapOfferView(created, template.name, compensationDisplay);
}

export async function listRecruitingOffers(): Promise<RecruitingOfferView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.view');
  await ensureRecruitingTemplateSeedData();

  const [offers, templates] = await Promise.all([
    db.recruitingOffers.orderBy('updatedAt').reverse().toArray(),
    db.recruitingOfferTemplates.toArray()
  ]);

  const templateById = new Map(templates.map((template) => [template.id, template]));

  const offerViews = await Promise.all(
    offers.map(async (offer) => {
      const templateName = templateById.get(offer.templateId)?.name ?? offer.templateId;
      let compensationDisplay = offer.compensationMasked;

      try {
        compensationDisplay = await decryptCompensationForOffer(offer);
      } catch {
        compensationDisplay = offer.compensationMasked;
      }

      return mapOfferView(offer, templateName, compensationDisplay);
    })
  );

  return offerViews;
}

export async function approveOffer(input: {
  offerId: string;
  reason?: string;
}): Promise<RecruitingOfferView> {
  const payload = parseRecruitingPayloadOrThrow(offerDecisionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.approve');

  const offer = await requireOfferOrThrow(payload.offerId);
  if (offer.approvalStatus !== 'pending_hr_approval') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Only offers pending HR approval can be approved.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.recruitingOffers, db.auditEvents, async () => {
    await db.recruitingOffers.update(offer.id, {
      approvalStatus: 'approved',
      rejectionReason: null,
      approvedBy: actor.userId,
      approvedAt: now,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'RECRUITING_OFFER_APPROVED',
      entityType: 'recruitingOffer',
      entityId: offer.id,
      previousState: { approvalStatus: offer.approvalStatus },
      newState: {
        approvalStatus: 'approved',
        approvedBy: actor.userId,
        reason: payload.reason ?? null
      }
    });
  });

  logger.info('recruiting', 'Approved recruiting offer.', {
    actorUserId: actor.userId,
    offerId: offer.id
  });

  const updated = await requireOfferOrThrow(offer.id);
  const template = await db.recruitingOfferTemplates.get(updated.templateId);
  return mapOfferView(
    updated,
    template?.name ?? updated.templateId,
    (await decryptCompensationForOffer(updated).catch(() => updated.compensationMasked)) ??
      updated.compensationMasked
  );
}

export async function rejectOffer(input: {
  offerId: string;
  reason?: string;
}): Promise<RecruitingOfferView> {
  const payload = parseRecruitingPayloadOrThrow(offerDecisionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.approve');

  if (!payload.reason || payload.reason.trim().length === 0) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      message: 'Reject reason is required.',
      fieldErrors: { reason: ['Provide a reason when rejecting an offer.'] }
    });
  }

  const offer = await requireOfferOrThrow(payload.offerId);
  if (offer.approvalStatus !== 'pending_hr_approval') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Only offers pending HR approval can be rejected.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.recruitingOffers, db.auditEvents, async () => {
    await db.recruitingOffers.update(offer.id, {
      approvalStatus: 'rejected',
      rejectionReason: payload.reason,
      approvedBy: null,
      approvedAt: null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'RECRUITING_OFFER_REJECTED',
      entityType: 'recruitingOffer',
      entityId: offer.id,
      previousState: { approvalStatus: offer.approvalStatus },
      newState: { approvalStatus: 'rejected', reason: payload.reason }
    });
  });

  logger.warn('recruiting', 'Rejected recruiting offer.', {
    actorUserId: actor.userId,
    offerId: offer.id
  });

  const updated = await requireOfferOrThrow(offer.id);
  const template = await db.recruitingOfferTemplates.get(updated.templateId);
  return mapOfferView(updated, template?.name ?? updated.templateId, updated.compensationMasked);
}

export async function captureOfferSignature(input: {
  offerId: string;
  typedSignerName: string;
  drawnSignatureDataUrl?: string;
}): Promise<RecruitingOfferView> {
  const payload = parseRecruitingPayloadOrThrow(signatureCaptureSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.manage');

  const offer = await requireOfferOrThrow(payload.offerId);
  if (offer.approvalStatus !== 'approved') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Offer must be approved before capturing e-signature.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.recruitingOffers, db.auditEvents, async () => {
    await db.recruitingOffers.update(offer.id, {
      signatureTypedName: payload.typedSignerName,
      signatureDrawnDataUrl: payload.drawnSignatureDataUrl || null,
      signatureSignedAt: now,
      onboardingStatus:
        offer.onboardingStatus === 'not_started' ? 'in_progress' : offer.onboardingStatus,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'RECRUITING_OFFER_SIGNATURE_CAPTURED',
      entityType: 'recruitingOffer',
      entityId: offer.id,
      previousState: {
        signatureTypedName: offer.signatureTypedName,
        signatureSignedAt: offer.signatureSignedAt
      },
      newState: {
        signatureTypedName: payload.typedSignerName,
        signatureDrawnProvided: Boolean(payload.drawnSignatureDataUrl)
      }
    });
  });

  logger.info('recruiting', 'Captured offer signature.', {
    actorUserId: actor.userId,
    offerId: offer.id,
    drawnSignatureProvided: Boolean(payload.drawnSignatureDataUrl)
  });

  const updated = await requireOfferOrThrow(offer.id);
  const template = await db.recruitingOfferTemplates.get(updated.templateId);
  return mapOfferView(updated, template?.name ?? updated.templateId, updated.compensationMasked);
}

export async function upsertOnboardingDocument(input: {
  offerId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  ssn: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}): Promise<OnboardingDocumentView> {
  const payload = parseRecruitingPayloadOrThrow(onboardingDocumentSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.manage');

  const offer = await requireOfferOrThrow(payload.offerId);
  if (offer.approvalStatus !== 'approved') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Offer must be approved before onboarding documents are collected.'
    });
  }

  const now = new Date().toISOString();
  const existing = await db.recruitingOnboardingDocuments.where('offerId').equals(offer.id).first();
  const passphrase = getWorkspaceFieldEncryptionPassphrase();

  const ssnEncrypted = (await encryptStringAtRest({
    plaintext: payload.ssn,
    passphrase,
    aadContext: ssnAadContext(offer.id)
  })) as EncryptedFieldValue;

  const ssnMasked = maskSsn(payload.ssn);

  await db.transaction(
    'rw',
    db.recruitingOnboardingDocuments,
    db.recruitingOffers,
    db.auditEvents,
    async () => {
      const recordId = existing?.id ?? crypto.randomUUID();

      await db.recruitingOnboardingDocuments.put({
        id: recordId,
        offerId: offer.id,
        legalName: payload.legalName,
        addressLine1: payload.addressLine1,
        city: payload.city,
        stateProvince: payload.stateProvince,
        postalCode: payload.postalCode,
        ssnEncrypted,
        ssnMasked,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        createdBy: existing?.createdBy ?? actor.userId,
        updatedBy: actor.userId,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });

      await db.recruitingOffers.update(offer.id, {
        onboardingStatus:
          offer.onboardingStatus === 'not_started' ? 'in_progress' : offer.onboardingStatus,
        updatedBy: actor.userId,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: existing
          ? 'RECRUITING_ONBOARDING_DOCUMENT_UPDATED'
          : 'RECRUITING_ONBOARDING_DOCUMENT_CREATED',
        entityType: 'recruitingOnboardingDocument',
        entityId: recordId,
        previousState: existing
          ? {
              legalName: existing.legalName,
              ssnMasked: existing.ssnMasked
            }
          : null,
        newState: {
          legalName: payload.legalName,
          ssnMasked,
          offerId: offer.id
        }
      });
    }
  );

  logger.info('recruiting', 'Upserted onboarding document.', {
    actorUserId: actor.userId,
    offerId: offer.id,
    ssnMasked
  });

  const stored = await db.recruitingOnboardingDocuments.where('offerId').equals(offer.id).first();
  if (!stored) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Onboarding document was not found after save.'
    });
  }

  return {
    id: stored.id,
    offerId: stored.offerId,
    legalName: stored.legalName,
    addressLine1: stored.addressLine1,
    city: stored.city,
    stateProvince: stored.stateProvince,
    postalCode: stored.postalCode,
    ssnMasked: stored.ssnMasked,
    emergencyContactName: stored.emergencyContactName,
    emergencyContactPhone: stored.emergencyContactPhone,
    updatedAt: stored.updatedAt
  };
}

export async function getOnboardingDocument(
  offerId: string
): Promise<OnboardingDocumentView | null> {
  const payload = parseRecruitingPayloadOrThrow(listChecklistSchema, { offerId });
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.view');

  const document = await db.recruitingOnboardingDocuments
    .where('offerId')
    .equals(payload.offerId)
    .first();
  if (!document) {
    return null;
  }

  return {
    id: document.id,
    offerId: document.offerId,
    legalName: document.legalName,
    addressLine1: document.addressLine1,
    city: document.city,
    stateProvince: document.stateProvince,
    postalCode: document.postalCode,
    ssnMasked: document.ssnMasked,
    emergencyContactName: document.emergencyContactName,
    emergencyContactPhone: document.emergencyContactPhone,
    updatedAt: document.updatedAt
  };
}

export async function listOnboardingChecklist(
  offerId: string
): Promise<OnboardingChecklistItemView[]> {
  const payload = parseRecruitingPayloadOrThrow(listChecklistSchema, { offerId });
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.view');

  await requireOfferOrThrow(payload.offerId);

  await ensureChecklistForOffer(payload.offerId, actor.userId, new Date().toISOString());

  const items = await db.recruitingChecklistItems
    .where('offerId')
    .equals(payload.offerId)
    .toArray();
  return items
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((item) => ({
      id: item.id,
      offerId: item.offerId,
      itemCode: item.itemCode,
      label: item.label,
      status: item.status,
      updatedAt: item.updatedAt
    }));
}

export async function updateChecklistItemStatus(input: {
  offerId: string;
  checklistItemId: string;
  status: OnboardingChecklistItemStatus;
}): Promise<OnboardingChecklistItemView[]> {
  const payload = parseRecruitingPayloadOrThrow(checklistItemStatusSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.recruiting.manage');

  const [offer, checklistItem] = await Promise.all([
    requireOfferOrThrow(payload.offerId),
    db.recruitingChecklistItems.get(payload.checklistItemId)
  ]);

  if (offer.approvalStatus !== 'approved') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Offer must be approved before onboarding checklist changes are allowed.'
    });
  }

  if (!checklistItem || checklistItem.offerId !== offer.id) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Checklist item was not found for the selected offer.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction(
    'rw',
    db.recruitingChecklistItems,
    db.recruitingOffers,
    db.auditEvents,
    async () => {
      await db.recruitingChecklistItems.update(checklistItem.id, {
        status: payload.status,
        updatedBy: actor.userId,
        updatedAt: now
      });

      const allItems = await db.recruitingChecklistItems
        .where('offerId')
        .equals(offer.id)
        .toArray();
      const nextOverallStatus = overallChecklistStatus(
        allItems.map((item) => (item.id === checklistItem.id ? payload.status : item.status))
      );

      await db.recruitingOffers.update(offer.id, {
        onboardingStatus: nextOverallStatus,
        updatedBy: actor.userId,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'RECRUITING_CHECKLIST_ITEM_STATUS_UPDATED',
        entityType: 'recruitingChecklistItem',
        entityId: checklistItem.id,
        previousState: { status: checklistItem.status, offerId: offer.id },
        newState: {
          status: payload.status,
          offerId: offer.id,
          onboardingStatus: nextOverallStatus
        }
      });
    }
  );

  logger.info('recruiting', 'Updated onboarding checklist status.', {
    actorUserId: actor.userId,
    offerId: offer.id,
    checklistItemId: checklistItem.id,
    status: payload.status
  });

  return listOnboardingChecklist(offer.id);
}
