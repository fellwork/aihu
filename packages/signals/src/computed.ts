import {
  DISPOSED,
  peekCurrentObserver,
  type Read,
  RUNNING,
  STALE,
  type Subscriber,
  setCurrentObserver,
} from './signal.ts'

export interface ComputedOptions<T> {
  // The `equals` option is reserved for a future cascade-suppression
  // optimization. Accepted on the type for API symmetry with `signal()`; v0
  // does not use it to short-circuit downstream notifications. See spec §1.3.
  equals?: ((a: T, b: T) => boolean) | false
}

export function computed<T>(fn: () => T, _options?: ComputedOptions<T>): Read<T> {
  let cached: T
  const subs = new Set<Subscriber>()

  const node: Subscriber = {
    flags: STALE,
    notify() {
      if (node.flags & DISPOSED) return
      // If already stale, downstream was already notified on the prior write —
      // suppress the redundant cascade.
      if (node.flags & STALE) return
      node.flags |= STALE
      for (const sub of [...subs]) {
        sub.notify()
      }
    },
  }

  const read: Read<T> = () => {
    // Forward observation: register the calling observer as a sub of this computed.
    const observer = peekCurrentObserver()
    if (observer !== null) subs.add(observer)
    if (node.flags & STALE) {
      node.flags |= RUNNING
      const prevObserver = setCurrentObserver(node)
      try {
        cached = fn()
      } finally {
        setCurrentObserver(prevObserver)
        node.flags &= ~RUNNING
        node.flags &= ~STALE
      }
    }
    return cached
  }

  return read
}
