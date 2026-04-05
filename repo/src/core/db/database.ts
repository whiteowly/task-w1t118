import Dexie, { type Table } from 'dexie';

import type { RoleName } from '../../shared/types/auth';

export interface EncryptedPasswordArtifacts {
  keyVersion: number;
  kdfIterations: number;
  kdfSalt: string;
  iv: string;
  ciphertext: string;
}

export interface UserRecord {
  id: string;
  username: string;
  roles: RoleName[];
  encryptedPasswordArtifacts?: EncryptedPasswordArtifacts;
  // Legacy fields retained as optional for one-way migration support.
  passwordHash?: string;
  passwordSalt?: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface RoleRecord {
  id: RoleName;
  name: string;
  createdAt: string;
}

export interface AuditEventRecord {
  id: string;
  actorUserId: string | null;
  actionType: string;
  entityType: string;
  entityId: string;
  previousState: unknown;
  newState: unknown;
  createdAt: string;
}

export interface BookingLockRecord {
  resourceKey: string;
  holderTabId: string;
  expiresAt: string;
}

export interface OrderHoldRecord {
  id: string;
  resourceKey: string;
  status: 'active' | 'released';
  expiresAt: string;
}

export interface IdempotencyRecord {
  key: string;
  operationType: string;
  requestHash: string;
  responseHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface EncryptedFieldValue {
  keyVersion: number;
  kdfIterations: number;
  kdfSalt: string;
  iv: string;
  ciphertext: string;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'late_cancelled';

export interface BookingRecord {
  id: string;
  resourceId: string;
  resourceLabel: string;
  customerName: string;
  partySize: number;
  startsAt: string;
  endsAt: string;
  notes: string;
  status: BookingStatus;
  cancellationReason: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type RecruitingApprovalStatus = 'pending_hr_approval' | 'approved' | 'rejected';
export type OnboardingProgressStatus = 'not_started' | 'in_progress' | 'complete';
export type OnboardingChecklistItemStatus = 'not_started' | 'in_progress' | 'complete';

export interface RecruitingOfferTemplateRecord {
  id: string;
  name: string;
  positionId: string;
  compensationAmountCents: number;
  compensationCurrency: string;
  responsibilities: string[];
  eligibilityRules: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecruitingOfferRecord {
  id: string;
  templateId: string;
  positionId: string;
  positionTitle: string;
  departmentId: string;
  departmentName: string;
  candidateName: string;
  candidateEmail: string;
  approvalStatus: RecruitingApprovalStatus;
  approvalRoutingRole: RoleName;
  rejectionReason: string | null;
  compensationEncrypted: EncryptedFieldValue;
  compensationMasked: string;
  approvedBy: string | null;
  approvedAt: string | null;
  signatureTypedName: string | null;
  signatureDrawnDataUrl: string | null;
  signatureSignedAt: string | null;
  onboardingStatus: OnboardingProgressStatus;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecruitingOnboardingDocumentRecord {
  id: string;
  offerId: string;
  legalName: string;
  addressLine1: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  ssnEncrypted: EncryptedFieldValue;
  ssnMasked: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecruitingChecklistItemRecord {
  id: string;
  offerId: string;
  itemCode: string;
  label: string;
  status: OnboardingChecklistItemStatus;
  updatedBy: string;
  updatedAt: string;
}

export type OrgHierarchyNodeType = 'organization' | 'department' | 'grade' | 'class';

export interface OrgHierarchyNodeRecord {
  id: string;
  nodeType: OrgHierarchyNodeType;
  name: string;
  parentId: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgPositionRecord {
  id: string;
  title: string;
  departmentNodeId: string;
  gradeNodeId: string;
  classNodeId: string;
  responsibilities: string[];
  eligibilityRules: string[];
  headcountLimit: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CollaborationMessageSource = 'manual' | 'canned';

export interface CollaborationMessageRecord {
  id: string;
  contextKey: string;
  contextLabel: string;
  messageBody: string;
  source: CollaborationMessageSource;
  archived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  createdBy: string;
  createdAt: string;
}

export interface CollaborationNoteRecord {
  id: string;
  contextKey: string;
  contextLabel: string;
  noteBody: string;
  archived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationCannedResponseRecord {
  id: string;
  title: string;
  body: string;
  tags: string[];
  archived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MerchantWorkflowState = 'draft' | 'in_review' | 'approved' | 'rejected' | 'published';

export interface MerchantSnapshot {
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
  imageAssetId: string | null;
}

export interface MerchantRecord {
  id: string;
  workflowState: MerchantWorkflowState;
  currentSnapshot: MerchantSnapshot;
  latestVersionNo: number;
  draftVersionNo: number;
  inReviewVersionNo: number | null;
  publishedVersionNo: number | null;
  rejectionReason: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantVersionRecord {
  id: string;
  merchantId: string;
  versionNo: number;
  snapshot: MerchantSnapshot;
  createdBy: string;
  createdAt: string;
}

export type MerchantOwnerType = 'merchant' | 'store';

export interface MerchantMediaAssetRecord {
  id: string;
  ownerType: MerchantOwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl: string;
  createdBy: string;
  createdAt: string;
}

export interface StoreRecord {
  id: string;
  merchantId: string;
  name: string;
  description: string;
  tags: string[];
  amenities: string[];
  imageAssetId: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuRecord {
  id: string;
  storeId: string;
  name: string;
  description: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComboRecord {
  id: string;
  menuId: string;
  name: string;
  description: string;
  priceLabel: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

class LocalOpsDatabase extends Dexie {
  users!: Table<UserRecord, string>;
  roles!: Table<RoleRecord, string>;
  auditEvents!: Table<AuditEventRecord, string>;
  bookingLocks!: Table<BookingLockRecord, string>;
  orderHolds!: Table<OrderHoldRecord, string>;
  idempotencyKeys!: Table<IdempotencyRecord, string>;
  merchants!: Table<MerchantRecord, string>;
  merchantVersions!: Table<MerchantVersionRecord, string>;
  merchantMediaAssets!: Table<MerchantMediaAssetRecord, string>;
  bookings!: Table<BookingRecord, string>;
  recruitingOfferTemplates!: Table<RecruitingOfferTemplateRecord, string>;
  recruitingOffers!: Table<RecruitingOfferRecord, string>;
  recruitingOnboardingDocuments!: Table<RecruitingOnboardingDocumentRecord, string>;
  recruitingChecklistItems!: Table<RecruitingChecklistItemRecord, string>;
  orgHierarchyNodes!: Table<OrgHierarchyNodeRecord, string>;
  orgPositions!: Table<OrgPositionRecord, string>;
  collaborationMessages!: Table<CollaborationMessageRecord, string>;
  collaborationNotes!: Table<CollaborationNoteRecord, string>;
  collaborationCannedResponses!: Table<CollaborationCannedResponseRecord, string>;
  stores!: Table<StoreRecord, string>;
  menus!: Table<MenuRecord, string>;
  combos!: Table<ComboRecord, string>;

  constructor() {
    super('localops_workspace');
    this.version(1).stores({
      users: '&id, &username, status, createdAt',
      roles: '&id, name',
      auditEvents: '&id, actorUserId, actionType, entityType, entityId, createdAt',
      bookingLocks: '&resourceKey, holderTabId, expiresAt',
      orderHolds: '&id, resourceKey, status, expiresAt',
      idempotencyKeys: '&key, operationType, createdAt, expiresAt'
    });

    this.version(2).stores({
      users: '&id, &username, status, createdAt',
      roles: '&id, name',
      auditEvents: '&id, actorUserId, actionType, entityType, entityId, createdAt',
      bookingLocks: '&resourceKey, holderTabId, expiresAt',
      orderHolds: '&id, resourceKey, status, expiresAt',
      idempotencyKeys: '&key, operationType, createdAt, expiresAt',
      merchants: '&id, workflowState, createdAt, updatedAt',
      merchantVersions: '&id, merchantId, versionNo, createdAt, [merchantId+versionNo]',
      merchantMediaAssets: '&id, ownerType, ownerId, createdAt, [ownerType+ownerId]',
      stores: '&id, merchantId, updatedAt, [merchantId+updatedAt]',
      menus: '&id, storeId, updatedAt, [storeId+updatedAt]',
      combos: '&id, menuId, updatedAt, [menuId+updatedAt]'
    });

    this.version(3).stores({
      users: '&id, &username, status, createdAt',
      roles: '&id, name',
      auditEvents: '&id, actorUserId, actionType, entityType, entityId, createdAt',
      bookingLocks: '&resourceKey, holderTabId, expiresAt',
      orderHolds: '&id, resourceKey, status, expiresAt',
      idempotencyKeys: '&key, operationType, createdAt, expiresAt',
      merchants: '&id, workflowState, createdAt, updatedAt',
      merchantVersions: '&id, merchantId, versionNo, createdAt, [merchantId+versionNo]',
      merchantMediaAssets: '&id, ownerType, ownerId, createdAt, [ownerType+ownerId]',
      bookings:
        '&id, resourceId, startsAt, endsAt, status, updatedAt, [resourceId+startsAt], [resourceId+status]',
      stores: '&id, merchantId, updatedAt, [merchantId+updatedAt]',
      menus: '&id, storeId, updatedAt, [storeId+updatedAt]',
      combos: '&id, menuId, updatedAt, [menuId+updatedAt]'
    });

    this.version(4).stores({
      users: '&id, &username, status, createdAt',
      roles: '&id, name',
      auditEvents: '&id, actorUserId, actionType, entityType, entityId, createdAt',
      bookingLocks: '&resourceKey, holderTabId, expiresAt',
      orderHolds: '&id, resourceKey, status, expiresAt',
      idempotencyKeys: '&key, operationType, createdAt, expiresAt',
      merchants: '&id, workflowState, createdAt, updatedAt',
      merchantVersions: '&id, merchantId, versionNo, createdAt, [merchantId+versionNo]',
      merchantMediaAssets: '&id, ownerType, ownerId, createdAt, [ownerType+ownerId]',
      bookings:
        '&id, resourceId, startsAt, endsAt, status, updatedAt, [resourceId+startsAt], [resourceId+status]',
      recruitingOfferTemplates: '&id, name, positionId, updatedAt',
      recruitingOffers:
        '&id, templateId, positionId, approvalStatus, onboardingStatus, updatedAt, [positionId+approvalStatus], [approvalStatus+updatedAt]',
      recruitingOnboardingDocuments: '&id, offerId, updatedAt, [offerId+updatedAt]',
      recruitingChecklistItems: '&id, offerId, status, updatedAt, [offerId+status]',
      orgHierarchyNodes: '&id, nodeType, parentId, updatedAt, [parentId+nodeType]',
      orgPositions: '&id, title, departmentNodeId, gradeNodeId, classNodeId, updatedAt',
      stores: '&id, merchantId, updatedAt, [merchantId+updatedAt]',
      menus: '&id, storeId, updatedAt, [storeId+updatedAt]',
      combos: '&id, menuId, updatedAt, [menuId+updatedAt]'
    });

    this.version(5).stores({
      users: '&id, &username, status, createdAt',
      roles: '&id, name',
      auditEvents: '&id, actorUserId, actionType, entityType, entityId, createdAt',
      bookingLocks: '&resourceKey, holderTabId, expiresAt',
      orderHolds: '&id, resourceKey, status, expiresAt',
      idempotencyKeys: '&key, operationType, createdAt, expiresAt',
      merchants: '&id, workflowState, createdAt, updatedAt',
      merchantVersions: '&id, merchantId, versionNo, createdAt, [merchantId+versionNo]',
      merchantMediaAssets: '&id, ownerType, ownerId, createdAt, [ownerType+ownerId]',
      bookings:
        '&id, resourceId, startsAt, endsAt, status, updatedAt, [resourceId+startsAt], [resourceId+status]',
      recruitingOfferTemplates: '&id, name, positionId, updatedAt',
      recruitingOffers:
        '&id, templateId, positionId, approvalStatus, onboardingStatus, updatedAt, [positionId+approvalStatus], [approvalStatus+updatedAt]',
      recruitingOnboardingDocuments: '&id, offerId, updatedAt, [offerId+updatedAt]',
      recruitingChecklistItems: '&id, offerId, status, updatedAt, [offerId+status]',
      orgHierarchyNodes: '&id, nodeType, parentId, updatedAt, [parentId+nodeType]',
      orgPositions: '&id, title, departmentNodeId, gradeNodeId, classNodeId, updatedAt',
      collaborationMessages:
        '&id, contextKey, archived, createdAt, [contextKey+createdAt], [contextKey+archived], [archived+createdAt]',
      collaborationNotes:
        '&id, contextKey, archived, updatedAt, [contextKey+updatedAt], [contextKey+archived], [archived+updatedAt]',
      collaborationCannedResponses: '&id, archived, updatedAt, [archived+updatedAt]',
      stores: '&id, merchantId, updatedAt, [merchantId+updatedAt]',
      menus: '&id, storeId, updatedAt, [storeId+updatedAt]',
      combos: '&id, menuId, updatedAt, [menuId+updatedAt]'
    });
  }
}

export const db = new LocalOpsDatabase();
