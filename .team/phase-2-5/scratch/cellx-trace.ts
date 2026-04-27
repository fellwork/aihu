/**
 * Investigation: trace which nodes' bodies actually run during one cellx op.
 * Goal: explain why the counter shows 32 effect runs / op.
 */
import { computed, effect, signal } from '../../../packages/signals/src/index.ts'

let traceEnabled = false
const log: string[] = []

function trace(s: string) {
  if (traceEnabled) log.push(s)
}

const [src, setSrc] = signal(0)

const l1 = [
  computed(() => {
    trace('l1[0]')
    return src() + 0
  }),
  computed(() => {
    trace('l1[1]')
    return src() + 1
  }),
  computed(() => {
    trace('l1[2]')
    return src() + 2
  }),
  computed(() => {
    trace('l1[3]')
    return src() + 3
  }),
] as const

const l2 = [
  computed(() => {
    trace('l2[0]')
    return l1[0]() + l1[1]()
  }),
  computed(() => {
    trace('l2[1]')
    return l1[1]() + l1[2]()
  }),
  computed(() => {
    trace('l2[2]')
    return l1[2]() + l1[3]()
  }),
  computed(() => {
    trace('l2[3]')
    return l1[3]() + l1[0]()
  }),
] as const

const l3 = [
  computed(() => {
    trace('l3[0]')
    return l2[0]() + l2[1]()
  }),
  computed(() => {
    trace('l3[1]')
    return l2[1]() + l2[2]()
  }),
  computed(() => {
    trace('l3[2]')
    return l2[2]() + l2[3]()
  }),
  computed(() => {
    trace('l3[3]')
    return l2[3]() + l2[0]()
  }),
] as const

const l4 = [
  computed(() => {
    trace('l4[0]')
    return l3[0]() + l3[1]()
  }),
  computed(() => {
    trace('l4[1]')
    return l3[1]() + l3[2]()
  }),
  computed(() => {
    trace('l4[2]')
    return l3[2]() + l3[3]()
  }),
  computed(() => {
    trace('l4[3]')
    return l3[3]() + l3[0]()
  }),
] as const

let sink = 0
const dispose = effect(() => {
  trace('EFFECT')
  sink = l4[0]() + l4[1]() + l4[2]() + l4[3]()
})
;(globalThis as { __cellxSink?: number }).__cellxSink = sink

// Now turn on tracing and do exactly ONE op.
traceEnabled = true
log.push('--- begin op ---')
setSrc(1)
log.push('--- end op ---')
traceEnabled = false

console.log(log.join('\n'))
console.log('---')
console.log(`Total log lines: ${log.length}`)

dispose()
