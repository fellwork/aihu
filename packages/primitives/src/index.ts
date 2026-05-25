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

export {
  AihuConfigProvider,
  type ColorScheme,
  type ConfigContextValue,
  configContext,
  type Density,
  type Direction,
  defineConfigProvider,
} from './config-provider/index.ts'
export type { DomContext } from './dom-context.ts'
// Shared DOM-walk context (Option C — self-contained, does NOT import
// @aihu/context).
export {
  createDomContext,
  injectContext,
  MissingContextError,
  provideContext,
} from './dom-context.ts'
export {
  AihuFormControl,
  defineFormControl,
  type FormControlContextValue,
  formControlContext,
} from './form-control/index.ts'
// Phase 0 primitives.
export { AihuPresenceGate, definePresenceGate, presenceContext } from './presence-gate/index.ts'
