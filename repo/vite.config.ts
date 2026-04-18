import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const apiProxyTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3001';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ['browser']
  },
  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'tests/unit/**/*.test.ts',
      'tests/integration/**/*.test.ts',
      'tests/component/**/*.test.ts'
    ],
    exclude: ['tests/e2e/**', 'tests/api/**']
  }
});
