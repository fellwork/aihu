import { SignalCircularError } from './errors.ts'
import { DISPOSED, RUNNING, type Subscriber, setCurrentObserver } from './signal.ts'

export type EffectFn = () => void
export type Dispose = () => void

export function effect(fn: EffectFn): Dispose {
  const node: Subscriber = {
    flags: 0,
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
    node.flags |= DISPOSED
  }
}
