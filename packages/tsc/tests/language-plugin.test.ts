import { describe, expect, it } from 'vitest'
import ts from 'typescript'
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

describe('mappings put a diagnostic on the line the author wrote', () => {
  it('maps a verbatim @state line back to its own source offsets', () => {
    const source = '@state {\nconst bad: number = 1\n}\n@template { <p>{x()}</p> }\n'
    const generated = 'declare const q: 1;\nconst bad: number = 1\nfunction __aihu_template(): void {\n'
    const [m] = buildMappings(source, generated)
    // Source line 2 and generated line 2 hold identical text, at different offsets
    // in their respective files — so the mapping must translate, not assume equality.
    expect(source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0])).toBe(
      'const bad: number = 1',
    )
    expect(generated.slice(m.generatedOffsets[0], m.generatedOffsets[0] + m.lengths[0])).toBe(
      'const bad: number = 1',
    )
  })

  it('maps a lifted template expression to the expression in the source', () => {
    const source = '@state {\n}\n@template {\n  <p>{count()}</p>\n}\n'
    const generated = 'declare const q: 1;\n\n\nvoid (count());\n'
    const [m] = buildMappings(source, generated)
    expect(source.slice(m.sourceOffsets[0], m.sourceOffsets[0] + m.lengths[0])).toBe('count()')
    // The generated span must be the expression itself, NOT the `void (` scaffolding —
    // a diagnostic on it has to land under the expression the author typed.
    expect(generated.slice(m.generatedOffsets[0], m.generatedOffsets[0] + m.lengths[0])).toBe(
      'count()',
    )
  })

  it('maps repeated expressions on one line to successive occurrences', () => {
    const source = '@state {\n}\n@template {\n  <p>{a()} and {a()}</p>\n}\n'
    const generated = 'declare const q: 1;\n\n\nvoid (a()); void (a());\n'
    const ms = buildMappings(source, generated)
    expect(ms).toHaveLength(2)
    // The second must map to the SECOND `a()` in the source, not back to the first.
    expect(ms[1].sourceOffsets[0]).toBeGreaterThan(ms[0].sourceOffsets[0])
    expect(source.slice(ms[1].sourceOffsets[0], ms[1].sourceOffsets[0] + ms[1].lengths[0])).toBe(
      'a()',
    )
  })
})
