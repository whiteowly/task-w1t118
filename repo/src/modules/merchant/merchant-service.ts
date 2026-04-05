import { get } from 'svelte/store';

import { appendAuditEvent } from '../../core/audit/audit-service';
import {
  db,
  type ComboRecord,
  type MenuRecord,
  type MerchantRecord,
  type MerchantSnapshot,
  type MerchantVersionRecord,
  type MerchantWorkflowState,
  type StoreRecord
} from '../../core/db/database';
import { logger } from '../../core/logging/logger';
import { assertCapability } from '../../core/permissions/service';
import { AppError } from '../../core/validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { RoleName } from '../../shared/types/auth';
import {
  createComboSchema,
  createMenuSchema,
  createMerchantSchema,
  createStoreSchema,
  parseMerchantPayloadOrThrow,
  updateComboSchema,
  updateMenuSchema,
  updateMerchantDraftSchema,
  updateStoreSchema,
  validateMerchantImageFile,
  workflowTransitionSchema
} from './merchant-validation';

interface ActorContext {
  userId: string;
  username: string;
  roles: RoleName[];
}

function getActorOrThrow(): ActorContext {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An authenticated session is required for merchant operations.'
    });
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    roles: session.user.roles
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read selected image file.'));
    reader.onload = () => resolve(reader.result?.toString() ?? '');
    reader.readAsDataURL(file);
  });
}

function snapshotFromInput(input: {
  name: string;
  description?: string;
  tags?: string[];
  amenities?: string[];
  imageAssetId?: string | null;
}): MerchantSnapshot {
  return {
    name: input.name,
    description: input.description ?? '',
    tags: [...(input.tags ?? [])],
    amenities: [...(input.amenities ?? [])],
    imageAssetId: input.imageAssetId ?? null
  };
}

function mapMerchant(record: MerchantRecord) {
  return {
    id: record.id,
    workflowState: record.workflowState,
    latestVersionNo: record.latestVersionNo,
    draftVersionNo: record.draftVersionNo,
    inReviewVersionNo: record.inReviewVersionNo,
    publishedVersionNo: record.publishedVersionNo,
    rejectionReason: record.rejectionReason,
    snapshot: record.currentSnapshot,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export async function listMerchants() {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const records = await db.merchants.orderBy('updatedAt').reverse().toArray();
  return records.map(mapMerchant);
}

export async function createMerchantDraft(input: {
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
}) {
  const payload = parseMerchantPayloadOrThrow(createMerchantSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const now = new Date().toISOString();
  const merchantId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const snapshot = snapshotFromInput({ ...payload, imageAssetId: null });

  await db.transaction('rw', db.merchants, db.merchantVersions, db.auditEvents, async () => {
    await db.merchants.add({
      id: merchantId,
      workflowState: 'draft',
      currentSnapshot: snapshot,
      latestVersionNo: 1,
      draftVersionNo: 1,
      inReviewVersionNo: null,
      publishedVersionNo: null,
      rejectionReason: null,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      createdAt: now,
      updatedAt: now
    });

    await db.merchantVersions.add({
      id: versionId,
      merchantId,
      versionNo: 1,
      snapshot,
      createdBy: actor.userId,
      createdAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'MERCHANT_CREATED',
      entityType: 'merchant',
      entityId: merchantId,
      previousState: null,
      newState: { workflowState: 'draft', versionNo: 1, name: snapshot.name }
    });
  });

  logger.info('merchant', 'Created merchant draft.', {
    actorUserId: actor.userId,
    merchantId,
    versionNo: 1
  });

  const created = await db.merchants.get(merchantId);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Merchant creation failed unexpectedly.'
    });
  }

  return mapMerchant(created);
}

