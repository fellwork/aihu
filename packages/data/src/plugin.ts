import type { Plugin } from '@scribe/plugin'

/**
 * `@scribe/data` plugin — registration shim.
 *
 * Registers the data package under the Plugin Contract (Plugin Contract Spec
 * §1.1, §3, §7.1). v0.2.6 ships registration plumbing only; no macro
 * contributions are wired until v0.4 lowers `$resource`.
 *
 * We construct the Plugin object directly (satisfying the `Plugin` type
 * contract by including `__scribe_plugin: true`) rather than calling
 * `definePlugin()` from `@scribe/plugin`. This keeps `@scribe/plugin` as a
 * build/type-only dependency with zero runtime footprint — per Learning #49
 * (v3 dep-free thesis) and the spec's intent that plugin registration is
 * build-time only.
 *
 * The `data()` factory exported from `@scribe/data` calls through to this
 * instance. Consumers register it via:
 *   defineScribeConfig({ plugins: [data()] })
 */
export const dataPlugin: Plugin = {
  name: 'data',
  version: '0.0.0',
  namespace: 'data',
  contributes: {}, // no-op until v0.4 lowers $resource
  __scribe_plugin: true,
}
