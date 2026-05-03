export { defineComponent } from './define-component.ts'
export { defineElement } from './define-element.ts'
export type { ComponentOptions, DefineOptions, Setup, SetupContext, ShadowMode } from './types.ts'
export { _onMount as onMount, _onCleanup as onCleanup } from './define-component.ts'

/** @internal */
export { _setMount, _setSignal } from './define-component.ts'
/** @internal */
export { _setHydrate } from './define-element.ts'
/** @internal */
export { _hmrReplace } from './define-component.ts'
/** @internal */
export { _hydrateOnVisible } from './hydrate-on-visible.ts'
