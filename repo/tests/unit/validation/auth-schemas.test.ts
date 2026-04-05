import { describe, expect, it } from 'vitest';

import { bootstrapAdminSchema } from '../../../src/core/validation/auth-schemas';

describe('auth schema validation', () => {
  it('rejects mismatched bootstrap password confirmation', () => {
    const result = bootstrapAdminSchema.safeParse({
      username: 'admin',
      password: 'password-123',
      confirmPassword: 'password-124'
    });

    expect(result.success).toBe(false);
  });

  it('accepts valid bootstrap credentials', () => {
    const result = bootstrapAdminSchema.safeParse({
      username: 'adminuser',
      password: 'password-123',
      confirmPassword: 'password-123'
    });

    expect(result.success).toBe(true);
  });
});
