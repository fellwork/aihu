/**
 * Compare: how many body executions does alien-signals run per cellx op?
 * Expected: 16 inner + 1 effect = 17 (the architect's model).
 */
import { computed, effect, signal } from 'alien-signals'

const counters = {
  l1: [0, 0, 0, 0],
  l2: [0, 0, 0, 0],
  l3: [0, 0, 0, 0],
  l4: [0, 0, 0, 0],
  effect: 0,
}

const src = signal(0)

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
effect(() => {
  counters.effect++
  sink = l4[0]() + l4[1]() + l4[2]() + l4[3]()
})
;(globalThis as { __sink?: number }).__sink = sink

console.log('After construction:', JSON.stringify(counters))
const before = JSON.parse(JSON.stringify(counters))
src(1)
const delta = {
  l1: counters.l1.map((v, i) => v - before.l1[i]),
  l2: counters.l2.map((v, i) => v - before.l2[i]),
  l3: counters.l3.map((v, i) => v - before.l3[i]),
  l4: counters.l4.map((v, i) => v - before.l4[i]),
  effect: counters.effect - before.effect,
}
console.log('Delta after 1 op:', JSON.stringify(delta))
const total =
  delta.l1.reduce((a, b) => a + b, 0) +
  delta.l2.reduce((a, b) => a + b, 0) +
  delta.l3.reduce((a, b) => a + b, 0) +
  delta.l4.reduce((a, b) => a + b, 0)
console.log(`Total computed body executions per op: ${total}`)
console.log(`Effect runs per op: ${delta.effect}`)
