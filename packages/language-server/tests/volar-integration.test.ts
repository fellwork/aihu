/**
 * packages/language-server/tests/volar-integration.test.ts
 *
 * Integration tests for the Volar virtual-file layer introduced in M2 A4 round-2.
 * Covers: AihuLanguagePlugin, AihuVirtualCode, source-map round-trips,
 * AihuLanguageServicePlugin capabilities.
 *
 * Per architect-brief §8.2 — all tests are additive and do not modify
 * the existing 124 tests in lsp-server.test.ts / hover-coverage.test.ts.
 */

import type { IScriptSnapshot } from '@volar/language-core'
import { SourceMap } from '@volar/source-map'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { generateStateVirtualCode } from '../src/core/state-generator.ts'
import { mapToOriginal, mapToVirtual } from '../src/core/virtual-source-map.ts'
import {
  createAihuLanguagePlugin,
  createAihuLanguageServicePlugin,
} from '../src/core/volar-plugin.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a string in a minimal IScriptSnapshot implementation. */
function makeSnapshot(text: string): IScriptSnapshot {
  return {
    getText(start: number, end: number) {
      return text.slice(start, end)
    },
    getLength() {
      return text.length
    },
    getChangeRange() {
      return undefined
    },
  }
}

/** A minimal CodegenContext stub for tests. */
const stubCtx = {
  getAssociatedScript: () => undefined,
} as const

// ---------------------------------------------------------------------------
// 1. createAihuLanguagePlugin()
// ---------------------------------------------------------------------------

describe('createAihuLanguagePlugin()', () => {
  it('returns an object with getLanguageId and createVirtualCode methods', () => {
    const plugin = createAihuLanguagePlugin()
    expect(typeof plugin.getLanguageId).toBe('function')
    expect(typeof plugin.createVirtualCode).toBe('function')
  })

  it('getLanguageId returns "aihu" for .aihu URI', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.aihu')
    expect(plugin.getLanguageId(uri)).toBe('aihu')
  })

  it('getLanguageId returns undefined for .ts URI', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.ts')
    expect(plugin.getLanguageId(uri)).toBeUndefined()
  })

  it('getLanguageId returns undefined for .vue URI', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/App.vue')
    expect(plugin.getLanguageId(uri)).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 2. createVirtualCode — with @state block
// ---------------------------------------------------------------------------

describe('createVirtualCode() with @state block', () => {
  const source = `@state {
  $prop: {
    count: { default: 0 }
  }
}
@template {
  <div>{count}</div>
}
`

  it('returns AihuVirtualCode with id "__state__"', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.aihu')
    const snapshot = makeSnapshot(source)
    const result = plugin.createVirtualCode(uri, 'aihu', snapshot, stubCtx)
    expect(result).not.toBeUndefined()
    expect(result!.id).toBe('__state__')
  })

  it('returns AihuVirtualCode with languageId "typescript"', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.aihu')
    const snapshot = makeSnapshot(source)
    const result = plugin.createVirtualCode(uri, 'aihu', snapshot, stubCtx)
    expect(result!.languageId).toBe('typescript')
  })

  it('virtual snapshot contains "const count: number = 0 as any"', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.aihu')
    const snapshot = makeSnapshot(source)
    const result = plugin.createVirtualCode(uri, 'aihu', snapshot, stubCtx)
    const virtualText = result!.snapshot.getText(0, result!.snapshot.getLength())
    expect(virtualText).toContain('const count: number = 0 as any')
  })

  it('returns AihuVirtualCode with at least one mapping', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.aihu')
    const snapshot = makeSnapshot(source)
    const result = plugin.createVirtualCode(uri, 'aihu', snapshot, stubCtx)
    expect(result!.mappings.length).toBeGreaterThan(0)
  })

  it('virtual code header contains import from "@aihu/runtime"', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.aihu')
    const snapshot = makeSnapshot(source)
    const result = plugin.createVirtualCode(uri, 'aihu', snapshot, stubCtx)
    const virtualText = result!.snapshot.getText(0, result!.snapshot.getLength())
    expect(virtualText).toContain('@aihu/runtime')
  })
})

// ---------------------------------------------------------------------------
// 3. createVirtualCode — without @state block
// ---------------------------------------------------------------------------

