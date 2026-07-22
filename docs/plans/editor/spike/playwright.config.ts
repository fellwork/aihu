// Phase-0 spike Playwright config. Run from apps/docs (where @playwright/test
// is installed):
//   cd apps/docs && bunx playwright test --config ../../docs/plans/editor/spike/playwright.config.ts
// Engines: chromium always; webkit when installed (SPIKE_WEBKIT=0 to skip).

import { defineConfig, devices } from '@playwright/test'

const projects = [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
if (process.env.SPIKE_WEBKIT !== '0') {
  projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } })
}
if (process.env.SPIKE_FIREFOX !== '0') {
  projects.push({ name: 'firefox', use: { ...devices['Desktop Firefox'] } })
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4187',
  },
  projects,
  webServer: {
    command: 'bun serve.ts 4187',
    url: 'http://localhost:4187',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
