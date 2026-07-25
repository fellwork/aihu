/**
 * `useDateFormat` — format a reactive `Date`/epoch-number/date-string via
 * `Intl.DateTimeFormat` (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Deliberate divergence from the "object of named getters" convention: this
 * composable returns a single BARE getter (there is only one output value)
 * — mirrors `usePrevious`/`useSupported`. Reading it in `.aihu` templates
 * still needs parens: `{formatted()}`, never bare `{formatted}`.
 *
 * **Pure computation — no client/server guard.** Unlike every other
 * composable in this wave, this one touches no DOM, timer, or listener: it
 * just calls `Intl.DateTimeFormat#format` fresh on every getter read, so it
 * works identically server- and client-side and needs no SSR branch (and
 * no Tier-2 `ssr-safety.test.ts` row — the parity gate only requires one
 * for composables whose source checks the shared client/server flag).
 * `Intl.DateTimeFormat` IS still feature-detected, not assumed: some
 * minimal/embedded JS runtimes ship without full `Intl` support, so a
 * missing-`Intl` environment falls back to `Date#toISOString()` rather
 * than throwing.
 */

import { type MaybeGetter, toValue } from '../shared/index.ts'

/** A `Date`, an epoch-ms `number`, or any string `Date` accepts. */
export type UseDateFormatSource = Date | number | string

export interface UseDateFormatOptions {
  /** Passed through to `Intl.DateTimeFormat`. Default the runtime's
   * locale. */
  locales?: string | string[]
  /** Passed through to `Intl.DateTimeFormat`. Default (no options):
   * `Intl`'s numeric-date/time default. */
  dateTimeFormatOptions?: Intl.DateTimeFormatOptions
}

/** Reactive getter — read as `{formatted()}` in templates (parens
 * required). */
export type UseDateFormatReturn = () => string

const hasIntlDateTimeFormat =
  typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'

function toDate(value: UseDateFormatSource): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * Format `date` (a `Date`/epoch-`number`/date-`string`, or a getter for
 * one) with `Intl.DateTimeFormat`. The formatter is built once, up front,
 * from the snapshotted `options` (D8 — a later mutation of a caller-owned
 * options object must not change already-returned formatting behavior);
 * only the SOURCE value is re-read on every call.
 */
export function useDateFormat(
  date: MaybeGetter<UseDateFormatSource>,
  options: UseDateFormatOptions = {},
): UseDateFormatReturn {
  const { locales, dateTimeFormatOptions } = options
  const formatter = hasIntlDateTimeFormat
    ? new Intl.DateTimeFormat(locales, dateTimeFormatOptions)
    : undefined

  return (): string => {
    const asDate = toDate(toValue(date))
    return formatter !== undefined ? formatter.format(asDate) : asDate.toISOString()
  }
}
