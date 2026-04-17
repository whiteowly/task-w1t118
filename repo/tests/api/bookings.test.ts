import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/app';
import { resetDbForTests } from '../../src/server/db/connection';
import { initializeSchema } from '../../src/server/db/schema';
import type { Express } from 'express';
import crypto from 'node:crypto';

let app: Express;

beforeEach(() => {
  const db = resetDbForTests(':memory:');
  initializeSchema(db);
  app = createApp();
});

async function getAdminToken() {
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

function futureIso(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function futureDateKey(): string {
  const d = new Date(Date.now() + 4 * 60 * 60_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('GET /api/v1/bookings/availability', () => {
  it('returns availability grid for a date', async () => {
    const token = await getAdminToken();
    const date = futureDateKey();
    const res = await request(app)
      .get(`/api/v1/bookings/availability?date=${date}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(date);
    expect(res.body.rows).toBeTruthy();
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.rows.length).toBeGreaterThan(0);
    expect(res.body.rows[0].cells).toBeTruthy();
    expect(res.body.rows[0].cells.length).toBe(3);
  });
});

describe('GET /api/v1/bookings', () => {
  it('returns bookings for a date', async () => {
    const token = await getAdminToken();
    const date = futureDateKey();
    const res = await request(app)
      .get(`/api/v1/bookings?date=${date}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/v1/bookings', () => {
  it('creates a booking', async () => {
    const token = await getAdminToken();
    const startsAt = futureIso(240);
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: 'patio-a',
        startsAt,
        durationMinutes: 30,
        customerName: 'Alice',
        partySize: 2,
        notes: 'Window seat',
        idempotencyKey: crypto.randomUUID()
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.resourceId).toBe('patio-a');
    expect(res.body.resourceLabel).toBe('Patio A');
    expect(res.body.customerName).toBe('Alice');
    expect(res.body.partySize).toBe(2);
    expect(res.body.status).toBe('confirmed');
  });

  it('returns 400 for missing required fields', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: 'patio-a'
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 409 for duplicate idempotency key', async () => {
    const token = await getAdminToken();
    const startsAt = futureIso(240);
    const idempotencyKey = crypto.randomUUID();
    const payload = {
      resourceId: 'patio-a',
      startsAt,
      durationMinutes: 30,
      customerName: 'Bob',
      partySize: 1,
      notes: '',
      idempotencyKey
    };
    await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_REQUEST');
  });
});

describe('POST /api/v1/bookings/:id/reschedule', () => {
  it('reschedules an existing booking', async () => {
    const token = await getAdminToken();
    const startsAt = futureIso(240);
    const created = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: 'patio-a',
        startsAt,
        durationMinutes: 30,
        customerName: 'Carol',
        partySize: 3,
        notes: '',
        idempotencyKey: crypto.randomUUID()
      });
    const bookingId = created.body.id;
    const newStartsAt = futureIso(300);
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/reschedule`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: 'patio-b',
        startsAt: newStartsAt,
        durationMinutes: 60,
        idempotencyKey: crypto.randomUUID()
      });
    expect(res.status).toBe(200);
    expect(res.body.resourceId).toBe('patio-b');
    expect(res.body.resourceLabel).toBe('Patio B');
    expect(res.body.startsAt).toBe(newStartsAt);
  });
});

describe('POST /api/v1/bookings/:id/cancel', () => {
  it('cancels a confirmed booking', async () => {
    const token = await getAdminToken();
    const startsAt = futureIso(600);
    const created = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: 'dining-room',
        startsAt,
        durationMinutes: 30,
        customerName: 'Dave',
        partySize: 4,
        notes: '',
        idempotencyKey: crypto.randomUUID()
      });
    const bookingId = created.body.id;
    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        reason: 'Change of plans',
        idempotencyKey: crypto.randomUUID()
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toMatch(/cancelled|late_cancelled/);
    expect(res.body.cancellationReason).toBe('Change of plans');
  });
});

describe('booking conflict', () => {
  it('returns 409 when booking same resource and overlapping time', async () => {
    const token = await getAdminToken();
    const startsAt = futureIso(240);
    await request(app).post('/api/v1/bookings').set('Authorization', `Bearer ${token}`).send({
      resourceId: 'patio-a',
      startsAt,
      durationMinutes: 60,
      customerName: 'First',
      partySize: 2,
      notes: '',
      idempotencyKey: crypto.randomUUID()
    });
    const res = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceId: 'patio-a',
        startsAt,
        durationMinutes: 30,
        customerName: 'Second',
        partySize: 1,
        notes: '',
        idempotencyKey: crypto.randomUUID()
      });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

describe('booking auth requirement', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get(`/api/v1/bookings?date=${futureDateKey()}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_LOCKED');
  });
});
