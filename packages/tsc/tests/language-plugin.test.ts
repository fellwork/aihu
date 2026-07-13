import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { buildMappings, createAihuLanguagePlugin } from '../src/language-plugin.ts'

const SFC = `@state {
  const [n, setN] = signal(0)
  const bad: number = 'not a number'
}

@template {
  <p>{n()}</p>
}
`

function virtualCodeFor(source: string, fileName = '/x/thing.aihu') {
  const plugin = createAihuLanguagePlugin(ts)
  return plugin.createVirtualCode?.(
    fileName,
    'aihu',
    ts.ScriptSnapshot.fromString(source),
    // biome-ignore lint/suspicious/noExplicitAny: the codegen context is unused here.
    {} as any,
  )
}

describe('the .aihu file reaches TypeScript as virtual TS', () => {
  it('generates a type-check surface, not the raw .aihu text', () => {
    // The failure this guards: when no surface is generated, TypeScript parses the
    // raw `.aihu` as TypeScript and buries everything under nonsense syntax errors
    // (`TS1146: Declaration expected` at `@state {`). Whatever it reports then is
    // noise, and a passing run would mean nothing.
    const vc = virtualCodeFor(SFC)
    const text = vc?.snapshot.getText(0, vc.snapshot.getLength()) ?? ''
    expect(text).toContain('__aihu_template')
    expect(text).not.toContain('@state {')
  })

  it('carries the @state body, so a type error in it is catchable', () => {
    const vc = virtualCodeFor(SFC)
    const text = vc?.snapshot.getText(0, vc.snapshot.getLength()) ?? ''
    expect(text).toContain("const bad: number = 'not a number'")
  })

  it('an SFC that does not compile yields an EMPTY surface, never raw text', () => {
    // A broken SFC must contribute no diagnostics rather than a landslide of
    // phantom ones. `run()` names it separately and fails the run, so it is never
    // silently counted as a pass.
    const vc = virtualCodeFor('@state { this is not valid aihu at all')
    const text = vc?.snapshot.getText(0, vc.snapshot.getLength()) ?? null
    expect(text).toBe('')
    expect(vc?.mappings).toEqual([])
  })
})

/**
 * The text a mapping actually covers on one side. Reads the first (and, for these
 * mappings, only) span — `noUncheckedIndexedAccess` makes each index `| undefined`,
 * so this centralises the guard instead of scattering casts through the assertions.
 */
function span(text: string, offsets: readonly number[], lengths: readonly number[]): string {
  const start = offsets[0]
  const length = lengths[0]
  if (start === undefined || length === undefined) return '<unmapped>'
  return text.slice(start, start + length)
}

describe('mappings put a diagnostic on the line the author wrote', () => {
  it('maps a verbatim @state line back to its own source offsets', () => {
    const source = '@state {\nconst bad: number = 1\n}\n@template { <p>{x()}</p> }\n'
    const generated =
      'declare const q: 1;\nconst bad: number = 1\nfunction __aihu_template(): void {\n'
    const [m] = buildMappings(source, generated)
    expect(m, 'the line must be mapped — an unmapped line loses its diagnostics').toBeDefined()
    if (!m) return
    // Source line 2 and generated line 2 hold identical text at DIFFERENT offsets in
    // their respective files — so the mapping must translate, not assume equality.
    expect(span(source, m.sourceOffsets, m.lengths)).toBe('const bad: number = 1')
    expect(span(generated, m.generatedOffsets, m.lengths)).toBe('const bad: number = 1')
  })

  it('maps a bare typed declaration through the `let` lowering', () => {
    // The compiler lowers `count: number = 0` to `let count: number = 0`, shifting
    // the column. Without this mapping the line would be unmapped, and every
    // diagnostic on it dropped — silently, which is the worst way to lose one.
    const source = '@state {\n  count: number = 0\n}\n@template { <p>{count}</p> }\n'
    const generated =
      'declare const q: 1;\n  let count: number = 0\nfunction __aihu_template(): void {\n'
    const [m] = buildMappings(source, generated)
    expect(m, 'the lowered line must still be mapped').toBeDefined()
    if (!m) return
    expect(span(source, m.sourceOffsets, m.lengths)).toBe('count: number = 0')
    expect(span(generated, m.generatedOffsets, m.lengths)).toBe('count: number = 0')
  })

  it('maps a lifted template expression to the expression in the source', () => {
    const source = '@state {\n}\n@template {\n  <p>{count()}</p>\n}\n'
    const generated = 'declare const q: 1;\n\n\nvoid (count());\n'
    const [m] = buildMappings(source, generated)
    expect(m).toBeDefined()
    if (!m) return
    expect(span(source, m.sourceOffsets, m.lengths)).toBe('count()')
    // The generated span must be the expression itself, NOT the `void (` scaffolding —
    // a diagnostic has to land under the expression the author typed.
    expect(span(generated, m.generatedOffsets, m.lengths)).toBe('count()')
  })

  it('maps repeated expressions on one line to successive occurrences', () => {
    const source = '@state {\n}\n@template {\n  <p>{a()} and {a()}</p>\n}\n'
    const generated = 'declare const q: 1;\n\n\nvoid (a()); void (a());\n'
    const ms = buildMappings(source, generated)
    expect(ms).toHaveLength(2)
    const [m0, m1] = ms
    if (!m0 || !m1) return
    // The second must map to the SECOND `a()` in the source, not back to the first.
    const first = m0.sourceOffsets[0] ?? -1
    const second = m1.sourceOffsets[0] ?? -1
    expect(second).toBeGreaterThan(first)
    expect(span(source, m1.sourceOffsets, m1.lengths)).toBe('a()')
  })
})
