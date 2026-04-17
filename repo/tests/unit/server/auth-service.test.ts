import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../../../src/server/db/connection';
import { initializeSchema } from '../../../src/server/db/schema';
import { bootstrapAdmin, login, logout } from '../../../src/server/services/auth-service';

beforeEach(() => {
  const db = resetDbForTests(':memory:');
  initializeSchema(db);
});

describe('auth service edge cases', () => {
  it('rejects bootstrap with username shorter than 3 chars', () => {
    expect(() => bootstrapAdmin({ username: 'ab', password: 'password-123', confirmPassword: 'password-123' }))
      .toThrow();
  });

  it('rejects bootstrap with password shorter than 8 chars', () => {
    expect(() => bootstrapAdmin({ username: 'admin', password: 'short', confirmPassword: 'short' }))
      .toThrow();
  });

  it('rejects bootstrap when passwords do not match', () => {
    expect(() => bootstrapAdmin({ username: 'admin', password: 'password-123', confirmPassword: 'different-456' }))
      .toThrow();
  });

  it('rejects login for non-existent user', () => {
    expect(() => login({ username: 'ghost', password: 'anything' })).toThrow('Invalid username or password.');
  });

  it('rejects login with wrong password', () => {
    bootstrapAdmin({ username: 'admin', password: 'password-123', confirmPassword: 'password-123' });
    expect(() => login({ username: 'admin', password: 'wrong-password' })).toThrow('Invalid username or password.');
  });

  it('creates valid session on successful login', () => {
    bootstrapAdmin({ username: 'admin', password: 'password-123', confirmPassword: 'password-123' });
    const result = login({ username: 'admin', password: 'password-123' });
    expect(result.token).toBeTruthy();
    expect(result.user.username).toBe('admin');
    expect(result.user.roles).toEqual(['Administrator']);
  });

  it('logout does not throw for unknown token', () => {
    expect(() => logout('nonexistent-token')).not.toThrow();
  });
});
