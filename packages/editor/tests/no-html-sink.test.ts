// Acceptance A8 — the grep gate as a runnable test: zero
// innerHTML/outerHTML/insertAdjacentHTML/srcdoc anywhere in src/ (the inert
// DOMParser call in paste-sanitize.ts is a parser input, not a sink, and is
// the only HTML-adjacent API allowed).

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', 'src')
const COMPONENTS = join(__dirname, '..', 'components')
const BANNED = /innerHTML|outerHTML|insertAdjacentHTML|srcdoc/

function filesUnder(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath, e.name))
  } catch {
    return []
  }
}

describe('A8 — no HTML sink', () => {
  it('src/ has zero banned sink references', () => {
    const offenders: string[] = []
    for (const file of filesUnder(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (BANNED.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('components/ (SFC sources) have zero banned sink references', () => {
    const offenders: string[] = []
    for (const file of filesUnder(COMPONENTS)) {
      const text = readFileSync(file, 'utf8')
      if (BANNED.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })

  it('DOMParser appears ONLY in paste-sanitize.ts (the inert parse)', () => {
    for (const file of filesUnder(SRC)) {
      const text = readFileSync(file, 'utf8')
      if (/\bDOMParser\b/.test(text)) {
        expect(file.endsWith('paste-sanitize.ts')).toBe(true)
      }
    }
  })
})
