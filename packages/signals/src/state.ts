import { signal } from './signal.ts'

export interface State<T> {
  value: T
}

export function $state<T>(initial: T): State<T> {
  const [read, write] = signal(initial)
  // `$state` always writes raw values, so the underlying `write`'s
  // function-updater branch is a footgun for function-typed `T` here as
  // well: at runtime, `state.value = fn` invokes `fn` rather than
  // storing it. The Option-B `Write<T>` constraint would otherwise
  // reject the raw assignment at compile time; cast to the legacy
  // shape to preserve `$state`'s "value-only" surface. The runtime
  // limitation is documented in `.team/phase-2/spec-signals-write-of-functions.md`.
  const writeRaw = write as (next: T) => void
  return {
    get value() {
      return read()
    },
    set value(next: T) {
      writeRaw(next)
    },
  }
}
