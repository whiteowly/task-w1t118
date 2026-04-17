import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app';
import { resetDbForTests } from '../../src/server/db/connection';
import { initializeSchema } from '../../src/server/db/schema';
import type { Express } from 'express';

let app: Express;

beforeEach(() => {
  const db = resetDbForTests(':memory:');
  initializeSchema(db);
  app = createApp();
});

async function bootstrapAndLogin() {
  const agent = request(app);
  await agent.post('/api/v1/auth/bootstrap-admin').send({
    username: 'admin',
    password: 'password-123',
    confirmPassword: 'password-123'
  });
  const res = await agent.post('/api/v1/auth/login').send({
    username: 'admin',
    password: 'password-123'
  });
  return res.body.token as string;
}

describe('POST /api/v1/auth/bootstrap-admin', () => {
  it('creates the first admin user', async () => {
    const res = await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Administrator created.');
  });

  it('returns 400 when username is too short', async () => {
    const res = await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'ab',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'short',
      confirmPassword: 'short'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when passwords do not match', async () => {
    const res = await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-456'
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 when admin already exists', async () => {
    await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    const res = await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin2',
      password: 'password-456',
      confirmPassword: 'password-456'
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns token and user on success', async () => {
    await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'password-123'
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.roles).toContain('Administrator');
    expect(res.body.user.id).toBeTruthy();
  });

  it('returns 403 for wrong password', async () => {
    await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'admin',
      password: 'wrong-password'
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });

  it('returns 403 for non-existent user', async () => {
    await request(app).post('/api/v1/auth/bootstrap-admin').send({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-123'
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      username: 'nobody',
      password: 'password-123'
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PERMISSION_DENIED');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('logs out successfully', async () => {
    const token = await bootstrapAndLogin();
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out.');
  });

  it('succeeds even without a valid token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Logged out.');
  });
});
