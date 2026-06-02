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
    // Deterministic static server (mirrors CF Pages ASSETS: dir-index + SPA
    // fallback) instead of `wrangler pages dev`, which won't start reliably in
    // CI (compat-date drift + bunx cold-download blow the readiness timeout).
    // See apps/docs/scripts/serve-dist.ts + issue #314. No e2e needs the live
    // worker (prerender.spec drives dist/_worker.js in-process).
    command: 'bun scripts/serve-dist.ts 8788',
    url: 'http://localhost:8788',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
