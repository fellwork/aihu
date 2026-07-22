// @aihu/editor e2e — real-browser acceptance (spec §10 view criteria).
// Run: cd packages/editor && bun run test:e2e
// Engines: chromium always; webkit/firefox when installed
// (EDITOR_WEBKIT=0 / EDITOR_FIREFOX=0 to skip).

import { defineConfig, devices } from '@playwright/test'

const projects = [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
if (process.env.EDITOR_WEBKIT !== '0') {
  projects.push({ name: 'webkit', use: { ...devices['Desktop Safari'] } })
}
if (process.env.EDITOR_FIREFOX !== '0') {
  projects.push({ name: 'firefox', use: { ...devices['Desktop Firefox'] } })
}

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4188',
  },
  projects,
  webServer: {
    command: 'bun serve.ts 4188',
    url: 'http://localhost:4188',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
