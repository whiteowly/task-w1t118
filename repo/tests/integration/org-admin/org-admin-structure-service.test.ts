import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  computePositionOccupancyStats,
  createHierarchyNode,
  createPositionDefinition,
  listOrgHierarchyNodes,
  listPositionDictionary
} from '../../../src/modules/org-admin/org-admin-structure-service';
import {
  approveOffer,
  createOfferFromTemplate,
  listOfferTemplates,
  listOnboardingChecklist,
  updateChecklistItemStatus
} from '../../../src/modules/recruiting/recruiting-service';

describe('org admin structure service integration', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('manages hierarchy + position dictionary and computes occupancy on demand', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const seedNodes = await listOrgHierarchyNodes();
    const organizationNode = seedNodes.find((node) => node.nodeType === 'organization');
    expect(organizationNode).toBeTruthy();

    const department = await createHierarchyNode({
      name: 'Field Services',
      nodeType: 'department',
      parentId: organizationNode?.id ?? null
    });

    const grade = await createHierarchyNode({
      name: 'G7',
      nodeType: 'grade',
      parentId: department.id
    });

    const classNode = await createHierarchyNode({
      name: 'Contract',
      nodeType: 'class',
      parentId: grade.id
    });

    const createdPosition = await createPositionDefinition({
      title: 'Field Staffing Coordinator',
      departmentNodeId: department.id,
      gradeNodeId: grade.id,
      classNodeId: classNode.id,
      responsibilities: ['Coordinate staffing schedules', 'Track shift fill-rate trends'],
      eligibilityRules: ['2+ years staffing experience'],
      headcountLimit: 4
    });

    expect(createdPosition.title).toBe('Field Staffing Coordinator');

    const dictionary = await listPositionDictionary();
    expect(dictionary.some((position) => position.id === createdPosition.id)).toBe(true);

    const templates = await listOfferTemplates();
    const offer = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'Occupancy Candidate',
      candidateEmail: 'occupancy@example.com'
    });

    await approveOffer({ offerId: offer.id });

    const checklist = await listOnboardingChecklist(offer.id);
    for (const item of checklist) {
      await updateChecklistItemStatus({
        offerId: offer.id,
        checklistItemId: item.id,
        status: 'complete'
      });
    }

    const occupancy = await computePositionOccupancyStats();
    const occupancyRow = occupancy.find((entry) => entry.positionId === templates[0].positionId);
    expect(occupancyRow).toBeTruthy();
    expect(occupancyRow?.occupiedCount).toBeGreaterThanOrEqual(1);

    const auditEvents = await db.auditEvents.toArray();
    expect(
      auditEvents.some(
        (event) =>
          event.actionType === 'ORG_HIERARCHY_NODE_CREATED' && event.entityId === department.id
      )
    ).toBe(true);
    expect(
      auditEvents.some(
        (event) =>
          event.actionType === 'ORG_POSITION_CREATED' && event.entityId === createdPosition.id
      )
    ).toBe(true);
  });

  it('rejects invalid hierarchy linkage and reports occupancy pending/approved-not-onboarded buckets', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    const nodes = await listOrgHierarchyNodes();
    const organizationNode = nodes.find((node) => node.nodeType === 'organization');
    const departmentNode = nodes.find((node) => node.nodeType === 'department');

    expect(organizationNode).toBeTruthy();
    expect(departmentNode).toBeTruthy();

    await expect(
      createHierarchyNode({
        name: 'Invalid Grade',
        nodeType: 'grade',
        parentId: organizationNode?.id ?? null
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const templates = await listOfferTemplates();
    const pendingOffer = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'Pending Candidate',
      candidateEmail: 'pending@example.com'
    });

    const approvedNotOnboardedOffer = await createOfferFromTemplate({
      templateId: templates[0].id,
      candidateName: 'Approved Candidate',
      candidateEmail: 'approved@example.com'
    });
    const approvedOffer = await approveOffer({ offerId: approvedNotOnboardedOffer.id });

    const occupancy = await computePositionOccupancyStats();
    const row = occupancy.find((entry) => entry.positionId === templates[0].positionId);

    expect(row).toBeTruthy();
    expect(row?.pendingApprovalCount).toBeGreaterThanOrEqual(1);
    expect(row?.approvedNotOnboardedCount).toBeGreaterThanOrEqual(1);
    expect(pendingOffer.approvalStatus).toBe('pending_hr_approval');
    expect(approvedOffer.approvalStatus).toBe('approved');
  });
});
