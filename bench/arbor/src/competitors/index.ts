/**
 * Ordered list of competitors. aihu first (anchors table); then by
 * descending ecosystem market share.
 *
 * Spawn 1: aihu only. Spawn 2 adds lit, solid, vue, preact, vanilla.
 */

import type { DomAdapter } from '../types.ts'
import { aihu } from './aihu.ts'
import { lit } from './lit.ts'
import { preact } from './preact.ts'
import { solid } from './solid.ts'
import { vanilla } from './vanilla.ts'
import { vue } from './vue.ts'

// Aihu first (anchors table); then by descending ecosystem market share.
export const competitors: readonly DomAdapter[] = [aihu, lit, solid, vue, preact, vanilla]
