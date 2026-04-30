/**
 * Ordered list of competitors. scribe first (anchors table); then by
 * descending ecosystem market share.
 *
 * Spawn 1: scribe only. Spawn 2 adds lit, solid, vue, preact, vanilla.
 */

import type { DomAdapter } from '../types.ts'
import { lit } from './lit.ts'
import { preact } from './preact.ts'
import { scribe } from './scribe.ts'
import { solid } from './solid.ts'
import { vanilla } from './vanilla.ts'
import { vue } from './vue.ts'

// Scribe first (anchors table); then by descending ecosystem market share.
export const competitors: readonly DomAdapter[] = [scribe, lit, solid, vue, preact, vanilla]
