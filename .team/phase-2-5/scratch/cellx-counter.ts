/**
 * Investigation H4: Count actual recomputes + effect runs in cellx
 * (not the bench iterations themselves, but per-op fn-body invocations).
 *
 * Strategy: wrap each computed's fn with a counter, run the workload's
 * "run" repeatedly, and observe the per-iteration delta. This tells us
 * whether the architect's "16 inner computeds + 1 effect" model holds.
 */
import { computed, effect, signal } from '../../../packages/signals/src/index.ts'

interface Counters {
  l1: [number, number, number, number]
  l2: [number, number, number, number]
  l3: [number, number, number, number]
  l4: [number, number, number, number]
  effect: number
}

function buildCellx() {
  const counters: Counters = {
    l1: [0, 0, 0, 0],
    l2: [0, 0, 0, 0],
    l3: [0, 0, 0, 0],
    l4: [0, 0, 0, 0],
    effect: 0,
  }

  const [src, setSrc] = signal(0)

  const l1 = [
    computed(() => {
      counters.l1[0]++
      return src() + 0
    }),
    computed(() => {
      counters.l1[1]++
      return src() + 1
    }),
    computed(() => {
      counters.l1[2]++
      return src() + 2
    }),
    computed(() => {
      counters.l1[3]++
      return src() + 3
    }),
  ] as const

  const l2 = [
    computed(() => {
      counters.l2[0]++
      return l1[0]() + l1[1]()
    }),
    computed(() => {
      counters.l2[1]++
      return l1[1]() + l1[2]()
    }),
    computed(() => {
      counters.l2[2]++
      return l1[2]() + l1[3]()
    }),
    computed(() => {
      counters.l2[3]++
      return l1[3]() + l1[0]()
    }),
  ] as const

  const l3 = [
    computed(() => {
      counters.l3[0]++
      return l2[0]() + l2[1]()
    }),
    computed(() => {
      counters.l3[1]++
      return l2[1]() + l2[2]()
    }),
    computed(() => {
      counters.l3[2]++
      return l2[2]() + l2[3]()
    }),
    computed(() => {
      counters.l3[3]++
      return l2[3]() + l2[0]()
    }),
  ] as const

  const l4 = [
    computed(() => {
      counters.l4[0]++
      return l3[0]() + l3[1]()
    }),
    computed(() => {
      counters.l4[1]++
      return l3[1]() + l3[2]()
    }),
    computed(() => {
      counters.l4[2]++
      return l3[2]() + l3[3]()
    }),
    computed(() => {
      counters.l4[3]++
      return l3[3]() + l3[0]()
    }),
  ] as const

  let sink = 0
  const dispose = effect(() => {
    counters.effect++
    sink = l4[0]() + l4[1]() + l4[2]() + l4[3]()
  })
  ;(globalThis as { __cellxSink?: number }).__cellxSink = sink

  let counter = 0
  return {
    run: () => {
      counter++
      setSrc(counter)
    },
    counters,
    dispose,
  }
}

const ctx = buildCellx()
console.log('After construction (effect runs once during build):')
console.log(JSON.stringify(ctx.counters, null, 2))
console.log('---')

// One single op
const before = JSON.parse(JSON.stringify(ctx.counters))
ctx.run()
const _after = JSON.parse(JSON.stringify(ctx.counters))

const delta = {
  l1: ctx.counters.l1.map((v, i) => v - before.l1[i]),
  l2: ctx.counters.l2.map((v, i) => v - before.l2[i]),
  l3: ctx.counters.l3.map((v, i) => v - before.l3[i]),
  l4: ctx.counters.l4.map((v, i) => v - before.l4[i]),
  effect: ctx.counters.effect - before.effect,
}
console.log('After ONE op (delta):')
console.log(JSON.stringify(delta, null, 2))
const totalCmp =
  delta.l1.reduce((a, b) => a + b, 0) +
  delta.l2.reduce((a, b) => a + b, 0) +
  delta.l3.reduce((a, b) => a + b, 0) +
  delta.l4.reduce((a, b) => a + b, 0)
console.log(`Total computed body executions per op: ${totalCmp}`)
console.log(`Effect runs per op: ${delta.effect}`)

// 100 ops
const _start = ctx.counters
for (let i = 0; i < 100; i++) ctx.run()
console.log('---')
console.log('After 100 more ops (totals):')
console.log(JSON.stringify(ctx.counters, null, 2))

ctx.dispose()
