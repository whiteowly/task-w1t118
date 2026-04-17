import { beforeEach, describe, expect, it } from 'vitest';
import {
  requireAuth,
  requireCapability,
  type AuthenticatedRequest
} from '../../../src/server/middleware/auth';
import { resetDbForTests } from '../../../src/server/db/connection';
import { initializeSchema } from '../../../src/server/db/schema';
import { getDb } from '../../../src/server/db/connection';
import crypto from 'node:crypto';

beforeEach(() => {
  const db = resetDbForTests(':memory:');
  initializeSchema(db);
});

function createRes() {
  let statusCode = 0;
  let body: unknown = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      body = data;
      return this;
    }
  };
  return { res: res as any, getStatus: () => statusCode, getBody: () => body as any };
}

describe('requireAuth middleware', () => {
  it('returns 401 when no Authorization header is present', () => {
    const req = { headers: {} } as any;
    const { res, getStatus, getBody } = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    expect(getStatus()).toBe(401);
    expect(getBody().error.code).toBe('SESSION_LOCKED');
    expect(nextCalled).toBe(false);
  });

  it('returns 401 when token is not found in database', () => {
    const req = { headers: { authorization: 'Bearer nonexistent-token' } } as any;
    const { res, getStatus } = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    expect(getStatus()).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('returns 401 when session is expired', () => {
    const db = getDb();
    const userId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, roles, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, 'testuser', 'hash', '["Administrator"]', 'active', new Date().toISOString());
    const token = 'expired-token';
    const past = new Date(Date.now() - 60_000).toISOString();
    db.prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(token, userId, past, past);

    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const { res, getStatus } = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    expect(getStatus()).toBe(401);
    expect(nextCalled).toBe(false);
  });

  it('returns 403 when user is disabled', () => {
    const db = getDb();
    const userId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, roles, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, 'disabled', 'hash', '["Administrator"]', 'disabled', new Date().toISOString());
    const token = 'disabled-token';
    const future = new Date(Date.now() + 3600_000).toISOString();
    db.prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(token, userId, new Date().toISOString(), future);

    const req = { headers: { authorization: `Bearer ${token}` } } as any;
    const { res, getStatus, getBody } = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    expect(getStatus()).toBe(403);
    expect(getBody().error.code).toBe('PERMISSION_DENIED');
    expect(nextCalled).toBe(false);
  });

  it('sets userId, username, userRoles on req and calls next for valid session', () => {
    const db = getDb();
    const userId = crypto.randomUUID();
    db.prepare(
      'INSERT INTO users (id, username, password_hash, roles, status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(userId, 'gooduser', 'hash', '["BookingAgent"]', 'active', new Date().toISOString());
    const token = 'valid-token';
    const future = new Date(Date.now() + 3600_000).toISOString();
    db.prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
    ).run(token, userId, new Date().toISOString(), future);

    const req = { headers: { authorization: `Bearer ${token}` } } as AuthenticatedRequest;
    const { res } = createRes();
    let nextCalled = false;
    requireAuth(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
    expect(req.userId).toBe(userId);
    expect(req.username).toBe('gooduser');
    expect(req.userRoles).toEqual(['BookingAgent']);
  });
});

describe('requireCapability middleware', () => {
  it('calls next when role has capability', () => {
    const middleware = requireCapability('workspace.booking.manage');
    const req = { userRoles: ['BookingAgent'] } as any;
    const { res } = createRes();
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it('returns 403 when role lacks capability', () => {
    const middleware = requireCapability('workspace.merchant.editDraft');
    const req = { userRoles: ['BookingAgent'] } as any;
    const { res, getStatus, getBody } = createRes();
    let nextCalled = false;
    middleware(req, res, () => {
      nextCalled = true;
    });
    expect(getStatus()).toBe(403);
    expect(getBody().error.code).toBe('PERMISSION_DENIED');
    expect(nextCalled).toBe(false);
  });
});
