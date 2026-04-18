import { defineConfig, devices } from '@playwright/test';

const apiHealthUrl = process.env.PLAYWRIGHT_API_HEALTH_URL ?? 'http://127.0.0.1:3001/api/v1/health';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: `node ./scripts/wait-for-url.mjs ${apiHealthUrl} && npm run dev -- --host 127.0.0.1 --port 4173`,
    port: 4173,
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
