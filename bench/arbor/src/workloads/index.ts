/**
 * Ordered list of workloads. Spawn 1 lands `mount-10k-leaves` only;
 * spawn 2 adds the remaining 5 (mount-deep-100x10, mount-wide-1000,
 * update-1-of-10k-leaves, attr-thrash-100x100, krausest-1k-cycle) per
 * design §3.2.
 */

import type { WorkloadDefinition } from '../types.ts'
import { mountTenK } from './mount-10k-leaves.ts'

export const workloads: readonly WorkloadDefinition[] = [mountTenK]
