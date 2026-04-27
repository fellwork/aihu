import type { SignalAdapter } from '../types.ts'
import { alien } from './alien.ts'
import { preact } from './preact.ts'
import { scribe } from './scribe.ts'
import { sjs } from './sjs.ts'
import { solid } from './solid.ts'
import { vue } from './vue.ts'

/** Order matters: scribe first so it anchors the table; the rest by descending market share. */
export const competitors: readonly SignalAdapter[] = [scribe, alien, preact, vue, solid, sjs]
