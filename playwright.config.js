import { defineConfig, devices } from '@playwright/test';

// Drives the real Mini App (index.html + app.js) against the real API handlers through
// tests/harness.mjs. Only the native Telegram payment sheet is stubbed.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${process.env.E2E_PORT || 3311}`,
    viewport: { width: 420, height: 860 },
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node tests/harness.mjs`,
    url: `http://localhost:${process.env.E2E_PORT || 3311}/locales/en.json`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
    env: { PORT: String(process.env.E2E_PORT || 3311) }
  }
});
