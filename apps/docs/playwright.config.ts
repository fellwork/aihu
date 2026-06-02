// apps/docs/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 1,
  use: {
    baseURL: 'http://localhost:8788',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bunx wrangler pages dev dist/ --port 8788 --compatibility-date=2026-05-28',
    url: 'http://localhost:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