export async function updateMerchantDraft(input: {
  merchantId: string;
  expectedVersionNo: number;
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
  imageAssetId: string | null;
}) {
  const payload = parseMerchantPayloadOrThrow(updateMerchantDraftSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const merchant = await db.merchants.get(payload.merchantId);
  if (!merchant) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Merchant not found.' });
  }

  if (merchant.workflowState === 'in_review' || merchant.workflowState === 'approved') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Merchant is under review. Reviewer action is required before further draft edits.'
    });
  }

  if (merchant.latestVersionNo !== payload.expectedVersionNo) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Stale merchant version. Refresh and retry your draft update.',
      details: {
        expectedVersionNo: payload.expectedVersionNo,
        latestVersionNo: merchant.latestVersionNo
      }
    });
  }

  const now = new Date().toISOString();
  const newSnapshot = snapshotFromInput(payload);
  const newVersionNo = merchant.latestVersionNo + 1;

  await db.transaction('rw', db.merchants, db.merchantVersions, db.auditEvents, async () => {
    await db.merchantVersions.add({
      id: crypto.randomUUID(),
      merchantId: merchant.id,
      versionNo: newVersionNo,
      snapshot: newSnapshot,
      createdBy: actor.userId,
      createdAt: now
    });

    await db.merchants.update(merchant.id, {
      workflowState: 'draft',
      currentSnapshot: newSnapshot,
      latestVersionNo: newVersionNo,
      draftVersionNo: newVersionNo,
      inReviewVersionNo: null,
      rejectionReason: null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'MERCHANT_DRAFT_UPDATED',
      entityType: 'merchant',
      entityId: merchant.id,
      previousState: {
        workflowState: merchant.workflowState,
        versionNo: merchant.latestVersionNo
      },
      newState: {
        workflowState: 'draft',
        versionNo: newVersionNo
      }
    });
  });

  logger.info('merchant', 'Updated merchant draft.', {
    actorUserId: actor.userId,
    merchantId: merchant.id,
    versionNo: newVersionNo
  });

  const updated = await db.merchants.get(merchant.id);
  if (!updated) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Merchant not found after update.' });
  }

  return mapMerchant(updated);
}

async function requireMerchantForTransition(merchantId: string): Promise<MerchantRecord> {
  const merchant = await db.merchants.get(merchantId);
  if (!merchant) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Merchant not found.' });
  }
  return merchant;
}

function assertMerchantDraftMutationAllowed(merchant: MerchantRecord): void {
  if (merchant.workflowState === 'in_review' || merchant.workflowState === 'approved') {
    throw new AppError({
      code: 'CONFLICT',
      message:
        'Merchant content is under review. Reviewer action is required before editing merchant content.'
    });
  }
}

async function bumpMerchantVersionForContentMutation(input: {
  merchant: MerchantRecord;
  actor: ActorContext;
  now: string;
  triggerActionType:
    | 'STORE_CREATED'
    | 'STORE_UPDATED'
    | 'MENU_CREATED'
    | 'MENU_UPDATED'
    | 'COMBO_CREATED'
    | 'COMBO_UPDATED';
}): Promise<number> {
  const { merchant, actor, now, triggerActionType } = input;
  assertMerchantDraftMutationAllowed(merchant);

  const nextVersionNo = merchant.latestVersionNo + 1;

  await db.merchantVersions.add({
    id: crypto.randomUUID(),
    merchantId: merchant.id,
    versionNo: nextVersionNo,
    snapshot: merchant.currentSnapshot,
    createdBy: actor.userId,
    createdAt: now
  });

  await db.merchants.update(merchant.id, {
    workflowState: 'draft',
    latestVersionNo: nextVersionNo,
    draftVersionNo: nextVersionNo,
    inReviewVersionNo: null,
    rejectionReason: null,
    updatedBy: actor.userId,
    updatedAt: now
  });

  await appendAuditEvent({
    actorUserId: actor.userId,
    actionType: 'MERCHANT_CONTENT_VERSION_BUMPED',
    entityType: 'merchant',
    entityId: merchant.id,
    previousState: {
      workflowState: merchant.workflowState,
      versionNo: merchant.latestVersionNo,
      triggerActionType
    },
    newState: {
      workflowState: 'draft',
      versionNo: nextVersionNo,
      triggerActionType
    }
  });

  return nextVersionNo;
}

