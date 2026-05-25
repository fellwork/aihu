import type { Plugin } from '@aihu/plugin'

/**
 * `@aihu-plugin/kindly-note` plugin — registration shim.
 *
 * Registers the kindly-note highlighting package under the Plugin Contract
 * (Plugin Contract Spec §1.1, §3, §7.1). Like `@aihu-plugin/data`, this ships
 * registration plumbing only: `@aihu/plugin`'s macro lowering is a v0.4 no-op,
 * so there are no macro contributions to wire (`contributes: {}`).
 *
 * We construct the Plugin object directly (satisfying the `Plugin` type by
 * including `__aihu_plugin: true`) rather than calling `definePlugin()` from
 * `@aihu/plugin`. This keeps `@aihu/plugin` a build/type-only dependency with
 * zero runtime footprint — per Learning #49 (dep-free thesis) and the spec's
 * intent that plugin registration is build-time only.
 *
 * The `kindlyNote()` factory exported from the package entry calls through to
 * this instance. Consumers register it via:
 *   defineAihuConfig({ plugins: [kindlyNote()] })
 */
export const kindlyNotePlugin: Plugin = {
  name: 'kindly-note',
  version: '0.0.0',
  namespace: 'kindly-note',
  contributes: {}, // no-op: @aihu/plugin macro lowering is a v0.4 no-op
  __aihu_plugin: true,
}
