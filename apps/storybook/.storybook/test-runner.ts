/**
 * Storybook test-runner config (Plan 6 / spec §10.2–10.3): every story's play
 * function runs under Playwright, then axe sweeps the rendered canvas. Axe
 * failures fail the run — this is the CI merge gate (storybook.yml).
 *
 * Per-story a11y parameters are honored (the test-runner does not read them
 * by default): `parameters.a11y.disable` skips the sweep and
 * `parameters.a11y.config.rules` feeds axe rule overrides — used by DarkMode
 * stories to waive color-contrast until the css-engine emits fallback-style
 * host tokens (see the known-limitation note in preview.ts).
 */
import { getStoryContext, type TestRunnerConfig } from '@storybook/test-runner'
import { checkA11y, configureAxe, injectAxe } from 'axe-playwright'

const config: TestRunnerConfig = {
  async preVisit(page) {
    await injectAxe(page)
  },
  async postVisit(page, context) {
    const storyContext = await getStoryContext(page, context)
    const a11y = (storyContext.parameters?.a11y ?? {}) as {
      disable?: boolean
      config?: { rules?: Array<{ id: string; enabled: boolean }> }
    }
    if (a11y.disable === true) return

    await configureAxe(page, {
      rules: [
        // Stories are isolated fragments, not documents.
        { id: 'page-has-heading-one', enabled: false },
        { id: 'region', enabled: false },
        ...(a11y.config?.rules ?? []),
      ],
    })
    await checkA11y(page, '#storybook-root', {
      detailedReport: true,
      detailedReportOptions: { html: true },
    })
  },
}

export default config
