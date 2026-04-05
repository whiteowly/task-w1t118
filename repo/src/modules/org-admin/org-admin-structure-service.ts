import { get } from 'svelte/store';

import { appendAuditEvent } from '../../core/audit/audit-service';
import {
  db,
  type OnboardingProgressStatus,
  type OrgHierarchyNodeRecord,
  type OrgHierarchyNodeType,
  type OrgPositionRecord,
  type RecruitingApprovalStatus
} from '../../core/db/database';
import { logger } from '../../core/logging/logger';
import { assertCapability, hasCapability } from '../../core/permissions/service';
import { AppError } from '../../core/validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { RoleName } from '../../shared/types/auth';
import { HIERARCHY_NODE_TYPE_ORDER, ORG_HIERARCHY_SEED, POSITION_SEED } from './org-admin-config';
import {
  createHierarchyNodeSchema,
  createPositionDefinitionSchema,
  expectedParentNodeType,
  parseOrgAdminPayloadOrThrow
} from './org-admin-validation';

interface ActorContext {
  userId: string;
  username: string;
  roles: RoleName[];
}

export interface HierarchyNodeView {
  id: string;
  nodeType: OrgHierarchyNodeType;
  name: string;
  parentId: string | null;
  parentName: string | null;
  depth: number;
  updatedAt: string;
}

export interface PositionDictionaryView {
  id: string;
  title: string;
  departmentNodeId: string;
  departmentName: string;
  gradeNodeId: string;
  gradeName: string;
  classNodeId: string;
  className: string;
  responsibilities: string[];
  eligibilityRules: string[];
  headcountLimit: number;
  updatedAt: string;
}

export interface PositionOccupancyStatView {
  positionId: string;
  positionTitle: string;
  headcountLimit: number;
  occupiedCount: number;
  openCount: number;
  approvedNotOnboardedCount: number;
  pendingApprovalCount: number;
  computedAt: string;
}

function getActorOrThrow(): ActorContext {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An authenticated session is required for Org Admin operations.'
    });
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    roles: session.user.roles
  };
}

function nodeNameMap(nodes: OrgHierarchyNodeRecord[]): Map<string, string> {
  return new Map(nodes.map((node) => [node.id, node.name]));
}

function depthForNode(
  node: OrgHierarchyNodeRecord,
  byId: Map<string, OrgHierarchyNodeRecord>,
  visited: Set<string> = new Set()
): number {
  if (!node.parentId) {
    return 0;
  }

  if (visited.has(node.id)) {
    return 0;
  }

  const parent = byId.get(node.parentId);
  if (!parent) {
    return 0;
  }

  visited.add(node.id);
  return depthForNode(parent, byId, visited) + 1;
}

function sortHierarchyNodes(nodes: OrgHierarchyNodeRecord[]): OrgHierarchyNodeRecord[] {
  return [...nodes].sort((left, right) => {
    const depthDelta =
      HIERARCHY_NODE_TYPE_ORDER[left.nodeType] - HIERARCHY_NODE_TYPE_ORDER[right.nodeType];
    if (depthDelta !== 0) {
      return depthDelta;
    }
    return left.name.localeCompare(right.name);
  });
}

function formatPositionView(
  position: OrgPositionRecord,
  nodeById: Map<string, OrgHierarchyNodeRecord>
): PositionDictionaryView {
  return {
    id: position.id,
    title: position.title,
    departmentNodeId: position.departmentNodeId,
    departmentName: nodeById.get(position.departmentNodeId)?.name ?? position.departmentNodeId,
    gradeNodeId: position.gradeNodeId,
    gradeName: nodeById.get(position.gradeNodeId)?.name ?? position.gradeNodeId,
    classNodeId: position.classNodeId,
    className: nodeById.get(position.classNodeId)?.name ?? position.classNodeId,
    responsibilities: [...position.responsibilities],
    eligibilityRules: [...position.eligibilityRules],
    headcountLimit: position.headcountLimit,
    updatedAt: position.updatedAt
  };
}

export function canManageOrgAdminStructure(roles: RoleName[]): boolean {
  return hasCapability(roles, 'workspace.orgAdmin.manage');
}

