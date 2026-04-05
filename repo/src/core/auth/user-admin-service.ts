import { get } from 'svelte/store';

import { ROLE_NAMES, type RoleName } from '../../shared/types/auth';
import { sessionStore } from '../../shared/stores/session-store';
import { appendAuditEvent } from '../audit/audit-service';
import { db, type UserRecord } from '../db/database';
import { logger } from '../logging/logger';
import { assertCapability } from '../permissions/service';
import { encryptPasswordArtifacts } from '../security/auth-artifacts';
import { generateSalt, hashPassword } from '../security/password';
import {
  createLocalUserSchema,
  parseAdminSchemaOrThrow,
  updateLocalUserRolesSchema,
  updateLocalUserStatusSchema
} from '../validation/user-admin-schemas';
import { AppError } from '../validation/errors';

export interface ManagedUserView {
  id: string;
  username: string;
  roles: RoleName[];
  status: 'active' | 'disabled';
  createdAt: string;
}

interface CreateUserInput {
  username: string;
  password: string;
  confirmPassword: string;
  roles: RoleName[];
}

function getActorOrThrow(): { userId: string; roles: RoleName[]; username: string } {
  const session = get(sessionStore);
  if (session.status !== 'authenticated' || !session.user) {
    throw new AppError({
      code: 'SESSION_LOCKED',
      message: 'An active authenticated session is required.'
    });
  }

  return {
    userId: session.user.id,
    roles: session.user.roles,
    username: session.user.username
  };
}

async function countActiveAdministratorsExcluding(userId?: string): Promise<number> {
  const admins = await db.users
    .filter((user) => user.status === 'active' && user.roles.includes('Administrator'))
    .toArray();

  if (!userId) {
    return admins.length;
  }

  return admins.filter((user) => user.id !== userId).length;
}

function sortedUniqueRoles(roles: RoleName[]): RoleName[] {
  const ordered = ROLE_NAMES.filter((role) => roles.includes(role));
  return [...new Set(ordered)];
}

export async function listManagedUsers(): Promise<ManagedUserView[]> {
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.view');

  const users = await db.users.orderBy('username').toArray();
  return users.map((user) => ({
    id: user.id,
    username: user.username,
    roles: sortedUniqueRoles(user.roles),
    status: user.status,
    createdAt: user.createdAt
  }));
}

export async function createManagedUser(input: CreateUserInput): Promise<ManagedUserView> {
  const payload = parseAdminSchemaOrThrow(createLocalUserSchema, input);
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');

  const username = payload.username.trim();
  const duplicate = await db.users.where('username').equals(username).first();
  if (duplicate) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'A user with this username already exists.',
      fieldErrors: { username: ['Username already exists.'] }
    });
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(payload.password, salt);
  const encryptedPasswordArtifacts = await encryptPasswordArtifacts(
    { passwordHash, passwordSalt: salt },
    payload.password,
    username
  );

  const userId = crypto.randomUUID();
  const now = new Date().toISOString();
  const roles = sortedUniqueRoles(payload.roles);

  await db.transaction('rw', db.users, db.auditEvents, async () => {
    await db.users.add({
      id: userId,
      username,
      roles,
      status: 'active',
      createdAt: now,
      encryptedPasswordArtifacts
    });

    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'AUTH_USER_CREATED',
      entityType: 'user',
      entityId: userId,
      previousState: null,
      newState: { username, roles, status: 'active' }
    });
  });

  logger.info('auth', 'Administrator created local user.', {
    actorUserId: actor.userId,
    targetUserId: userId,
    roles
  });

  return {
    id: userId,
    username,
    roles,
    status: 'active',
    createdAt: now
  };
}

export async function setManagedUserStatus(
  userId: string,
  status: 'active' | 'disabled'
): Promise<void> {
  const payload = parseAdminSchemaOrThrow(updateLocalUserStatusSchema, { userId, status });
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');

  const target = await db.users.get(payload.userId);
  if (!target) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'User not found.' });
  }

  if (target.id === actor.userId && payload.status === 'disabled') {
    throw new AppError({
      code: 'CONFLICT',
      message: 'You cannot disable your own account.'
    });
  }

  if (target.roles.includes('Administrator') && payload.status === 'disabled') {
    const remainingAdmins = await countActiveAdministratorsExcluding(target.id);
    if (remainingAdmins === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cannot disable the last active Administrator account.'
      });
    }
  }

  await db.transaction('rw', db.users, db.auditEvents, async () => {
    await db.users.update(target.id, { status: payload.status });
    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'AUTH_USER_STATUS_UPDATED',
      entityType: 'user',
      entityId: target.id,
      previousState: { status: target.status },
      newState: { status: payload.status }
    });
  });

  logger.info('auth', 'Administrator updated user status.', {
    actorUserId: actor.userId,
    targetUserId: target.id,
    status: payload.status
  });
}

export async function setManagedUserRoles(userId: string, roles: RoleName[]): Promise<void> {
  const payload = parseAdminSchemaOrThrow(updateLocalUserRolesSchema, { userId, roles });
  const actor = getActorOrThrow();
  assertCapability(actor.roles, 'workspace.orgAdmin.manage');

  const target = await db.users.get(payload.userId);
  if (!target) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'User not found.' });
  }

  const nextRoles = sortedUniqueRoles(payload.roles);

  if (target.id === actor.userId && !nextRoles.includes('Administrator')) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'You cannot remove Administrator role from your own active session.'
    });
  }

  const wasAdmin = target.roles.includes('Administrator');
  const willRemainAdmin = nextRoles.includes('Administrator');

  if (wasAdmin && !willRemainAdmin && target.status === 'active') {
    const remainingAdmins = await countActiveAdministratorsExcluding(target.id);
    if (remainingAdmins === 0) {
      throw new AppError({
        code: 'CONFLICT',
        message: 'Cannot remove Administrator role from the last active Administrator.'
      });
    }
  }

  await db.transaction('rw', db.users, db.auditEvents, async () => {
    await db.users.update(target.id, { roles: nextRoles });
    await appendAuditEvent({
      actorUserId: actor.userId,
      actionType: 'AUTH_USER_ROLES_UPDATED',
      entityType: 'user',
      entityId: target.id,
      previousState: { roles: target.roles },
      newState: { roles: nextRoles }
    });
  });

  logger.info('auth', 'Administrator updated user roles.', {
    actorUserId: actor.userId,
    targetUserId: target.id,
    roles: nextRoles
  });
}
