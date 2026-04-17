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

describe('GET /api/v1/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeTruthy();
  });
});
