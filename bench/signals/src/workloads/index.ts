import type { WorkloadDefinition } from '../types.ts'
import { batchedWrites100 } from './batched-writes-100.ts'
import { cellx } from './cellx.ts'
import { wideFanout100 } from './wide-fanout-100.ts'

export const workloads: readonly WorkloadDefinition[] = [cellx, wideFanout100, batchedWrites100]