export async function submitMerchantForReview(input: { merchantId: string; reason?: string }) {
  const payload = parseMerchantPayloadOrThrow(workflowTransitionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const merchant = await requireMerchantForTransition(payload.merchantId);
  if (merchant.workflowState !== 'draft' && merchant.workflowState !== 'rejected') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Only draft or rejected merchants can be submitted for review.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.merchants, db.auditEvents, async () => {
    await db.merchants.update(merchant.id, {
      workflowState: 'in_review',
      inReviewVersionNo: merchant.draftVersionNo,
      rejectionReason: null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'MERCHANT_SUBMITTED_FOR_REVIEW',
      entityType: 'merchant',
      entityId: merchant.id,
      previousState: { workflowState: merchant.workflowState, versionNo: merchant.draftVersionNo },
      newState: {
        workflowState: 'in_review',
        versionNo: merchant.draftVersionNo,
        reason: payload.reason ?? null
      }
    });
  });

  logger.info('merchant', 'Submitted merchant draft for review.', {
    actorUserId: actor.userId,
    merchantId: merchant.id,
    versionNo: merchant.draftVersionNo
  });
}

export async function approveMerchant(input: { merchantId: string; reason?: string }) {
  const payload = parseMerchantPayloadOrThrow(workflowTransitionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.reviewPublish');

  const merchant = await requireMerchantForTransition(payload.merchantId);
  if (merchant.workflowState !== 'in_review') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Merchant must be in review before approval.'
    });
  }

  const now = new Date().toISOString();

  await db.transaction('rw', db.merchants, db.auditEvents, async () => {
    await db.merchants.update(merchant.id, {
      workflowState: 'approved',
      rejectionReason: null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'MERCHANT_APPROVED',
      entityType: 'merchant',
      entityId: merchant.id,
      previousState: { workflowState: 'in_review', versionNo: merchant.inReviewVersionNo },
      newState: {
        workflowState: 'approved',
        versionNo: merchant.inReviewVersionNo,
        reason: payload.reason ?? null
      }
    });
  });

  logger.info('merchant', 'Approved merchant content.', {
    actorUserId: actor.userId,
    merchantId: merchant.id,
    versionNo: merchant.inReviewVersionNo
  });
}

export async function rejectMerchant(input: { merchantId: string; reason?: string }) {
  const payload = parseMerchantPayloadOrThrow(workflowTransitionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.reviewPublish');

  const merchant = await requireMerchantForTransition(payload.merchantId);
  if (merchant.workflowState !== 'in_review' && merchant.workflowState !== 'approved') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Only in-review or approved merchants can be rejected.'
    });
  }

  const reason = payload.reason?.trim() || 'Reviewer rejected submission.';
  const now = new Date().toISOString();

  await db.transaction('rw', db.merchants, db.auditEvents, async () => {
    await db.merchants.update(merchant.id, {
      workflowState: 'rejected',
      rejectionReason: reason,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'MERCHANT_REJECTED',
      entityType: 'merchant',
      entityId: merchant.id,
      previousState: {
        workflowState: merchant.workflowState,
        versionNo: merchant.inReviewVersionNo
      },
      newState: { workflowState: 'rejected', reason }
    });
  });

  logger.info('merchant', 'Rejected merchant content.', {
    actorUserId: actor.userId,
    merchantId: merchant.id,
    reason
  });
}

export async function publishMerchant(input: { merchantId: string; reason?: string }) {
  const payload = parseMerchantPayloadOrThrow(workflowTransitionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.reviewPublish');

  const merchant = await requireMerchantForTransition(payload.merchantId);
  if (merchant.workflowState !== 'approved') {
    throw new AppError({ code: 'CONFLICT', message: 'Only approved merchants can be published.' });
  }

  const publishedVersionNo = merchant.inReviewVersionNo ?? merchant.draftVersionNo;
  const now = new Date().toISOString();

  await db.transaction('rw', db.merchants, db.auditEvents, async () => {
    await db.merchants.update(merchant.id, {
      workflowState: 'published',
      publishedVersionNo,
      inReviewVersionNo: null,
      rejectionReason: null,
      updatedBy: actor.userId,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'MERCHANT_PUBLISHED',
      entityType: 'merchant',
      entityId: merchant.id,
      previousState: { workflowState: 'approved', versionNo: publishedVersionNo },
      newState: {
        workflowState: 'published',
        versionNo: publishedVersionNo,
        reason: payload.reason ?? null
      }
    });
  });

  logger.info('merchant', 'Published merchant content.', {
    actorUserId: actor.userId,
    merchantId: merchant.id,
    versionNo: publishedVersionNo
  });
}

export async function listMerchantVersions(merchantId: string): Promise<MerchantVersionRecord[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const records = await db.merchantVersions
    .where('merchantId')
    .equals(merchantId)
    .sortBy('versionNo');

  return records.reverse();
}

export async function compareMerchantVersions(
  merchantId: string,
  leftVersionNo: number,
  rightVersionNo: number
): Promise<{ left: MerchantVersionRecord; right: MerchantVersionRecord }> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const [left, right] = await Promise.all([
    db.merchantVersions.where('[merchantId+versionNo]').equals([merchantId, leftVersionNo]).first(),
    db.merchantVersions.where('[merchantId+versionNo]').equals([merchantId, rightVersionNo]).first()
  ]);

  if (!left || !right) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Selected versions are unavailable.' });
  }

  return { left, right };
}

