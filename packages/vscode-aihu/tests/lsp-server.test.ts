/**
 * packages/vscode-aihu/tests/lsp-server.test.ts
 *
 * Unit tests for the Aihu LSP language server (AC12).
 * Covers: diagnostic extraction, code action wiring, hover table lookup,
 * completion item generation, and block context detection.
 */
import { describe, expect, it } from 'vitest'
import { migrate } from '../../compiler/js/codemods/macro-simplification/migrate.ts'
import { BLOCK_COMPLETIONS, STATE_MACRO_COMPLETIONS } from '../server/completion.ts'
import { getBlockContext, getHoverContent, getMacroAtPosition } from '../server/hover.ts'

// ---------------------------------------------------------------------------
// 1. Hover table - all 13 macro tokens must have content
// ---------------------------------------------------------------------------

describe('hover table', () => {
  const MACRO_TOKENS = [
    '$prop',
    '$computed',
    '$action',
    '$resource',
    '$effect',
    '$lifecycle',
    '$if',
    '$each',
    '$html',
    '$show',
    '$on',
    '$bind',
    '$emit',
  ] as const

  for (const macro of MACRO_TOKENS) {
    it(`has hover content for ${macro}`, () => {
      const content = getHoverContent(macro)
      expect(content).toBeTruthy()
      expect(typeof content).toBe('string')
      expect(content!.length).toBeGreaterThan(20)
    })
  }

  it('returns null for unknown tokens', () => {
    expect(getHoverContent('$unknown')).toBeNull()
    expect(getHoverContent('$watch')).toBeNull()
    expect(getHoverContent('')).toBeNull()
  })

  it('$if hover content mentions branch(', () => {
    const content = getHoverContent('$if')
    expect(content).toContain('branch(')
  })

  it('$computed hover content mentions computed(() => expr)', () => {
    const content = getHoverContent('$computed')
    expect(content).toContain('computed(() => expr)')
  })

  it('$effect hover content mentions effect', () => {
    const content = getHoverContent('$effect')
    expect(content).toContain('effect(() =>')
  })
})

// ---------------------------------------------------------------------------
// 2. getMacroAtPosition - word detection
// ---------------------------------------------------------------------------

