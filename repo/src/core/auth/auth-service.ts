import { get } from 'svelte/store';

import { appendAuditEvent } from '../audit/audit-service';
import type { UserRecord } from '../db/database';
import { db } from '../db/database';
import { logger } from '../logging/logger';
import { hasCapability } from '../permissions/service';
import { decryptPasswordArtifacts, encryptPasswordArtifacts } from '../security/auth-artifacts';
import {
  clearWorkspaceFieldEncryptionKey,
  setWorkspaceFieldEncryptionKeyFromCredentials
} from '../security/workspace-field-key';
import { generateSalt, hashPassword, verifyPassword } from '../security/password';
import {
  parseOrThrow,
  bootstrapAdminSchema,
  loginSchema,
  reauthSchema
} from '../validation/auth-schemas';
import { AppError } from '../validation/errors';
import { sessionStore } from '../../shared/stores/session-store';
import type { AuthenticatedUser, RoleName } from '../../shared/types/auth';

const DEFAULT_AUTO_LOCK_MS = 15 * 60 * 1000;
let autoLockMs = DEFAULT_AUTO_LOCK_MS;

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

function ensureActiveSession(): AuthenticatedUser {
  const session = get(sessionStore);
  if (!session.user) {
    throw new AppError({ code: 'SESSION_LOCKED', message: 'No active session found.' });
  }
  return session.user;
}

function stopInactivityTracking(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

function scheduleAutoLock(): void {
  stopInactivityTracking();
  inactivityTimer = setTimeout(() => {
    lockSession('Auto-lock due to inactivity.');
  }, autoLockMs);
}

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'scroll', 'click'];

let listenersAttached = false;

function activityListener(): void {
  const session = get(sessionStore);
  if (session.status === 'authenticated') {
    scheduleAutoLock();
  }
}

function attachActivityListeners(): void {
  if (listenersAttached) return;
  ACTIVITY_EVENTS.forEach((eventName) =>
    window.addEventListener(eventName, activityListener, { passive: true })
  );
  listenersAttached = true;
}

function detachActivityListeners(): void {
  if (!listenersAttached) return;
  ACTIVITY_EVENTS.forEach((eventName) => window.removeEventListener(eventName, activityListener));
  listenersAttached = false;
}

function toUserSession(record: {
  id: string;
  username: string;
  roles: RoleName[];
}): AuthenticatedUser {
  return {
    id: record.id,
    username: record.username,
    roles: record.roles
  };
}

async function encryptAndPersistAuthArtifacts(
  user: Pick<UserRecord, 'id' | 'username'>,
  password: string,
  passwordHash: string,
  passwordSalt: string
): Promise<void> {
  const encryptedPasswordArtifacts = await encryptPasswordArtifacts(
    { passwordHash, passwordSalt },
    password,
    user.username
  );

  await db.users.update(user.id, {
    encryptedPasswordArtifacts,
    passwordHash: undefined,
    passwordSalt: undefined
  });
}

async function verifyCredentials(user: UserRecord, password: string): Promise<boolean> {
  if (user.encryptedPasswordArtifacts) {
    try {
      const decrypted = await decryptPasswordArtifacts(
        user.encryptedPasswordArtifacts,
        password,
        user.username
      );

      return verifyPassword(password, decrypted.passwordHash, decrypted.passwordSalt);
    } catch {
      return false;
    }
  }

  if (!user.passwordHash || !user.passwordSalt) {
    logger.warn('auth', 'User record missing password artifacts.', { userId: user.id });
    return false;
  }

  const legacyVerified = await verifyPassword(password, user.passwordHash, user.passwordSalt);
  if (!legacyVerified) {
    return false;
  }

  await encryptAndPersistAuthArtifacts(user, password, user.passwordHash, user.passwordSalt);
  logger.info('auth', 'Migrated legacy plaintext password artifacts to encrypted form.', {
    userId: user.id
  });

  return true;
}

export async function bootstrapAdministrator(input: unknown): Promise<void> {
  const payload = parseOrThrow(bootstrapAdminSchema, input);

  const userCount = await db.users.count();
  if (userCount > 0) {
    throw new AppError({
      code: 'CONFLICT',
      message: 'Administrator bootstrap has already been completed.'
    });
  }

  const salt = generateSalt();
  const passwordHash = await hashPassword(payload.password, salt);
  const encryptedPasswordArtifacts = await encryptPasswordArtifacts(
    { passwordHash, passwordSalt: salt },
    payload.password,
    payload.username
  );
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();

  await db.transaction('rw', db.users, db.auditEvents, async () => {
    await db.users.add({
      id: userId,
      username: payload.username,
      roles: ['Administrator'],
      encryptedPasswordArtifacts,
      status: 'active',
      createdAt: now
    });

    await appendAuditEvent({
      actorUserId: null,
      actionType: 'AUTH_BOOTSTRAP_ADMIN_CREATED',
      entityType: 'user',
      entityId: userId,
      previousState: null,
      newState: { username: payload.username, roles: ['Administrator'] }
    });
  });

  logger.info('auth', 'Initial administrator account created.', {
    userId,
    username: payload.username
  });
}

