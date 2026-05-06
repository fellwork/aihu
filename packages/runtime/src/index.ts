/** @internal */
/** @internal */

// arch-5 M1 a11y primitives — RFC-A5-017..021. Pure tree-shakable helpers;
// only consumed by SFCs that use <$focusTrap> / $announce / sr-only / skip-link
// lowerings.
export { _ensureA11yStyles, announce, createFocusTrap } from './a11y.ts'
export {
  _hmrReplace,
  _onCleanup as onCleanup,
  _onMount as onMount,
  _setMount,
  _setSignal,
  defineComponent,
} from './define-component.ts'
/** @internal */
export { _setHydrate, defineElement } from './define-element.ts'
/** @internal */
export { _hydrateOnVisible } from './hydrate-on-visible.ts'
export type {
  ComponentOptions,
  DefineOptions,
  PropDef,
  PropsConfig,
  PropSignal,
  Setup,
  SetupContext,
  ShadowMode,
} from './types.ts'
