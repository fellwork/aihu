import { SignalCircularError } from './errors.ts'
import {
  DISPOSED,
  EFFECT,
  RUNNING,
  type Subscriber,
  setCurrentObserver,
  unlinkAllDeps,
} from './signal.ts'

export type EffectFn = () => void
export type Dispose = () => void

export function effect(fn: EffectFn): Dispose {
  const node: Subscriber = {
    flags: EFFECT,
    subsHead: null,
    subsTail: null,
    depsHead: null,
    depsTail: null,
    notify() {
      if (node.flags & DISPOSED) return
      if (node.flags & RUNNING) throw new SignalCircularError()
      run()
    },
  }

  const run = (): void => {
    node.flags |= RUNNING
    const prev = setCurrentObserver(node)
    try {
      fn()
    } finally {
      setCurrentObserver(prev)
      node.flags &= ~RUNNING
    }
  }

  run()

  return () => {
    if (node.flags & DISPOSED) return
    node.flags |= DISPOSED
    // §6.3 ACCEPTED — splice every dep edge so the effect no longer
    // appears in any signal/computed's subs list. Eliminates the
    // long-running-app leak (effect remounts under arbor).
    unlinkAllDeps(node)
  }
}
