import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDb } from '../db/connection.js';

interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  roles: string;
  status: string;
  created_at: string;
}

interface SessionRow {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function appendAudit(
  actorUserId: string | null,
  actionType: string,
  entityType: string,
  entityId: string,
  previousState: unknown,
  newState: unknown
): void {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO audit_events (id, actor_user_id, action_type, entity_type, entity_id, previous_state, new_state, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    crypto.randomUUID(),
    actorUserId,
    actionType,
    entityType,
    entityId,
    previousState ? JSON.stringify(previousState) : null,
    newState ? JSON.stringify(newState) : null,
    new Date().toISOString()
  );
}

export function bootstrapAdmin(input: {
  username: string;
  password: string;
  confirmPassword: string;
}): void {
  if (!input.username || input.username.trim().length < 3) {
    throw Object.assign(new Error('Username must be at least 3 characters.'), {
      code: 'VALIDATION_ERROR'
    });
  }
  if (!input.password || input.password.length < 8) {
    throw Object.assign(new Error('Password must be at least 8 characters.'), {
      code: 'VALIDATION_ERROR'
    });
  }
  if (input.password !== input.confirmPassword) {
    throw Object.assign(new Error('Password confirmation does not match.'), {
      code: 'VALIDATION_ERROR'
    });
  }

  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (count > 0) {
    throw Object.assign(new Error('Administrator bootstrap has already been completed.'), {
      code: 'CONFLICT'
    });
  }

  const userId = crypto.randomUUID();
  const hash = bcrypt.hashSync(input.password, 10);
  const now = new Date().toISOString();
  const roles = JSON.stringify(['Administrator']);

  db.prepare(
    'INSERT INTO users (id, username, password_hash, roles, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, input.username.trim(), hash, roles, 'active', now);

  appendAudit(null, 'AUTH_BOOTSTRAP_ADMIN_CREATED', 'user', userId, null, {
    username: input.username,
    roles: ['Administrator']
  });
}

export function login(input: { username: string; password: string }): {
  token: string;
  user: { id: string; username: string; roles: string[] };
} {
  if (!input.username || !input.password) {
    throw Object.assign(new Error('Username and password are required.'), {
      code: 'VALIDATION_ERROR'
    });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(input.username.trim()) as
    | UserRow
    | undefined;

  if (!user || user.status !== 'active') {
    throw Object.assign(new Error('Invalid username or password.'), { code: 'PERMISSION_DENIED' });
  }

  if (!bcrypt.compareSync(input.password, user.password_hash)) {
    throw Object.assign(new Error('Invalid username or password.'), { code: 'PERMISSION_DENIED' });
  }

  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).run(token, user.id, now.toISOString(), expiresAt.toISOString());

  const roles = JSON.parse(user.roles) as string[];

  appendAudit(user.id, 'AUTH_LOGIN', 'user', user.id, null, { username: user.username, roles });

  return { token, user: { id: user.id, username: user.username, roles } };
}

export function logout(token: string): void {
  const db = getDb();
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as
    | { user_id: string }
    | undefined;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);

  if (session) {
    appendAudit(
      session.user_id,
      'AUTH_LOGOUT',
      'session',
      session.user_id,
      { status: 'authenticated' },
      { status: 'logged_out' }
    );
  }
}
