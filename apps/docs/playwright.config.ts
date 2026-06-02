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
    // Runs the real worker.ts over a static dist/ shim (tests/serve-docs.ts) —
    // no wrangler/workerd/compat-date flakiness (issue #314). Build runs first.
    command: 'bun tests/serve-docs.ts',
    url: 'http://localhost:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
