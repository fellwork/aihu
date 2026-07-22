/**
 * template-grammar-v2 codemod — targeted regression tests (#502).
 */
import { describe, expect, it } from 'vitest'
import { migrateTemplateGrammar } from '../../js/codemods/template-grammar-v2/migrate.ts'

describe('template-grammar-v2 — $class toggle (#502)', () => {
  it('converts both colon and dot spellings to the class: directive', () => {
    const src = [
      '@template {',
      '  <button $class:active={on}>colon</button>',
      '  <button $class.btn-loading={busy}>dot</button>',
      '}',
    ].join('\n')
    const { rewritten } = migrateTemplateGrammar(src)
    expect(rewritten).toContain('class:active={on}')
    expect(rewritten).toContain('class:btn-loading={busy}')
    expect(rewritten).not.toContain('$class')
  })
})
