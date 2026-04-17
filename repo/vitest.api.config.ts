import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/api/**/*.test.ts'],
    testTimeout: 15_000
  }
});
