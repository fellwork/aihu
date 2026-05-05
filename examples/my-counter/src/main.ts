import { mount } from '@aihu/arbor'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'

// Wire the runtime to the arbor mount function and signals factory.
// These must be called BEFORE the component module executes, because
// defineElement → customElements.define causes an immediate connectedCallback
// on any element already in the DOM. Static imports are hoisted and would
// fire before this body runs — use top-level await import instead.
_setMount(mount)
_setSignal(signal)

// Dynamic import: resolves after the lines above have executed, so
// _mount and _signal are set before defineElement fires.
await import('./my-counter.aihu')
