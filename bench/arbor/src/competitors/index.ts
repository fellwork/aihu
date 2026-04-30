/**
 * Ordered list of competitors. scribe stays first so it anchors the table; the
 * rest go by descending market share when they land in spawn 2.
 *
 * Spawn 1: scribe only. Spawn 2 adds lit, solid, vue, preact, vanilla.
 */

import type { DomAdapter } from '../types.ts'
import { scribe } from './scribe.ts'

export const competitors: readonly DomAdapter[] = [scribe]