export async function login(input: unknown): Promise<void> {
  const payload = parseOrThrow(loginSchema, input);
  const user = await db.users.where('username').equals(payload.username).first();

  if (!user || user.status !== 'active') {
    throw new AppError({ code: 'PERMISSION_DENIED', message: 'Invalid username or password.' });
  }

  const ok = await verifyCredentials(user, payload.password);
  if (!ok) {
    throw new AppError({ code: 'PERMISSION_DENIED', message: 'Invalid username or password.' });
  }

  await setWorkspaceFieldEncryptionKeyFromCredentials({
    userId: user.id,
    username: user.username,
    password: payload.password
  });

  await db.transaction('rw', db.auditEvents, async () => {
    sessionStore.set({ status: 'authenticated', user: toUserSession(user) });

    await appendAuditEvent({
      actorUserId: user.id,
      actionType: 'AUTH_LOGIN',
      entityType: 'user',
      entityId: user.id,
      previousState: null,
      newState: { username: user.username, roles: user.roles }
    });
  });

  attachActivityListeners();
  scheduleAutoLock();

  logger.info('auth', 'User logged in.', { userId: user.id, roles: user.roles });
}

export function lockSession(reason: string): void {
  const current = get(sessionStore);
  if (!current.user || current.status === 'locked') {
    return;
  }

  sessionStore.set({ status: 'locked', user: current.user });
  clearWorkspaceFieldEncryptionKey(current.user.id);
  stopInactivityTracking();

  appendAuditEvent({
    actorUserId: current.user.id,
    actionType: 'AUTH_SESSION_LOCKED',
    entityType: 'session',
    entityId: current.user.id,
    previousState: { status: 'authenticated' },
    newState: { status: 'locked', reason }
  }).catch(() => {});

  logger.warn('auth', 'Session locked.', { reason, userId: current.user.id });
}

export async function reauthenticate(passwordInput: unknown): Promise<void> {
  const payload = parseOrThrow(reauthSchema, passwordInput);
  const session = get(sessionStore);
  if (!session.user) {
    throw new AppError({ code: 'SESSION_LOCKED', message: 'No session available to unlock.' });
  }

  const user = await db.users.get(session.user.id);
  if (!user) {
    throw new AppError({ code: 'RECORD_NOT_FOUND', message: 'User no longer exists.' });
  }

  const valid = await verifyCredentials(user, payload.password);
  if (!valid) {
    throw new AppError({ code: 'PERMISSION_DENIED', message: 'Incorrect password.' });
  }

  await setWorkspaceFieldEncryptionKeyFromCredentials({
    userId: user.id,
    username: user.username,
    password: payload.password
  });

  sessionStore.set({ status: 'authenticated', user: toUserSession(user) });
  scheduleAutoLock();

  await appendAuditEvent({
    actorUserId: user.id,
    actionType: 'AUTH_REAUTH',
    entityType: 'session',
    entityId: user.id,
    previousState: { status: 'locked' },
    newState: { status: 'authenticated' }
  });
}

export function logout(): void {
  const current = get(sessionStore);
  sessionStore.set({ status: 'logged_out', user: null });
  clearWorkspaceFieldEncryptionKey(current.user?.id ?? null);
  detachActivityListeners();
  stopInactivityTracking();

  appendAuditEvent({
    actorUserId: current.user?.id ?? null,
    actionType: 'AUTH_LOGOUT',
    entityType: 'session',
    entityId: current.user?.id ?? 'unknown',
    previousState: { status: current.status },
    newState: { status: 'logged_out' }
  }).catch(() => {});

  logger.info('auth', 'User logged out.', { userId: current.user?.id ?? null });
}

export function requireCapability(capability: Parameters<typeof hasCapability>[1]): void {
  const user = ensureActiveSession();
  if (!hasCapability(user.roles, capability)) {
    throw new AppError({
      code: 'PERMISSION_DENIED',
      message: `Missing capability: ${capability}`
    });
  }
}

export function __setAutoLockDurationForTests(ms: number): void {
  autoLockMs = ms;
}

export function __resetAutoLockDurationForTests(): void {
  autoLockMs = DEFAULT_AUTO_LOCK_MS;
}
