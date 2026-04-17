import crypto from 'node:crypto';
import { getDb } from '../db/connection.js';

interface ActorContext {
  userId: string;
  roles: string[];
}

interface MerchantRow {
  id: string;
  workflow_state: string;
  current_snapshot: string;
  latest_version_no: number;
  draft_version_no: number;
  in_review_version_no: number | null;
  published_version_no: number | null;
  rejection_reason: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
}

function appendAudit(actorUserId: string, actionType: string, entityType: string, entityId: string, previousState: unknown, newState: unknown): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_events (id, actor_user_id, action_type, entity_type, entity_id, previous_state, new_state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), actorUserId, actionType, entityType, entityId,
    previousState ? JSON.stringify(previousState) : null,
    newState ? JSON.stringify(newState) : null,
    new Date().toISOString()
  );
}

function mapMerchant(row: MerchantRow) {
  return {
    id: row.id,
    workflowState: row.workflow_state,
    latestVersionNo: row.latest_version_no,
    draftVersionNo: row.draft_version_no,
    inReviewVersionNo: row.in_review_version_no,
    publishedVersionNo: row.published_version_no,
    rejectionReason: row.rejection_reason,
    snapshot: JSON.parse(row.current_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listMerchants(_actor: ActorContext) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM merchants ORDER BY updated_at DESC').all() as MerchantRow[];
  return rows.map(mapMerchant);
}

export function createMerchantDraft(actor: ActorContext, input: { name: string; description: string; tags: string[]; amenities: string[] }) {
  if (!input.name || input.name.trim().length === 0) {
    throw Object.assign(new Error('Merchant name is required.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const now = new Date().toISOString();
  const merchantId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const snapshot = JSON.stringify({
    name: input.name.trim(),
    description: input.description ?? '',
    tags: input.tags ?? [],
    amenities: input.amenities ?? [],
    imageAssetId: null
  });

  const insertMerchant = db.prepare(`
    INSERT INTO merchants (id, workflow_state, current_snapshot, latest_version_no, draft_version_no, in_review_version_no, published_version_no, rejection_reason, created_by, updated_by, created_at, updated_at)
    VALUES (?, 'draft', ?, 1, 1, NULL, NULL, NULL, ?, ?, ?, ?)
  `);

  const insertVersion = db.prepare(`
    INSERT INTO merchant_versions (id, merchant_id, version_no, snapshot, created_by, created_at)
    VALUES (?, ?, 1, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    insertMerchant.run(merchantId, snapshot, actor.userId, actor.userId, now, now);
    insertVersion.run(versionId, merchantId, snapshot, actor.userId, now);
    appendAudit(actor.userId, 'MERCHANT_CREATED', 'merchant', merchantId, null, { workflowState: 'draft', versionNo: 1, name: input.name.trim() });
  });

  txn();

  const created = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow;
  return mapMerchant(created);
}

export function updateMerchantDraft(actor: ActorContext, merchantId: string, input: { expectedVersionNo: number; name: string; description: string; tags: string[]; amenities: string[]; imageAssetId: string | null }) {
  if (!input.name || input.name.trim().length === 0) {
    throw Object.assign(new Error('Merchant name is required.'), { code: 'VALIDATION_ERROR' });
  }

  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow | undefined;
  if (!merchant) {
    throw Object.assign(new Error('Merchant not found.'), { code: 'RECORD_NOT_FOUND' });
  }

  if (merchant.workflow_state === 'in_review' || merchant.workflow_state === 'approved') {
    throw Object.assign(new Error('Merchant is under review.'), { code: 'CONFLICT' });
  }

  if (merchant.latest_version_no !== input.expectedVersionNo) {
    throw Object.assign(new Error('Stale merchant version.'), { code: 'CONFLICT' });
  }

  const now = new Date().toISOString();
  const newVersionNo = merchant.latest_version_no + 1;
  const snapshot = JSON.stringify({
    name: input.name.trim(),
    description: input.description ?? '',
    tags: input.tags ?? [],
    amenities: input.amenities ?? [],
    imageAssetId: input.imageAssetId ?? null
  });

  const txn = db.transaction(() => {
    db.prepare(`INSERT INTO merchant_versions (id, merchant_id, version_no, snapshot, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
      crypto.randomUUID(), merchantId, newVersionNo, snapshot, actor.userId, now
    );
    db.prepare(`UPDATE merchants SET workflow_state = 'draft', current_snapshot = ?, latest_version_no = ?, draft_version_no = ?, in_review_version_no = NULL, rejection_reason = NULL, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      snapshot, newVersionNo, newVersionNo, actor.userId, now, merchantId
    );
    appendAudit(actor.userId, 'MERCHANT_DRAFT_UPDATED', 'merchant', merchantId,
      { workflowState: merchant.workflow_state, versionNo: merchant.latest_version_no },
      { workflowState: 'draft', versionNo: newVersionNo }
    );
  });

  txn();

  const updated = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow;
  return mapMerchant(updated);
}

export function submitMerchantForReview(actor: ActorContext, merchantId: string, input: { reason?: string }) {
  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow | undefined;
  if (!merchant) throw Object.assign(new Error('Merchant not found.'), { code: 'RECORD_NOT_FOUND' });

  if (merchant.workflow_state !== 'draft' && merchant.workflow_state !== 'rejected') {
    throw Object.assign(new Error('Only draft or rejected merchants can be submitted for review.'), { code: 'CONFLICT' });
  }

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    db.prepare(`UPDATE merchants SET workflow_state = 'in_review', in_review_version_no = ?, rejection_reason = NULL, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      merchant.draft_version_no, actor.userId, now, merchantId
    );
    appendAudit(actor.userId, 'MERCHANT_SUBMITTED_FOR_REVIEW', 'merchant', merchantId,
      { workflowState: merchant.workflow_state },
      { workflowState: 'in_review', reason: input.reason ?? null }
    );
  });
  txn();
}

export function approveMerchant(actor: ActorContext, merchantId: string) {
  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow | undefined;
  if (!merchant) throw Object.assign(new Error('Merchant not found.'), { code: 'RECORD_NOT_FOUND' });

  if (merchant.workflow_state !== 'in_review') {
    throw Object.assign(new Error('Merchant must be in review before approval.'), { code: 'CONFLICT' });
  }

  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    db.prepare(`UPDATE merchants SET workflow_state = 'approved', rejection_reason = NULL, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      actor.userId, now, merchantId
    );
    appendAudit(actor.userId, 'MERCHANT_APPROVED', 'merchant', merchantId,
      { workflowState: 'in_review' },
      { workflowState: 'approved' }
    );
  });
  txn();
}

export function rejectMerchant(actor: ActorContext, merchantId: string, input: { reason?: string }) {
  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow | undefined;
  if (!merchant) throw Object.assign(new Error('Merchant not found.'), { code: 'RECORD_NOT_FOUND' });

  if (merchant.workflow_state !== 'in_review' && merchant.workflow_state !== 'approved') {
    throw Object.assign(new Error('Only in-review or approved merchants can be rejected.'), { code: 'CONFLICT' });
  }

  const reason = input.reason?.trim() || 'Reviewer rejected submission.';
  const now = new Date().toISOString();
  const txn = db.transaction(() => {
    db.prepare(`UPDATE merchants SET workflow_state = 'rejected', rejection_reason = ?, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      reason, actor.userId, now, merchantId
    );
    appendAudit(actor.userId, 'MERCHANT_REJECTED', 'merchant', merchantId,
      { workflowState: merchant.workflow_state },
      { workflowState: 'rejected', reason }
    );
  });
  txn();
}

export function publishMerchant(actor: ActorContext, merchantId: string) {
  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE id = ?').get(merchantId) as MerchantRow | undefined;
  if (!merchant) throw Object.assign(new Error('Merchant not found.'), { code: 'RECORD_NOT_FOUND' });

  if (merchant.workflow_state !== 'approved') {
    throw Object.assign(new Error('Only approved merchants can be published.'), { code: 'CONFLICT' });
  }

  const publishedVersionNo = merchant.in_review_version_no ?? merchant.draft_version_no;
  const now = new Date().toISOString();

  const txn = db.transaction(() => {
    db.prepare(`UPDATE merchants SET workflow_state = 'published', published_version_no = ?, in_review_version_no = NULL, rejection_reason = NULL, updated_by = ?, updated_at = ? WHERE id = ?`).run(
      publishedVersionNo, actor.userId, now, merchantId
    );
    appendAudit(actor.userId, 'MERCHANT_PUBLISHED', 'merchant', merchantId,
      { workflowState: 'approved', versionNo: publishedVersionNo },
      { workflowState: 'published', versionNo: publishedVersionNo }
    );
  });
  txn();
}
