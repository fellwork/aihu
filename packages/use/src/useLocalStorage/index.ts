/**
 * `useLocalStorage` — a reactive value backed by `localStorage`, synced
 * across same-origin tabs via the `storage` event
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters (+ a setter),
 * signals under the hood. Readers in .aihu templates MUST call getters with
 * parens: `{value()}`, never bare `{value}`.
 *
 * SSR (`isClient === false`): returns a static getter of the provided
 * default and registers no listener — critically, it never TOUCHES
 * `window.localStorage` under SSR (some SSR runtimes don't define it at
 * all) — the `isClient` no-op invariant.
 *
 * Same in-memory fallback also covers a real browser where accessing
 * `localStorage` itself throws (SecurityError — cookies/site data blocked):
 * `value`/`setValue` stay a working reactive pair, just unpersisted.
 * `setItem` failures (e.g. QuotaExceededError, notably Safari private mode)
 * are swallowed per-write instead — the signal already updated, so the
 * value stays correct and persistence merely degrades.
 */

import { signal } from '@aihu/signals'
import { defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export interface UseLocalStorageOptions<T> {
  /** Serialize a value for storage. Default `JSON.stringify`. */
  serializer?: (value: T) => string
  /** Deserialize a stored string back to a value. Default `JSON.parse`. */
  deserializer?: (raw: string) => T
  /** The `window` to read `localStorage`/listen for `storage` on. Default
   * the global `window`. */
  window?: Window
}

export interface UseLocalStorageReturn<T> {
  /** Reactive getter — read as `{value()}` in templates (parens required).
   * The provided default under SSR. */
  readonly value: () => T
  /** Write a new value: updates the signal, persists to `localStorage`,
   * and (SSR: a plain in-memory write — no `localStorage` access). */
  setValue: (next: T) => void
}

/**
 * A reactive value stored under `key` in `localStorage`, JSON
 * serialized/deserialized by default (override via `serializer`/
 * `deserializer` for a different format). Writes persist immediately;
 * a `storage` event from another same-origin tab updates the signal here
 * too. Cleans up with the surrounding effect scope (via the underlying
 * `useEventListener`).
 */
export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options: UseLocalStorageOptions<T> = {},
): UseLocalStorageReturn<T> {
  const {
    serializer = (v: T): string => JSON.stringify(v),
    deserializer = (raw: string): T => JSON.parse(raw) as T,
    window: win = defaultWindow,
  } = options

  // SSR (or no window): static getter of the default, no signal, no
  // localStorage access, no listener.
  if (!isClient || win === undefined) {
    const value = (): T => defaultValue
    const setValue = (): void => {}
    return { value, setValue }
  }

  // `win.localStorage` itself can throw (SecurityError) when cookies/site
  // data are blocked — fall back to the SSR-style in-memory path rather
  // than letting that escape the composable's setup.
  const storage: Storage | undefined = (() => {
    try {
      return win.localStorage
    } catch {
      return undefined
    }
  })()

  if (storage === undefined) {
    const [value, setSignal] = signal(defaultValue)
    const setValue = (next: T): void => {
      // Functional-updater form — see useDebounced for why a bare `next`
      // is ambiguous against `Write<T>` for a generic, unconstrained `T`.
      setSignal(() => next)
    }
    return { value, setValue }
  }

  const read = (): T => {
    const raw = storage.getItem(key)
    if (raw === null) return defaultValue
    try {
      return deserializer(raw)
    } catch {
      // Corrupt/foreign-format stored value: fall back to the default
      // rather than throwing out of a reactive getter's initializer.
      return defaultValue
    }
  }

  const [value, setSignal] = signal(read())

  const setValue = (next: T): void => {
    // Functional-updater form — see useDebounced for why a bare `next`
    // is ambiguous against `Write<T>` for a generic, unconstrained `T`.
    setSignal(() => next)
    try {
      storage.setItem(key, serializer(next))
    } catch {
      // QuotaExceededError (notably Safari private mode) or similar: the
      // signal already updated above, so the reactive value stays correct
      // — persistence just degrades gracefully instead of throwing out of
      // a UI action handler.
    }
  }

  useEventListener(win, 'storage', (e) => {
    if (e.key !== null && e.key !== key) return
    if (e.storageArea !== null && e.storageArea !== storage) return
    setSignal(() => read())
  })

  return { value, setValue }
}