export async function ensureOrgAdminSeedData(): Promise<void> {
  const now = new Date().toISOString();

  if ((await db.orgHierarchyNodes.count()) === 0) {
    await db.orgHierarchyNodes.bulkPut([
      {
        ...ORG_HIERARCHY_SEED.organization,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now
      },
      ...ORG_HIERARCHY_SEED.departments.map((node) => ({
        ...node,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now
      })),
      ...ORG_HIERARCHY_SEED.grades.map((node) => ({
        ...node,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now
      })),
      ...ORG_HIERARCHY_SEED.classes.map((node) => ({
        ...node,
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now
      }))
    ]);

    logger.info('orgAdmin', 'Seeded default organization hierarchy nodes.', {
      nodeCount:
        1 +
        ORG_HIERARCHY_SEED.departments.length +
        ORG_HIERARCHY_SEED.grades.length +
        ORG_HIERARCHY_SEED.classes.length
    });
  }

  if ((await db.orgPositions.count()) === 0) {
    await db.orgPositions.bulkPut(
      POSITION_SEED.map((position) => ({
        ...position,
        responsibilities: [...position.responsibilities],
        eligibilityRules: [...position.eligibilityRules],
        createdBy: null,
        updatedBy: null,
        createdAt: now,
        updatedAt: now
      }))
    );

    logger.info('orgAdmin', 'Seeded default position dictionary entries.', {
      positionCount: POSITION_SEED.length
    });
  }
}

export async function listOrgHierarchyNodes(): Promise<HierarchyNodeView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.view');
  await ensureOrgAdminSeedData();

  const nodes = sortHierarchyNodes(await db.orgHierarchyNodes.toArray());
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const names = nodeNameMap(nodes);

  return nodes.map((node) => ({
    id: node.id,
    nodeType: node.nodeType,
    name: node.name,
    parentId: node.parentId,
    parentName: node.parentId ? (names.get(node.parentId) ?? null) : null,
    depth: depthForNode(node, nodeById),
    updatedAt: node.updatedAt
  }));
}

export async function createHierarchyNode(input: {
  name: string;
  nodeType: OrgHierarchyNodeType;
  parentId: string | null;
}): Promise<HierarchyNodeView> {
  const payload = parseOrgAdminPayloadOrThrow(createHierarchyNodeSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');
  await ensureOrgAdminSeedData();

  const expectedParentType = expectedParentNodeType(payload.nodeType);
  if (expectedParentType === null) {
    if (payload.parentId !== null) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Organization root cannot have a parent node.'
      });
    }

    const existingOrganization = await db.orgHierarchyNodes
      .where('nodeType')
      .equals('organization')
      .first();
    if (existingOrganization) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Organization root already exists.'
      });
    }
  } else {
    if (!payload.parentId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: `Parent ${expectedParentType} is required for ${payload.nodeType}.`,
        fieldErrors: { parentId: [`Parent ${expectedParentType} is required.`] }
      });
    }

    const parent = await db.orgHierarchyNodes.get(payload.parentId);
    if (!parent) {
      throw new AppError({
        code: 'RECORD_NOT_FOUND',
        message: 'Selected parent node was not found.'
      });
    }

    if (parent.nodeType !== expectedParentType) {
      throw new AppError({
        code: 'CONFLICT',
        message: `${payload.nodeType} must be attached to a ${expectedParentType} node.`
      });
    }
  }

  const now = new Date().toISOString();
  const nodeId = crypto.randomUUID();

  await db.transaction('rw', db.orgHierarchyNodes, db.auditEvents, async () => {
    await db.orgHierarchyNodes.add({
      id: nodeId,
      nodeType: payload.nodeType,
      name: payload.name,
      parentId: payload.parentId,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      createdAt: now,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'ORG_HIERARCHY_NODE_CREATED',
      entityType: 'orgHierarchyNode',
      entityId: nodeId,
      previousState: null,
      newState: {
        nodeType: payload.nodeType,
        name: payload.name,
        parentId: payload.parentId
      }
    });
  });

  logger.info('orgAdmin', 'Created hierarchy node.', {
    actorUserId: actor.userId,
    nodeId,
    nodeType: payload.nodeType,
    parentId: payload.parentId
  });

  const nodes = await listOrgHierarchyNodes();
  const created = nodes.find((node) => node.id === nodeId);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Created node was not found after write.'
    });
  }

  return created;
}

export async function listPositionDictionary(): Promise<PositionDictionaryView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.view');
  await ensureOrgAdminSeedData();

  const [positions, nodes] = await Promise.all([
    db.orgPositions.toArray(),
    db.orgHierarchyNodes.toArray()
  ]);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return positions
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((position) => formatPositionView(position, nodeById));
}

async function requireNodeOrThrow(
  id: string,
  nodeType: OrgHierarchyNodeType
): Promise<OrgHierarchyNodeRecord> {
  const node = await db.orgHierarchyNodes.get(id);
  if (!node) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: `Hierarchy node ${id} was not found.`
    });
  }
  if (node.nodeType !== nodeType) {
    throw new AppError({
      code: 'CONFLICT',
      message: `Hierarchy node ${id} must be of type ${nodeType}.`
    });
  }
  return node;
}