export async function createMediaAsset(input: {
  ownerType: 'merchant' | 'store';
  ownerId: string;
  file: File;
}): Promise<{ assetId: string; dataUrl: string }> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const validated = validateMerchantImageFile(input.file);
  const dataUrl = await fileToDataUrl(validated.file);

  const assetId = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.merchantMediaAssets.add({
    id: assetId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    fileName: validated.file.name,
    mimeType: validated.mimeType,
    sizeBytes: validated.sizeBytes,
    dataUrl,
    createdBy: actor.userId,
    createdAt: now
  });

  return { assetId, dataUrl };
}

export async function getMediaAssetDataUrl(assetId: string | null): Promise<string | null> {
  if (!assetId) {
    return null;
  }

  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const media = await db.merchantMediaAssets.get(assetId);
  return media?.dataUrl ?? null;
}

function mapStore(record: StoreRecord) {
  return {
    id: record.id,
    merchantId: record.merchantId,
    name: record.name,
    description: record.description,
    tags: record.tags,
    amenities: record.amenities,
    imageAssetId: record.imageAssetId,
    updatedAt: record.updatedAt
  };
}

function mapMenu(record: MenuRecord) {
  return {
    id: record.id,
    storeId: record.storeId,
    name: record.name,
    description: record.description,
    updatedAt: record.updatedAt
  };
}

function mapCombo(record: ComboRecord) {
  return {
    id: record.id,
    menuId: record.menuId,
    name: record.name,
    description: record.description,
    priceLabel: record.priceLabel,
    updatedAt: record.updatedAt
  };
}

export async function listStores(merchantId: string) {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const records = await db.stores.where('merchantId').equals(merchantId).sortBy('updatedAt');
  return records.reverse().map(mapStore);
}

export async function createStore(input: {
  merchantId: string;
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
  imageAssetId: string | null;
}) {
  const payload = parseMerchantPayloadOrThrow(createStoreSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  let merchantVersionNo = 0;

  await db.transaction(
    'rw',
    db.merchants,
    db.merchantVersions,
    db.stores,
    db.auditEvents,
    async () => {
      const merchant = await requireMerchantForTransition(payload.merchantId);
      merchantVersionNo = await bumpMerchantVersionForContentMutation({
        merchant,
        actor,
        now,
        triggerActionType: 'STORE_CREATED'
      });

      await db.stores.add({
        id,
        merchantId: payload.merchantId,
        name: payload.name,
        description: payload.description ?? '',
        tags: payload.tags ?? [],
        amenities: payload.amenities ?? [],
        imageAssetId: payload.imageAssetId ?? null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        createdAt: now,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'STORE_CREATED',
        entityType: 'store',
        entityId: id,
        previousState: null,
        newState: { merchantId: payload.merchantId, name: payload.name }
      });
    }
  );

  logger.info('merchant', 'Created store record.', {
    actorUserId: actor.userId,
    merchantId: payload.merchantId,
    storeId: id,
    merchantVersionNo
  });

  const created = await db.stores.get(id);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Store creation failed unexpectedly.'
    });
  }

  return mapStore(created);
}

