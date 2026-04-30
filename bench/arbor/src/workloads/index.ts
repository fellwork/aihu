/**
 * Ordered list of workloads per Round N+1 design §3.2.
 *
 * Spawn 1: mount-10k-leaves only (one cell to prove the pipeline).
 * Spawn 2: all 6 workloads wired.
 */

import type { WorkloadDefinition } from '../types.ts'
import { attrThrash } from './attr-thrash-100x100.ts'
import { krausest1k } from './krausest-1k-cycle.ts'
import { mountDeep } from './mount-deep-100x10.ts'
import { mountTenK } from './mount-10k-leaves.ts'
import { mountWide } from './mount-wide-1000.ts'
import { updateOneOfTenK } from './update-1-of-10k-leaves.ts'

export const workloads: readonly WorkloadDefinition[] = [
  mountTenK,
  mountDeep,
  mountWide,
  updateOneOfTenK,
  attrThrash,
  krausest1k,
]
