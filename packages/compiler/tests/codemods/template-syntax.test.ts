/**
 * template-syntax codemod (B3b AC13 + AC15) vitest unit tests.
 *
 * AC13: Codemod round-trips all 13 prober-fixture files.
 * AC15: Codemod is idempotent.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { migrate } from '../../js/codemods/template-syntax/migrate.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROBER = resolve(__dirname, '../../../../.team/prober-fixtures')

function readProber(name: string): string {
  return readFileSync(resolve(PROBER, name), 'utf8')
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

const ALL_FIXTURES = [
  'CalendarGrid.variantA.aihu',
  'CalendarGrid.variantB.aihu',
  'CalendarGrid.variantC.aihu',
  'live-counter.variantA.aihu',
  'live-counter.variantB.aihu',
  'live-counter.variantC.aihu',
  'template-syntax-edge-cases.v1.aihu',
  'template-syntax-edge-cases.variantA.aihu',
  'template-syntax-edge-cases.variantB.aihu',
  'template-syntax-edge-cases.variantC.aihu',
  'todo-mvc.variantA.aihu',
  'todo-mvc.variantB.aihu',
  'todo-mvc.variantC.aihu',
]

// Fixtures that use only v2 dot-form syntax throughout (no $html attr form).
// template-syntax-edge-cases.variantA.aihu still has $html={} attribute form
// which P5 migrates, so it is NOT in this list.
const ALREADY_V2 = [
  'CalendarGrid.variantA.aihu',
  'live-counter.variantA.aihu',
  'todo-mvc.variantA.aihu',
]

const HAS_V1_SYNTAX = [
  'CalendarGrid.variantB.aihu',
  'CalendarGrid.variantC.aihu',
  'live-counter.variantB.aihu',
  'live-counter.variantC.aihu',
  'template-syntax-edge-cases.v1.aihu',
  'template-syntax-edge-cases.variantB.aihu',
  'template-syntax-edge-cases.variantC.aihu',
  'todo-mvc.variantB.aihu',
  'todo-mvc.variantC.aihu',
]

describe('template-syntax codemod AC13: prober fixture round-trips', () => {
  it('finds all 13 prober fixtures', () => {
    for (const name of ALL_FIXTURES) {
      const src = readProber(name)
      expect(src.length).toBeGreaterThan(0)
    }
  })

  for (const name of ALL_FIXTURES) {
    it(`does not crash or leave sentinel artifacts: ${name}`, () => {
      const src = readProber(name)
      const { rewritten, warnings } = migrate(src)
      expect(rewritten).not.toContain('__AIHU_HTML_SENTINEL__')
      const hasBlock = rewritten.includes('@template') || rewritten.includes('@state')
      expect(hasBlock).toBe(true)
      for (const w of warnings) {
        expect(typeof w).toBe('string')
      }
    })
  }

  for (const name of ALREADY_V2) {
    it(`v2 file returned unchanged: ${name}`, () => {
      const src = readProber(name)
      const { rewritten } = migrate(src)
      expect(rewritten).toBe(src)
    })
  }

  for (const name of HAS_V1_SYNTAX) {
    it(`v1 colon-form migrated in: ${name}`, () => {
      const src = readProber(name)
      const hasV1 = /\$on:|\$bind:|\$html=/.test(src)
      if (!hasV1) return
      const { rewritten } = migrate(src)
      // Verify no colon-form remains in @template body after migration.
      // Strip HTML comments first — they may reference v1 syntax in explanatory text.
      const tplIdx = rewritten.indexOf('@template {')
      if (tplIdx >= 0) {
        const bodyStart = tplIdx + '@template {'.length
        const body = rewritten.slice(bodyStart)
        // Remove HTML comments before checking for v1 patterns
        const bodyNoComments = body.replace(/<!--[\s\S]*?-->/g, '')
        expect(bodyNoComments).not.toMatch(/\$on:[A-Za-z]/)
        expect(bodyNoComments).not.toMatch(/\$bind:[A-Za-z]/)
      }
    })
  }
})

describe('template-syntax codemod AC15: idempotency', () => {
  for (const name of ALL_FIXTURES) {
    it(`twice yields same output: ${name}`, () => {
      const src = readProber(name)
      const pass1 = migrate(src).rewritten
      const pass2 = migrate(pass1).rewritten
      expect(sha256(pass2)).toBe(sha256(pass1))
      expect(pass2).toBe(pass1)
    })
  }

  it('idempotent on synthetic v1 input', () => {
    const input = [
      '@state {',
      '  $prop: {',
      '    label: { type: string },',
      '  }',
      '}',
      '',
      '@template {',
      '  <button $on:click={h} $bind:value={v}>go</button>',
      '}',
      '',
    ].join('\n')
    const pass1 = migrate(input).rewritten
    const pass2 = migrate(pass1).rewritten
    expect(pass2).toBe(pass1)
  })
})