export async function updateStore(input: {
  storeId: string;
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
  imageAssetId: string | null;
}) {
  const payload = parseMerchantPayloadOrThrow(updateStoreSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const store = await db.stores.get(payload.storeId);
  if (!store) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Store not found.' });
  }

  const now = new Date().toISOString();
  let merchantVersionNo = 0;

  await db.transaction(
    'rw',
    db.merchants,
    db.merchantVersions,
    db.stores,
    db.auditEvents,
    async () => {
      const merchant = await requireMerchantForTransition(store.merchantId);
      merchantVersionNo = await bumpMerchantVersionForContentMutation({
        merchant,
        actor,
        now,
        triggerActionType: 'STORE_UPDATED'
      });

      await db.stores.update(store.id, {
        name: payload.name,
        description: payload.description ?? '',
        tags: payload.tags ?? [],
        amenities: payload.amenities ?? [],
        imageAssetId: payload.imageAssetId ?? null,
        updatedBy: actor.userId,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'STORE_UPDATED',
        entityType: 'store',
        entityId: store.id,
        previousState: { name: store.name },
        newState: { name: payload.name }
      });
    }
  );

  logger.info('merchant', 'Updated store record.', {
    actorUserId: actor.userId,
    merchantId: store.merchantId,
    storeId: store.id,
    merchantVersionNo
  });
}

export async function listMenus(storeId: string) {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const records = await db.menus.where('storeId').equals(storeId).sortBy('updatedAt');
  return records.reverse().map(mapMenu);
}

export async function createMenu(input: { storeId: string; name: string; description: string }) {
  const payload = parseMerchantPayloadOrThrow(createMenuSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const store = await db.stores.get(payload.storeId);
  if (!store) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Store not found for menu creation.' });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  let merchantVersionNo = 0;

  await db.transaction(
    'rw',
    db.merchants,
    db.merchantVersions,
    db.menus,
    db.auditEvents,
    async () => {
      const merchant = await requireMerchantForTransition(store.merchantId);
      merchantVersionNo = await bumpMerchantVersionForContentMutation({
        merchant,
        actor,
        now,
        triggerActionType: 'MENU_CREATED'
      });

      await db.menus.add({
        id,
        storeId: payload.storeId,
        name: payload.name,
        description: payload.description ?? '',
        createdBy: actor.userId,
        updatedBy: actor.userId,
        createdAt: now,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'MENU_CREATED',
        entityType: 'menu',
        entityId: id,
        previousState: null,
        newState: { storeId: payload.storeId, name: payload.name }
      });
    }
  );

  logger.info('merchant', 'Created menu record.', {
    actorUserId: actor.userId,
    merchantId: store.merchantId,
    storeId: store.id,
    menuId: id,
    merchantVersionNo
  });

  const created = await db.menus.get(id);
  if (!created) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Menu creation failed unexpectedly.' });
  }

  return mapMenu(created);
}

export async function updateMenu(input: { menuId: string; name: string; description: string }) {
  const payload = parseMerchantPayloadOrThrow(updateMenuSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const menu = await db.menus.get(payload.menuId);
  if (!menu) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Menu not found.' });
  }

  const store = await db.stores.get(menu.storeId);
  if (!store) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Store not found for menu.' });
  }

  const now = new Date().toISOString();
  let merchantVersionNo = 0;

  await db.transaction(
    'rw',
    db.merchants,
    db.merchantVersions,
    db.menus,
    db.auditEvents,
    async () => {
      const merchant = await requireMerchantForTransition(store.merchantId);
      merchantVersionNo = await bumpMerchantVersionForContentMutation({
        merchant,
        actor,
        now,
        triggerActionType: 'MENU_UPDATED'
      });

      await db.menus.update(menu.id, {
        name: payload.name,
        description: payload.description ?? '',
        updatedBy: actor.userId,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'MENU_UPDATED',
        entityType: 'menu',
        entityId: menu.id,
        previousState: { name: menu.name },
        newState: { name: payload.name }
      });
    }
  );

  logger.info('merchant', 'Updated menu record.', {
    actorUserId: actor.userId,
    merchantId: store.merchantId,
    storeId: store.id,
    menuId: menu.id,
    merchantVersionNo
  });
}

export async function listCombos(menuId: string) {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.view');

  const records = await db.combos.where('menuId').equals(menuId).sortBy('updatedAt');
  return records.reverse().map(mapCombo);
}

