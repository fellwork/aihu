import type { WorkloadDefinition } from '../types.ts'
import { batchedWrites100 } from './batched-writes-100.ts'
import { cellx } from './cellx.ts'
import { creation1to1000 } from './creation-1to1000.ts'
import { deepPropagation100 } from './deep-propagation-100.ts'
import { dynamicDeps } from './dynamic-deps.ts'
import { wideFanout100 } from './wide-fanout-100.ts'

export const workloads: readonly WorkloadDefinition[] = [
  cellx,
  wideFanout100,
  batchedWrites100,
  deepPropagation100,
  dynamicDeps,
  creation1to1000,
]
