/**
 * lit-html adapter for the arbor bench harness.
 *
 * lit-html has no built-in fine-grained signals. Every `update()` call
 * triggers a full re-render of the bound template. For mount-only workloads
 * (mount-10k-leaves, mount-deep-100x10, mount-wide-1000), `update()` is
 * intentionally unused and `dispose()` is `render(nothing, host)`.
 *
 * **Honest note (design §5.3).** Because lit has no signals, the
 * `update-1-of-10k-leaves` and `attr-thrash-100x100` workloads incur a
 * full re-render per update rather than a single node patch. The bench
 * reports this honestly — it is a real cost, not a bug.
 */

import { html, nothing, render } from 'lit-html'
import type { TemplateResult } from 'lit-html'
import type { AdapterContext, DomAdapter } from '../types.ts'

/**
 * Slot for the static-mount template factory. Set by the workload before
 * calling `adapter.setup(host)`.
 */
let pendingTemplate: (() => TemplateResult) | null = null

/**
 * Slot for the update-path template factory. Receives the current value and
 * returns a new TemplateResult. Each call causes a full re-render — see note
 * above.
 */
let pendingUpdater: ((value: unknown) => TemplateResult) | null = null

/** Workload-side helper: register the static template before `setup()`. */
export function setLitTemplate(fn: () => TemplateResult): void {
  pendingTemplate = fn
}

/** Workload-side helper: register the update template factory before `setup()`. */
export function setLitUpdater(fn: (v: unknown) => TemplateResult): void {
  pendingUpdater = fn
}

export const lit: DomAdapter = {
  name: 'lit-html',
  version: '3.2.1',
  setup(host) {
    const template = pendingTemplate
    const updater = pendingUpdater
    pendingTemplate = null
    pendingUpdater = null

    // lit-html's render() expects HTMLElement | DocumentFragment; cast via any
    // since we pass JSDOM Elements exposed as the generic Element type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const litHost = host as any

    const ctx: AdapterContext = {
      mount() {
        if (template) render(template(), litHost)
      },
      /**
       * Full re-render with a new TemplateResult derived from `value`.
       * lit-html has no fine-grained reactivity — every update is a full
       * template diff. Reported as-is per design §5.3 honesty requirements.
       */
      update(value) {
        if (updater) render(updater(value), litHost)
      },
      dispose() {
        render(nothing, litHost)
      },
    }

    return {
      value: ctx,
      dispose: () => {
        render(nothing, litHost)
      },
    }
  },
}