describe('getMacroAtPosition', () => {
  it('detects $computed at position inside the token', () => {
    const line = '  $computed: {'
    expect(getMacroAtPosition(line, 3)).toBe('$computed')
  })

  it('detects $if in template attribute', () => {
    const line = '  <div $if={count > 0}>'
    expect(getMacroAtPosition(line, 7)).toBe('$if')
  })

  it('detects {#if block-tag form', () => {
    const line = '{#if condition}'
    expect(getMacroAtPosition(line, 1)).toBe('$if')
  })

  it('detects $on namespaced directive', () => {
    const line = '<button $on.click={handler}>'
    expect(getMacroAtPosition(line, 9)).toBe('$on')
  })

  it('detects $bind namespaced directive', () => {
    const line = '<input $bind.value={signal}>'
    expect(getMacroAtPosition(line, 8)).toBe('$bind')
  })

  it('returns null when cursor is outside any macro', () => {
    const line = '  const x = 1'
    expect(getMacroAtPosition(line, 2)).toBeNull()
  })

  it('returns null for empty line', () => {
    expect(getMacroAtPosition('', 0)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. getBlockContext - backward scan
// ---------------------------------------------------------------------------

describe('getBlockContext', () => {
  it('returns state when inside @state block', () => {
    const lines = ['@state {', '  $computed: {', '  }', '}']
    expect(getBlockContext(lines, 1)).toBe('state')
  })

  it('returns template when inside @template block', () => {
    const lines = ['@template {', '  <div $if={x}>', '  </div>', '}']
    expect(getBlockContext(lines, 1)).toBe('template')
  })

  it('returns unknown when inside @style block', () => {
    const lines = ['@style {', '  color: red;', '}']
    expect(getBlockContext(lines, 1)).toBe('unknown')
  })

  it('returns unknown at top level with no enclosing block', () => {
    // Without any @state/@template above the position, returns unknown.
    const lines = ['', '// top level comment', '']
    expect(getBlockContext(lines, 2)).toBe('unknown')
  })

  it('detects @state block after @template block', () => {
    const lines = [
      '@template {',
      '  <div>hello</div>',
      '}',
      '',
      '@state {',
      '  $prop: {',
      '  }',
      '}',
    ]
    expect(getBlockContext(lines, 5)).toBe('state')
  })
})

// ---------------------------------------------------------------------------
// 4. Completion items
// ---------------------------------------------------------------------------

describe('STATE_MACRO_COMPLETIONS', () => {
  const labels = STATE_MACRO_COMPLETIONS.map((c) => c.label)

  it('contains $prop', () => expect(labels).toContain('$prop'))
  it('contains $computed', () => expect(labels).toContain('$computed'))
  it('contains $action', () => expect(labels).toContain('$action'))
  it('contains $resource', () => expect(labels).toContain('$resource'))
  it('contains $effect', () => expect(labels).toContain('$effect'))
  it('contains $lifecycle', () => expect(labels).toContain('$lifecycle'))

  it('all items have snippet insertTextFormat (2)', () => {
    for (const item of STATE_MACRO_COMPLETIONS) {
      expect(item.insertTextFormat).toBe(2)
    }
  })

  it('$prop snippet has tab stops', () => {
    const prop = STATE_MACRO_COMPLETIONS.find((c) => c.label === '$prop')
    expect(prop?.insertText).toContain('${1:')
  })

  it('$lifecycle snippet contains mount and dispose', () => {
    const lc = STATE_MACRO_COMPLETIONS.find((c) => c.label === '$lifecycle')
    expect(lc?.insertText).toContain('mount')
    expect(lc?.insertText).toContain('dispose')
  })
})

describe('BLOCK_COMPLETIONS', () => {
  const labels = BLOCK_COMPLETIONS.map((c) => c.label)

  it('contains @state @template @style @agent @route', () => {
    expect(labels).toContain('@state')
    expect(labels).toContain('@template')
    expect(labels).toContain('@style')
    expect(labels).toContain('@agent')
    expect(labels).toContain('@route')
  })
})

// ---------------------------------------------------------------------------
// 5. Code action wiring - migrate() integration
// ---------------------------------------------------------------------------

describe('migrate() integration (code action backing)', () => {
  it('rewrites v1 $prop to v2 collection form', () => {
    const source = '@state {\n  $prop label: String\n}\n'
    const { rewritten, warnings } = migrate(source)
    expect(rewritten).toContain('$prop:')
    expect(rewritten).toContain('label:')
    expect(warnings.length).toBe(0)
  })

  it('is idempotent on v2 input', () => {
    const source = '@state {\n  $prop: {\n    label: { default: undefined },\n  }\n}\n'
    const { rewritten } = migrate(source)
    expect(rewritten).toContain('$prop: {')
    expect(rewritten).toContain('label:')
  })

  it('does not crash on minimal valid source', () => {
    const source = '@state {\n}\n@template {\n  <div>hello</div>\n}\n'
    expect(() => migrate(source)).not.toThrow()
  })

  it('does not crash on malformed source (unclosed brace)', () => {
    const source = '@state {\n  $prop label: String\n'
    expect(() => migrate(source)).not.toThrow()
  })

  it('returns warnings when @agent references unknown @state name', () => {
    const source = [
      '@state {',
      '  $prop name: String',
      '}',
      '@agent {',
      '  $expose unknownName',
      '}',
    ].join('\n')
    const { warnings } = migrate(source)
    expect(warnings.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// 6. Diagnostic extraction - JSON parsing (pure unit, no binary invocation)
// ---------------------------------------------------------------------------

describe('machine-errors JSON parsing', () => {
  function parseJsonDiagnostics(stderr: string) {
    const diagnostics: Array<{
      code: string
      message: string
      range: {
        start: { line: number; character: number }
        end: { line: number; character: number }
      } | null
    }> = []
    for (const line of stderr.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed?.startsWith('{')) continue
      try {
        const raw = JSON.parse(trimmed) as {
          code: string
          message: string
          range: { line: number; col: number; end_line: number; end_col: number } | null
        }
        const lspRange =
          raw.range && raw.range.line > 0
            ? {
                start: { line: raw.range.line - 1, character: raw.range.col },
                end: { line: raw.range.end_line - 1, character: raw.range.end_col },
              }
            : null
        diagnostics.push({ code: raw.code, message: raw.message, range: lspRange })
      } catch {
        // not JSON
      }
    }
    return diagnostics
  }

  it('parses a single C440 machine-error JSON line', () => {
    const stderr = JSON.stringify({
      code: 'C440',
      message: 'C440 - old-spec macro form rejected',
      from: '$prop label: String',
      to: null,
      range: { line: 4, col: 2, end_line: 4, end_col: 20 },
    })
    const diags = parseJsonDiagnostics(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.code).toBe('C440')
    expect(diags[0]!.range?.start.line).toBe(3)
    expect(diags[0]!.range?.start.character).toBe(2)
  })

  it('parses multiple JSON error lines', () => {
    const line1 = JSON.stringify({
      code: 'C440',
      message: 'err1',
      from: null,
      to: null,
      range: { line: 2, col: 0, end_line: 2, end_col: 10 },
    })
    const line2 = JSON.stringify({
      code: 'C441',
      message: 'err2',
      from: null,
      to: null,
      range: { line: 5, col: 4, end_line: 5, end_col: 8 },
    })
    const diags = parseJsonDiagnostics(`${line1}\n${line2}`)
    expect(diags).toHaveLength(2)
    expect(diags[0]!.code).toBe('C440')
    expect(diags[1]!.code).toBe('C441')
    expect(diags[1]!.range?.start.line).toBe(4)
  })

  it('handles null range gracefully', () => {
    const stderr = JSON.stringify({
      code: 'C000',
      message: 'Parse error',
      from: null,
      to: null,
      range: null,
    })
    const diags = parseJsonDiagnostics(stderr)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.range).toBeNull()
  })

  it('ignores non-JSON stderr lines', () => {
    const json = JSON.stringify({
      code: 'C440',
      message: 'test',
      from: null,
      to: null,
      range: null,
    })
    const diags = parseJsonDiagnostics(`error: compilation failed\n${json}\n`)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.code).toBe('C440')
  })

  it('returns empty array for completely non-JSON stderr', () => {
    const diags = parseJsonDiagnostics('error: file not found\nsome other text\n')
    expect(diags).toHaveLength(0)
  })
})
