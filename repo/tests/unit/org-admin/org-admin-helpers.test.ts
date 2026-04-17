import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { bootstrapAdministrator, login, logout } from '../../../src/core/auth/auth-service';
import { initializeDatabase } from '../../../src/core/db/bootstrap';
import { db } from '../../../src/core/db/database';
import {
  canManageOrgAdminStructure,
  ensureOrgAdminSeedData,
  listOrgHierarchyNodes
} from '../../../src/modules/org-admin/org-admin-structure-service';

describe('org admin helpers', () => {
  beforeEach(async () => {
    await db.delete();
    await initializeDatabase();
  });

  afterEach(async () => {
    logout();
    await db.delete();
  });

  it('canManageOrgAdminStructure grants Administrator', () => {
    expect(canManageOrgAdminStructure(['Administrator'])).toBe(true);
  });

  it('canManageOrgAdminStructure denies BookingAgent', () => {
    expect(canManageOrgAdminStructure(['BookingAgent'])).toBe(false);
  });

  it('ensureOrgAdminSeedData creates the organization root node', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await ensureOrgAdminSeedData();
    const nodes = await listOrgHierarchyNodes();
    const orgRoot = nodes.find((node) => node.nodeType === 'organization');
    expect(orgRoot).toBeTruthy();
  });

  it('ensureOrgAdminSeedData is idempotent', async () => {
    await bootstrapAdministrator({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    await login({ username: 'admin', password: 'password-123' });

    await ensureOrgAdminSeedData();
    await ensureOrgAdminSeedData();
    const nodes = await listOrgHierarchyNodes();
    const orgRoots = nodes.filter((node) => node.nodeType === 'organization');
    expect(orgRoots).toHaveLength(1);
  });
});