export async function createCombo(input: {
  menuId: string;
  name: string;
  description: string;
  priceLabel: string;
}) {
  const payload = parseMerchantPayloadOrThrow(createComboSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const menu = await db.menus.get(payload.menuId);
  if (!menu) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Menu not found for combo creation.' });
  }

  const store = await db.stores.get(menu.storeId);
  if (!store) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Store not found for combo creation.'
    });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  let merchantVersionNo = 0;

  await db.transaction(
    'rw',
    db.merchants,
    db.merchantVersions,
    db.combos,
    db.auditEvents,
    async () => {
      const merchant = await requireMerchantForTransition(store.merchantId);
      merchantVersionNo = await bumpMerchantVersionForContentMutation({
        merchant,
        actor,
        now,
        triggerActionType: 'COMBO_CREATED'
      });

      await db.combos.add({
        id,
        menuId: payload.menuId,
        name: payload.name,
        description: payload.description ?? '',
        priceLabel: payload.priceLabel,
        createdBy: actor.userId,
        updatedBy: actor.userId,
        createdAt: now,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'COMBO_CREATED',
        entityType: 'combo',
        entityId: id,
        previousState: null,
        newState: { menuId: payload.menuId, name: payload.name }
      });
    }
  );

  logger.info('merchant', 'Created combo record.', {
    actorUserId: actor.userId,
    merchantId: store.merchantId,
    storeId: store.id,
    menuId: menu.id,
    comboId: id,
    merchantVersionNo
  });

  const created = await db.combos.get(id);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Combo creation failed unexpectedly.'
    });
  }

  return mapCombo(created);
}

export async function updateCombo(input: {
  comboId: string;
  name: string;
  description: string;
  priceLabel: string;
}) {
  const payload = parseMerchantPayloadOrThrow(updateComboSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.merchant.editDraft');

  const combo = await db.combos.get(payload.comboId);
  if (!combo) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Combo not found.' });
  }

  const menu = await db.menus.get(combo.menuId);
  if (!menu) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Menu not found for combo.' });
  }

  const store = await db.stores.get(menu.storeId);
  if (!store) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'Store not found for combo.' });
  }

  const now = new Date().toISOString();
  let merchantVersionNo = 0;

  await db.transaction(
    'rw',
    db.merchants,
    db.merchantVersions,
    db.combos,
    db.auditEvents,
    async () => {
      const merchant = await requireMerchantForTransition(store.merchantId);
      merchantVersionNo = await bumpMerchantVersionForContentMutation({
        merchant,
        actor,
        now,
        triggerActionType: 'COMBO_UPDATED'
      });

      await db.combos.update(combo.id, {
        name: payload.name,
        description: payload.description ?? '',
        priceLabel: payload.priceLabel,
        updatedBy: actor.userId,
        updatedAt: now
      });

      await appendAuditEvent({
        actorUserId: actor.userId,
        actionType: 'COMBO_UPDATED',
        entityType: 'combo',
        entityId: combo.id,
        previousState: { name: combo.name, priceLabel: combo.priceLabel },
        newState: { name: payload.name, priceLabel: payload.priceLabel }
      });
    }
  );

  logger.info('merchant', 'Updated combo record.', {
    actorUserId: actor.userId,
    merchantId: store.merchantId,
    storeId: store.id,
    menuId: menu.id,
    comboId: combo.id,
    merchantVersionNo
  });
}

export function canEditDraftActions(roles: RoleName[]): boolean {
  try {
    assertCapability(roles, 'workspace.merchant.editDraft');
    return true;
  } catch {
    return false;
  }
}

export function canReviewPublishActions(roles: RoleName[]): boolean {
  try {
    assertCapability(roles, 'workspace.merchant.reviewPublish');
    return true;
  } catch {
    return false;
  }
}

export function isWorkflowTransitionAllowed(
  workflowState: MerchantWorkflowState,
  action: 'submit' | 'approve' | 'reject' | 'publish'
): boolean {
  if (action === 'submit') {
    return workflowState === 'draft' || workflowState === 'rejected';
  }

  if (action === 'approve') {
    return workflowState === 'in_review';
  }

  if (action === 'reject') {
    return workflowState === 'in_review' || workflowState === 'approved';
  }

  return workflowState === 'approved';
}
