/**
 * Unit tests for `useDateFormat` (effect-scope plan §5): static-value
 * formatting, reactive getter-source re-formatting, `Date`/number/string
 * inputs, and locale/format options. Pure computation — no SSR branch to
 * test (see the composable's module doc); jsdom environment (root vitest
 * config).
 */
import { signal } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useDateFormat } from '../src/useDateFormat/index.ts'

describe('@aihu/use/useDateFormat', () => {
  const fixed = new Date('2026-03-15T00:00:00.000Z')

  it('formats a static Date with default Intl.DateTimeFormat options', () => {
    const formatted = useDateFormat(fixed, { locales: 'en-US' })
    // Default Intl.DateTimeFormat('en-US') renders a short numeric date.
    expect(formatted()).toBe(new Intl.DateTimeFormat('en-US').format(fixed))
  })

  it('accepts an epoch-ms number', () => {
    const formatted = useDateFormat(fixed.getTime(), { locales: 'en-US' })
    expect(formatted()).toBe(new Intl.DateTimeFormat('en-US').format(fixed))
  })

  it('accepts a date string', () => {
    const formatted = useDateFormat(fixed.toISOString(), { locales: 'en-US' })
    expect(formatted()).toBe(new Intl.DateTimeFormat('en-US').format(fixed))
  })

  it('respects dateTimeFormatOptions', () => {
    const formatted = useDateFormat(fixed, {
      locales: 'en-US',
      dateTimeFormatOptions: { year: 'numeric', month: 'long', day: 'numeric' },
    })
    expect(formatted()).toBe(
      new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(
        fixed,
      ),
    )
  })

  it('re-reads a reactive getter source on every call', () => {
    const [date, setDate] = signal<Date>(fixed)
    const formatted = useDateFormat(date, { locales: 'en-US' })
    expect(formatted()).toBe(new Intl.DateTimeFormat('en-US').format(fixed))

    const later = new Date('2027-06-01T00:00:00.000Z')
    setDate(later)
    expect(formatted()).toBe(new Intl.DateTimeFormat('en-US').format(later))
  })

  it('snapshots options up front — a later mutation of the passed object has no effect', () => {
    const opts = { locales: 'en-US' as string | string[] }
    const formatted = useDateFormat(fixed, opts)
    opts.locales = 'de-DE'
    expect(formatted()).toBe(new Intl.DateTimeFormat('en-US').format(fixed))
  })
})
