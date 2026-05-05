import type { SignalAdapter } from '../types.ts'
import { aihu } from './aihu.ts'
import { alien } from './alien.ts'
import { preact } from './preact.ts'
import { sjs } from './sjs.ts'
import { solid } from './solid.ts'
import { vue } from './vue.ts'

/** Order matters: aihu first so it anchors the table; the rest by descending market share. */
export const competitors: readonly SignalAdapter[] = [aihu, alien, preact, vue, solid, sjs]