describe('createVirtualCode() without @state block', () => {
  const sourceNoState = `@template {
  <div>hello</div>
}
`

  it('returns undefined when source has no @state block', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Hello.aihu')
    const snapshot = makeSnapshot(sourceNoState)
    const result = plugin.createVirtualCode(uri, 'aihu', snapshot, stubCtx)
    expect(result).toBeUndefined()
  })

  it('returns undefined for non-aihu languageId', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.ts')
    const snapshot = makeSnapshot('const x = 1')
    const result = plugin.createVirtualCode(uri, 'typescript', snapshot, stubCtx)
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 4. Source-map round-trip
// ---------------------------------------------------------------------------

describe('source-map round-trip', () => {
  const source = `@state {
  $prop: {
    count: { default: 0 }
  }
}
`

  it('mapToVirtual → mapToOriginal returns the same source offset', () => {
    const output = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(output.mappings.length).toBeGreaterThan(0)

    const sourceMap = new SourceMap(output.mappings)

    // Find the offset of "count" in the source
    const sourceOffset = source.indexOf('count')
    expect(sourceOffset).toBeGreaterThan(0)

    const virtualPos = mapToVirtual(sourceOffset, '@state', sourceMap)
    expect(virtualPos).not.toBeNull()

    const originalPos = mapToOriginal(virtualPos!.offset, sourceMap)
    expect(originalPos).not.toBeNull()
    expect(originalPos!.offset).toBe(sourceOffset)
  })

  it('mapToOriginal returns null for an unmapped virtual offset', () => {
    const output = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    const sourceMap = new SourceMap(output.mappings)
    // Offset 0 is in the header (not mapped)
    const result = mapToOriginal(0, sourceMap)
    expect(result).toBeNull()
  })

  it('mapToVirtual returns null for an unmapped source offset', () => {
    const output = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    const sourceMap = new SourceMap(output.mappings)
    // Offset 0 is "@state" — not a named identifier, not mapped
    const result = mapToVirtual(0, '@state', sourceMap)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. createAihuLanguageServicePlugin()
// ---------------------------------------------------------------------------

describe('createAihuLanguageServicePlugin()', () => {
  it('has hoverProvider: true in capabilities', () => {
    const plugin = createAihuLanguageServicePlugin()
    expect(plugin.capabilities.hoverProvider).toBe(true)
  })

  it('create() returns an object with provideHover method', () => {
    const plugin = createAihuLanguageServicePlugin()
    const instance = plugin.create({} as never)
    expect(typeof instance.provideHover).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// 6. Macro lowering — generateStateVirtualCode (12 macro types)
// ---------------------------------------------------------------------------

describe('generateStateVirtualCode macro lowering', () => {
  it('lowers $prop to const declaration with number type', () => {
    const source = `@state {\n  $prop: { count: { default: 0 } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('const count: number = 0 as any')
  })

  it('lowers $prop with string default to string type', () => {
    const source = `@state {\n  $prop: { name: { default: 'Alice' } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('const name: string =')
  })

  it('lowers $computed to const with expression', () => {
    const source = `@state {\n  $computed: { doubled: "count * 2" }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('const doubled =')
  })

  it('lowers $resource to ReturnType<typeof _cr>', () => {
    const source = `@state {\n  $resource: { data: { } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('ReturnType<typeof _cr>')
  })

  it('lowers $action to function declaration', () => {
    const source = `@state {\n  $action: { inc: { } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('function inc():')
  })

  it('lowers $effect to comment form', () => {
    const source = `@state {\n  $effect: { track: { } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('/* effect: track */')
  })

  it('lowers $lifecycle to lifecycle comment (not mapped)', () => {
    const source = `@state {\n  $lifecycle: { mount: { } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('/* lifecycle.mount */')
  })

  it('lowers $watch to watch comment form', () => {
    const source = `@state {\n  $watch: { src: "count" }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('/* watch: src */')
  })

  it('lowers $expose to expose comment (not mapped)', () => {
    const source = `@state {\n  $expose: { count: true }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('/* expose: count */')
  })

  it('lowers $shared to const declaration', () => {
    const source = `@state {\n  $shared: { theme: { default: 'light' } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('const theme: string =')
  })

  it('lowers $cookie to const declaration', () => {
    const source = `@state {\n  $cookie: { sessionId: { default: '' } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('const sessionId: string =')
  })

  it('lowers $server to async function declaration', () => {
    const source = `@state {\n  $server: { fetch: { } }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('async function fetch(): Promise<unknown>')
  })

  it('lowers $meta to meta comment (not mapped)', () => {
    const source = `@state {\n  $meta: { title: 'Home' }\n}\n`
    const { virtualCode } = generateStateVirtualCode({ source, snapshot: makeSnapshot(source) })
    expect(virtualCode).toContain('/* meta: title */')
  })

  it('returns empty virtualCode when no @state block', () => {
    const source = `@template {\n  <div>hi</div>\n}\n`
    const { virtualCode, mappings } = generateStateVirtualCode({
      source,
      snapshot: makeSnapshot(source),
    })
    expect(virtualCode).toBe('')
    expect(mappings).toHaveLength(0)
  })
})
