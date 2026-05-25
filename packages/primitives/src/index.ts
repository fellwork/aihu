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
  AihuCollection,
  type CollectionContextValue,
  collectionContext,
  createCollection,
  defineCollection,
} from './collection/index.ts'
export {
  AihuConfigProvider,
  type ColorScheme,
  type ConfigContextValue,
  configContext,
  type Density,
  type Direction,
  defineConfigProvider,
} from './config-provider/index.ts'
// Phase 1 primitives.
export {
  AihuDialogBackdrop,
  AihuDialogClose,
  AihuDialogContent,
  AihuDialogDescription,
  AihuDialogRoot,
  AihuDialogTitle,
  AihuDialogTrigger,
  createFocusTrap,
  type DialogContextValue,
  defineDialog,
  dialogContext,
  type FocusTrap,
} from './dialog/index.ts'
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
export { AihuRovingFocus, defineRovingFocus, type Orientation } from './roving-focus/index.ts'
export {
  AihuTooltipContent,
  AihuTooltipRoot,
  AihuTooltipTrigger,
  defineTooltip,
  type TooltipContextValue,
  type TooltipCoords,
  tooltipContext,
} from './tooltip/index.ts'
