/**
 * @aihu/ui registry schema (master CSS-engine spec §9.5).
 *
 * `@aihu/ui` is **source-distributed**: its payload is the `registry/**` `.aihu`
 * recipe sources plus a generated `registry.json` index. There is no runtime
 * bundle and no `.size-limit.json` row — the consumer's own build measures the
 * copied recipes (see `.size-limit.README.md`).
 *
 * NOTE (Task 2 scaffold): these are the spec §9.5 types verbatim. The
 * `registry.json` generator (Task 4) is INDEX-ONLY (R3) — it emits `path` per
 * `RegistryFile` but leaves `source` unset; `aihu add` reads the `.aihu` files
 * directly from the installed package. `RegistryFile.source` stays in the type
 * for the reserved hosted-registry path (v2).
 */

/** A declared variant axis → its allowed string values (e.g. `{ size: ['sm','md','lg'] }`). */
export type VariantMap = Record<string, string[]>

/** The kind of registry item. v1 ships only `ui`; the rest are schema-reserved. */
export type RegistryItemType = 'ui' | 'block' | 'style' | 'theme' | 'lib'

/** One file belonging to a registry item. */
export interface RegistryFile {
  /** Path relative to the package root (e.g. `registry/button/button.aihu`). */
  path: string
  /**
   * Inlined source. UNSET in the v1 local index (R3 — index-only); reserved for
   * the hosted-registry path where the index also serves source.
   */
  source?: string
  /** What role the file plays. */
  type: 'component' | 'style' | 'lib' | 'block'
}

/** A single catalog entry — one styled recipe (or, post-v1, a block/style/theme/lib). */
export interface RegistryItem {
  /** Recipe name (e.g. `button`). */
  name: string
  /** Item kind. */
  type: RegistryItemType
  /** Human-readable description for `aihu list`. */
  description?: string
  /** The files copied by `aihu add`. */
  files: RegistryFile[]
  /** npm package dependencies (e.g. `['@aihu/primitives']`) — NOT other recipes (R5). */
  dependencies?: string[]
  /** Other recipes in THIS registry that must be pulled transitively. */
  registryDependencies?: string[]
  /** Declared variant axes — validated against the recipe `@style` selectors. */
  variants?: VariantMap
  /** Free-form metadata. */
  meta?: Record<string, unknown>
}

/** The top-level `registry.json` artifact — the index `aihu add` reads. */
export interface Registry {
  items: RegistryItem[]
}
