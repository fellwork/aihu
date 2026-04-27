import { signal } from './signal.ts'

export interface State<T> {
  value: T
}

export function $state<T>(initial: T): State<T> {
  const [read, write] = signal(initial)
  return {
    get value() {
      return read()
    },
    set value(next: T) {
      write(next)
    },
  }
}