export async function createPositionDefinition(input: {
  title: string;
  departmentNodeId: string;
  gradeNodeId: string;
  classNodeId: string;
  responsibilities: string[];
  eligibilityRules: string[];
  headcountLimit: number;
}): Promise<PositionDictionaryView> {
  const payload = parseOrgAdminPayloadOrThrow(createPositionDefinitionSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');
  await ensureOrgAdminSeedData();

  const [departmentNode, gradeNode, classNode] = await Promise.all([
    requireNodeOrThrow(payload.departmentNodeId, 'department'),
    requireNodeOrThrow(payload.gradeNodeId, 'grade'),
    requireNodeOrThrow(payload.classNodeId, 'class')
  ]);

  if (gradeNode.parentId !== departmentNode.id) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Selected grade does not belong to the selected department.'
    });
  }

  if (classNode.parentId !== gradeNode.id) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Selected class does not belong to the selected grade.'
    });
  }

  const duplicate = await db.orgPositions
    .filter(
      (position) =>
        position.departmentNodeId === payload.departmentNodeId &&
        position.title.toLowerCase() === payload.title.toLowerCase()
    )
    .first();

  if (duplicate) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'A position with this title already exists for the selected department.',
      fieldErrors: { title: ['Position title already exists in selected department.'] }
    });
  }

  const now = new Date().toISOString();
  const positionId = crypto.randomUUID();

  await db.transaction('rw', db.orgPositions, db.auditEvents, async () => {
    await db.orgPositions.add({
      id: positionId,
      title: payload.title,
      departmentNodeId: payload.departmentNodeId,
      gradeNodeId: payload.gradeNodeId,
      classNodeId: payload.classNodeId,
      responsibilities: payload.responsibilities,
      eligibilityRules: payload.eligibilityRules,
      headcountLimit: payload.headcountLimit,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      createdAt: now,
      updatedAt: now
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'ORG_POSITION_CREATED',
      entityType: 'orgPosition',
      entityId: positionId,
      previousState: null,
      newState: {
        title: payload.title,
        departmentNodeId: payload.departmentNodeId,
        gradeNodeId: payload.gradeNodeId,
        classNodeId: payload.classNodeId,
        headcountLimit: payload.headcountLimit
      }
    });
  });

  logger.info('orgAdmin', 'Created position definition.', {
    actorUserId: actor.userId,
    positionId,
    title: payload.title,
    departmentNodeId: payload.departmentNodeId
  });

  const allPositions = await listPositionDictionary();
  const created = allPositions.find((position) => position.id === positionId);
  if (!created) {
    throw new AppError({
      code: 'RECORD_NOT_FOUND',
      message: 'Created position was not found after write.'
    });
  }

  return created;
}

function offerMatchesStatus(
  approvalStatus: RecruitingApprovalStatus,
  onboardingStatus: OnboardingProgressStatus,
  target: 'occupied' | 'approved_not_onboarded' | 'pending'
): boolean {
  if (target === 'occupied') {
    return approvalStatus === 'approved' && onboardingStatus === 'complete';
  }

  if (target === 'approved_not_onboarded') {
    return approvalStatus === 'approved' && onboardingStatus !== 'complete';
  }

  return approvalStatus === 'pending_hr_approval';
}

export async function computePositionOccupancyStats(): Promise<PositionOccupancyStatView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.view');
  await ensureOrgAdminSeedData();

  const [positions, offers] = await Promise.all([
    db.orgPositions.toArray(),
    db.recruitingOffers.toArray()
  ]);

  const computedAt = new Date().toISOString();

  return positions
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((position) => {
      const positionOffers = offers.filter((offer) => offer.positionId === position.id);
      const occupiedCount = positionOffers.filter((offer) =>
        offerMatchesStatus(offer.approvalStatus, offer.onboardingStatus, 'occupied')
      ).length;
      const approvedNotOnboardedCount = positionOffers.filter((offer) =>
        offerMatchesStatus(offer.approvalStatus, offer.onboardingStatus, 'approved_not_onboarded')
      ).length;
      const pendingApprovalCount = positionOffers.filter((offer) =>
        offerMatchesStatus(offer.approvalStatus, offer.onboardingStatus, 'pending')
      ).length;

      return {
        positionId: position.id,
        positionTitle: position.title,
        headcountLimit: position.headcountLimit,
        occupiedCount,
        openCount: Math.max(position.headcountLimit - occupiedCount, 0),
        approvedNotOnboardedCount,
        pendingApprovalCount,
        computedAt
      };
    });
}
