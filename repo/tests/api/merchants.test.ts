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

async function getAdminToken(agent: request.SuperTest<request.Test>) {
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

describe('GET /api/v1/merchants', () => {
  it('returns empty array initially', async () => {
    const token = await getAdminToken(request(app));
    const res = await request(app)
      .get('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns merchants after creation', async () => {
    const token = await getAdminToken(request(app));
    await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Merchant', description: 'A test', tags: [], amenities: [] });
    const res = await request(app)
      .get('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].snapshot.name).toBe('Test Merchant');
  });
});

describe('POST /api/v1/merchants', () => {
  it('creates a draft merchant', async () => {
    const token = await getAdminToken(request(app));
    const res = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Merchant', description: 'Desc', tags: ['food'], amenities: ['wifi'] });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.workflowState).toBe('draft');
    expect(res.body.snapshot.name).toBe('New Merchant');
    expect(res.body.snapshot.tags).toEqual(['food']);
    expect(res.body.snapshot.amenities).toEqual(['wifi']);
  });

  it('returns 400 when name is empty', async () => {
    const token = await getAdminToken(request(app));
    const res = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '', description: 'Desc', tags: [], amenities: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /api/v1/merchants/:id', () => {
  it('updates a draft merchant', async () => {
    const token = await getAdminToken(request(app));
    const created = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Original', description: '', tags: [], amenities: [] });
    const merchantId = created.body.id;
    const res = await request(app)
      .patch(`/api/v1/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        expectedVersionNo: 1,
        name: 'Updated',
        description: 'New desc',
        tags: ['updated'],
        amenities: [],
        imageAssetId: null
      });
    expect(res.status).toBe(200);
    expect(res.body.snapshot.name).toBe('Updated');
    expect(res.body.latestVersionNo).toBe(2);
  });
});

describe('POST /api/v1/merchants/:id/submit', () => {
  it('submits a draft for review', async () => {
    const token = await getAdminToken(request(app));
    const created = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Submit Me', description: '', tags: [], amenities: [] });
    const merchantId = created.body.id;
    const res = await request(app)
      .post(`/api/v1/merchants/${merchantId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Merchant submitted for review.');
  });
});

describe('POST /api/v1/merchants/:id/approve', () => {
  it('approves an in-review merchant', async () => {
    const token = await getAdminToken(request(app));
    const created = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Approve Me', description: '', tags: [], amenities: [] });
    const merchantId = created.body.id;
    await request(app)
      .post(`/api/v1/merchants/${merchantId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .post(`/api/v1/merchants/${merchantId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Merchant approved.');
  });
});

describe('POST /api/v1/merchants/:id/reject', () => {
  it('rejects an in-review merchant', async () => {
    const token = await getAdminToken(request(app));
    const created = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Reject Me', description: '', tags: [], amenities: [] });
    const merchantId = created.body.id;
    await request(app)
      .post(`/api/v1/merchants/${merchantId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const res = await request(app)
      .post(`/api/v1/merchants/${merchantId}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Needs more info' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Merchant rejected.');
  });
});

describe('POST /api/v1/merchants/:id/publish', () => {
  it('publishes an approved merchant', async () => {
    const token = await getAdminToken(request(app));
    const created = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Publish Me', description: '', tags: [], amenities: [] });
    const merchantId = created.body.id;
    await request(app)
      .post(`/api/v1/merchants/${merchantId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    await request(app)
      .post(`/api/v1/merchants/${merchantId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    const res = await request(app)
      .post(`/api/v1/merchants/${merchantId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Merchant published.');
  });
});

describe('merchant full workflow', () => {
  it('creates, submits, approves, and publishes a merchant', async () => {
    const token = await getAdminToken(request(app));

    const created = await request(app)
      .post('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Workflow Merchant', description: 'Full flow', tags: ['test'], amenities: [] });
    expect(created.status).toBe(201);
    const merchantId = created.body.id;
    expect(created.body.workflowState).toBe('draft');

    const submitted = await request(app)
      .post(`/api/v1/merchants/${merchantId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(submitted.status).toBe(200);

    const listAfterSubmit = await request(app)
      .get('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`);
    expect(listAfterSubmit.body[0].workflowState).toBe('in_review');

    const approved = await request(app)
      .post(`/api/v1/merchants/${merchantId}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(approved.status).toBe(200);

    const listAfterApprove = await request(app)
      .get('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`);
    expect(listAfterApprove.body[0].workflowState).toBe('approved');

    const published = await request(app)
      .post(`/api/v1/merchants/${merchantId}/publish`)
      .set('Authorization', `Bearer ${token}`);
    expect(published.status).toBe(200);

    const listAfterPublish = await request(app)
      .get('/api/v1/merchants')
      .set('Authorization', `Bearer ${token}`);
    expect(listAfterPublish.body[0].workflowState).toBe('published');
  });
});

describe('merchant auth requirement', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/v1/merchants');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_LOCKED');
  });
});
