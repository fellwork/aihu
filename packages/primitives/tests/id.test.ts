/**
 * `id.ts` — the shared id-generation core consolidated from
 * `label`/`form-control`/`tooltip`/`dialog`'s hand-rolled counters
 * (LDF §10 step 5 / Q3).
 */

import { describe, expect, it } from 'vitest'
import { createCounter, createIdSequence } from '../src/id.ts'

describe('createIdSequence', () => {
  it('produces prefix-1, prefix-2, … in order', () => {
    const next = createIdSequence('aihu-label')
    expect(next()).toBe('aihu-label-1')
    expect(next()).toBe('aihu-label-2')
    expect(next()).toBe('aihu-label-3')
  })

  it('two independent sequences never share state', () => {
    const a = createIdSequence('aihu-fc')
    const b = createIdSequence('aihu-tooltip')
    expect(a()).toBe('aihu-fc-1')
    expect(b()).toBe('aihu-tooltip-1')
    expect(a()).toBe('aihu-fc-2')
  })
})

describe('createCounter', () => {
  it('produces 1, 2, 3, … — the raw primitive dialog builds its multi-prefix uid() from', () => {
    const next = createCounter()
    expect(next()).toBe(1)
    expect(next()).toBe(2)
  })

  it('a shared counter interleaves across different prefixes (dialog uid() shape)', () => {
    const seq = createCounter()
    const uid = (p: string) => `aihu-${p}-${seq()}`
    expect(uid('dialog')).toBe('aihu-dialog-1')
    expect(uid('dialog-title')).toBe('aihu-dialog-title-2')
    expect(uid('dialog-desc')).toBe('aihu-dialog-desc-3')
  })
})
