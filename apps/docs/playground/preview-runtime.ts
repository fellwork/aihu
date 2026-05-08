// Runtime bundle for the playground preview iframe.
// Exported as an IIFE (window.__aihu) so compiled component code can run
// without a bundler. _setMount/_setSignal are included so the iframe can
// wire the runtime before executing each compiled component.
export { branch, leaf, mount, slot, when, each } from '@aihu/arbor'
export { signal, computed, effect, batch } from '@aihu/signals'
export {
  defineComponent,
  defineElement,
  _setMount,
  _setSignal,
  onMount,
  onCleanup,
  onAdopt,
  onAttributeChange,
} from '@aihu/runtime'
