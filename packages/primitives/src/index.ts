/**
 * @aihu/primitives — headless behavior primitives (WAI-ARIA APG patterns as
 * vanilla custom elements). Zero CSS: each primitive emits DOM structure +
 * ARIA + `data-state` and owns its state on `@aihu/signals`. Consumers style
 * via the CSS engine's `cn()` + style packs.
 *
 * The barrel re-exports the shared DOM-walk context util + every primitive's
 * public surface as each lands. Per-primitive subpath entries
 * (`@aihu/primitives/<name>`) exist for tree-shaking + per-primitive size
 * budgets.
 */

/** Package version sentinel — replaced by the real surface as primitives land. */
export const PRIMITIVES_PACKAGE = '@aihu/primitives'
