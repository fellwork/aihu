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

export { AihuButton, type ButtonType, defineButton } from './button/index.ts'
// Phase 2 primitives.
export {
  AihuCheckboxIndicator,
  AihuCheckboxRoot,
  type CheckboxContextValue,
  type CheckboxState,
  checkboxContext,
  defineCheckbox,
} from './checkbox/index.ts'
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
  type FocusTrapOptions,
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
  attachHiddenInput,
  defineFormControl,
  type FormControlContextValue,
  formControlContext,
  type HiddenInputOptions,
} from './form-control/index.ts'
export { AihuInput, AihuTextControlBase, defineInput } from './input/index.ts'
export { AihuLabel, defineLabel } from './label/index.ts'
// Phase 0 primitives.
export { AihuPresenceGate, definePresenceGate, presenceContext } from './presence-gate/index.ts'
export {
  AihuRadioGroupIndicator,
  AihuRadioGroupItem,
  AihuRadioGroupRoot,
  defineRadioGroup,
  type RadioGroupContextValue,
  type RadioGroupItemContextValue,
  radioGroupContext,
  radioGroupItemContext,
} from './radio-group/index.ts'
export { AihuRovingFocus, defineRovingFocus, type Orientation } from './roving-focus/index.ts'
export {
  AihuSeparator,
  defineSeparator,
  type SeparatorOrientation,
} from './separator/index.ts'
export {
  AihuSwitchRoot,
  AihuSwitchThumb,
  defineSwitch,
  type SwitchContextValue,
  switchContext,
} from './switch/index.ts'
export { AihuTextarea, defineTextarea } from './textarea/index.ts'
export {
  AihuTooltipContent,
  AihuTooltipRoot,
  AihuTooltipTrigger,
  defineTooltip,
  type TooltipContextValue,
  type TooltipCoords,
  tooltipContext,
} from './tooltip/index.ts'
