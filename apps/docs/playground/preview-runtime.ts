// Runtime bundle for the playground preview iframe.
// Exported as an IIFE (window.__aihu) so compiled component code can run
// without a bundler. _setMount/_setSignal are included so the iframe can
// wire the runtime before executing each compiled component.
export { branch, each, leaf, mount, slot, when } from '@aihu/arbor'
export {
  _setMount,
  _setSignal,
  defineComponent,
  defineElement,
  onAdopt,
  onAttributeChange,
  onCleanup,
  onMount,
} from '@aihu/runtime'
export { batch, computed, effect, signal } from '@aihu/signals'
