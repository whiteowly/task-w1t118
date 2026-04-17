import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../../src/server/middleware/error-handler';

function callErrorHandler(err: unknown) {
  let statusCode = 0;
  let body: unknown = null;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(data: unknown) { body = data; return this; }
  };
  errorHandler(err as any, {} as any, res as any, (() => {}) as any);
  return { statusCode, body };
}

describe('error handler middleware', () => {
  it('maps VALIDATION_ERROR to 400', () => {
    const { statusCode, body } = callErrorHandler(
      Object.assign(new Error('Bad input'), { code: 'VALIDATION_ERROR' })
    );
    expect(statusCode).toBe(400);
    expect((body as any).error.code).toBe('VALIDATION_ERROR');
  });

  it('maps PERMISSION_DENIED to 403', () => {
    const { statusCode } = callErrorHandler(
      Object.assign(new Error('Denied'), { code: 'PERMISSION_DENIED' })
    );
    expect(statusCode).toBe(403);
  });

  it('maps RECORD_NOT_FOUND to 404', () => {
    const { statusCode } = callErrorHandler(
      Object.assign(new Error('Missing'), { code: 'RECORD_NOT_FOUND' })
    );
    expect(statusCode).toBe(404);
  });

  it('maps CONFLICT to 409', () => {
    const { statusCode } = callErrorHandler(
      Object.assign(new Error('Conflict'), { code: 'CONFLICT' })
    );
    expect(statusCode).toBe(409);
  });

  it('maps DUPLICATE_REQUEST to 409', () => {
    const { statusCode } = callErrorHandler(
      Object.assign(new Error('Dup'), { code: 'DUPLICATE_REQUEST' })
    );
    expect(statusCode).toBe(409);
  });

  it('maps LOCK_UNAVAILABLE to 423', () => {
    const { statusCode } = callErrorHandler(
      Object.assign(new Error('Locked'), { code: 'LOCK_UNAVAILABLE' })
    );
    expect(statusCode).toBe(423);
  });

  it('maps SESSION_LOCKED to 401', () => {
    const { statusCode } = callErrorHandler(
      Object.assign(new Error('Auth'), { code: 'SESSION_LOCKED' })
    );
    expect(statusCode).toBe(401);
  });

  it('maps unknown errors to 500', () => {
    const { statusCode, body } = callErrorHandler(new Error('Boom'));
    expect(statusCode).toBe(500);
    expect((body as any).error.code).toBe('UNKNOWN_ERROR');
  });

  it('includes fieldErrors when present', () => {
    const { body } = callErrorHandler(
      Object.assign(new Error('Validation'), {
        code: 'VALIDATION_ERROR',
        fieldErrors: { name: ['required'] }
      })
    );
    expect((body as any).error.fieldErrors).toEqual({ name: ['required'] });
  });
});
