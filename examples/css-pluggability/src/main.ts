/**
 * Entry point — wires the @aihu/arbor `mount` injection (per spec §2.4
 * forbidding source-level value imports across packages) and registers
 * the two compiled components.
 */
import { mount } from '@aihu/arbor'
import { _setMount } from '@aihu/runtime'

_setMount(mount)

// The compiled .aihu modules self-register via defineElement().
// Importing them is enough to mount them.
import './components/pluggable-card.js'
import './components/pluggable-button.js'
