// apps/docs/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5176',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `vite preview` over the real SSG dist/ — no SPA fallback needed, every
    // route (and its flat extensionless sibling — see vite.config.ts's
    // flatHtmlSiblings) is a real file on disk.
    command: 'bun run preview',
    url: 'http://localhost:5176',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
