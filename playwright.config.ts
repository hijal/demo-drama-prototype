import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3107',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3107',
    env: { PORT: '3107' },
    reuseExistingServer: false,
    timeout: 120000,
  },
})
