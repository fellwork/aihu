import { mount } from '@aihu/arbor'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'

// Wire the runtime to the arbor mount function and signals factory
_setMount(mount)
_setSignal(signal)

// Import the counter component — defineElement registers the custom element
import './counter.aihu'
