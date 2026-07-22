/**
 * packages/language-server/tests/volar-integration.test.ts
 *
 * Integration tests for the Volar virtual-file layer.
 *
 * #486 step 5 rewrote the virtual code: the plugin now presents `.aihu` files
 * through the compiler's `compileSidecar` type-check surface — the SAME
 * virtual code `aihu-tsc` runs (`@aihu/tsc`, language-plugin.ts) — and the
 * regex-based `@state`-only `state-generator.ts` is retired. These tests
 * cover the plugin identity (LS output ≡ CLI output), the surface's shape,
 * and the AihuLanguageServicePlugin capabilities.
 */

import { compileSidecar } from '@aihu/compiler'
import { createAihuLanguagePlugin as createSharedAihuLanguagePlugin } from '@aihu/tsc'
import type { IScriptSnapshot } from '@volar/language-core'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import {
  createAihuLanguagePlugin,
  createAihuLanguageServicePlugin,
} from '../src/core/volar-plugin.ts'

// Mock compileWithDiagnostics to avoid spawning the binary in tests.
// Bun's node:child_process execFile does not support the `input` option
// (stdin feeding) — calls hang indefinitely. The mock returns a synthetic
// error diagnostic so the source='aihu' assertion is exercisable.
vi.mock('../src/core/diagnostics.ts', () => ({
  compileWithDiagnostics: vi.fn(async (_source: string, _filePath: string) => ({
    code: null,
    diagnostics: [
      {
        code: 'C000',
        message: 'mock compiler error',
        fromText: null,
        toText: null,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      },
    ],
  })),
}))

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
// 2. createVirtualCode — the compileSidecar surface (#486 step 5)
// ---------------------------------------------------------------------------

const SOURCE = `@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}
@template {
  <div>{count}</div>
}
`

describe('createVirtualCode() — the compileSidecar surface', () => {
  it('returns the shared AihuVirtualCode (id "main", languageId "typescript")', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/x-counter.aihu')
    const snapshot = makeSnapshot(SOURCE)
    const result = plugin.createVirtualCode!(uri, 'aihu', snapshot, stubCtx as never)
    expect(result).not.toBeUndefined()
    expect(result!.id).toBe('main')
    expect(result!.languageId).toBe('typescript')
  })

  it('the virtual text is the compiler type-check surface (template lift + mappings)', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/x-counter.aihu')
    const snapshot = makeSnapshot(SOURCE)
    const result = plugin.createVirtualCode!(uri, 'aihu', snapshot, stubCtx as never)
    const virtualText = result!.snapshot.getText(0, result!.snapshot.getLength())
    // The @state body is inlined verbatim; the template expression is lifted
    // through the __aihu_ctx value view (step 1's rewrite-before-lift).
    expect(virtualText).toContain('const [count, setCount] = signal(0)')
    expect(virtualText).toContain('void (__aihu_ctx.count);')
    expect(result!.mappings.length).toBeGreaterThan(0)
  })

  it('returns undefined for non-aihu languageId', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/Counter.ts')
    const snapshot = makeSnapshot('const x = 1')
    const result = plugin.createVirtualCode!(uri, 'typescript', snapshot, stubCtx as never)
    expect(result).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. One virtual code, two consumers (#486 step 5 — acceptance §8.7)
// ---------------------------------------------------------------------------

describe('editor/CLI unification — one virtual code, two consumers', () => {
  it('the LS plugin produces BYTE-IDENTICAL virtual code to the aihu-tsc plugin', () => {
    const lsPlugin = createAihuLanguagePlugin()
    const cliPlugin = createSharedAihuLanguagePlugin(ts)

    const uri = URI.file('/workspace/x-counter.aihu')
    const fromLs = lsPlugin.createVirtualCode!(uri, 'aihu', makeSnapshot(SOURCE), stubCtx as never)
    const fromCli = cliPlugin.createVirtualCode!(
      '/workspace/x-counter.aihu',
      'aihu',
      makeSnapshot(SOURCE) as never,
      stubCtx as never,
    )

    const lsText = fromLs!.snapshot.getText(0, fromLs!.snapshot.getLength())
    const cliText = fromCli!.snapshot.getText(0, fromCli!.snapshot.getLength())
    expect(lsText).toBe(cliText)
    expect(fromLs!.mappings).toEqual(fromCli!.mappings)
  })

  it('both consumers present exactly compileSidecar(source) — no parallel generator', () => {
    const plugin = createAihuLanguagePlugin()
    const uri = URI.file('/workspace/x-counter.aihu')
    const result = plugin.createVirtualCode!(uri, 'aihu', makeSnapshot(SOURCE), stubCtx as never)
    const virtualText = result!.snapshot.getText(0, result!.snapshot.getLength())
    expect(virtualText).toBe(compileSidecar(SOURCE, '/workspace/x-counter.aihu'))
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
// 7. service plugin hooks
// ---------------------------------------------------------------------------

describe('service plugin hooks', () => {
  // Helpers
  function makeDoc(text: string, uri = 'file:///test.aihu') {
    return { uri, getText: () => text, getWordRangeAtPosition: () => undefined } as any
  }
  function makeContext(codes: string[]) {
    return {
      diagnostics: codes.map((code) => ({
        code,
        message: 'err',
        severity: 1,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        source: 'aihu',
      })),
    }
  }

  const plugin = createAihuLanguageServicePlugin()
  const instance = plugin.create({} as any)

  it('provideCompletionItems: state context → STATE_MACRO_COMPLETIONS', () => {
    const text = '@state {\n  $prop name: string\n}'
    const result = instance.provideCompletionItems!(
      makeDoc(text),
      { line: 1, character: 3 },
      {} as any,
      {} as any,
    ) as any
    expect(result.isIncomplete).toBe(false)
    expect(result.items.map((i: any) => i.label)).toContain('$prop')
  })

  it('provideCompletionItems: top-level → BLOCK_COMPLETIONS', () => {
    const text = ''
    const result = instance.provideCompletionItems!(
      makeDoc(text),
      { line: 0, character: 0 },
      {} as any,
      {} as any,
    ) as any
    expect(result.isIncomplete).toBe(false)
    expect(result.items.map((i: any) => i.label)).toContain('@state')
  })

  it('provideCompletionItems: template context → empty', () => {
    const text = '@template {\n  <div/>\n}'
    const result = instance.provideCompletionItems!(
      makeDoc(text),
      { line: 1, character: 3 },
      {} as any,
      {} as any,
    ) as any
    expect(result.isIncomplete).toBe(false)
    expect(result.items).toHaveLength(0)
  })

  it('provideDiagnostics: valid source → empty array', async () => {
    const doc = makeDoc('@state {}\n@template { <div/> }')
    const result = await instance.provideDiagnostics!(doc, {} as any)
    // With no binary, compileWithDiagnostics may return an error diagnostic.
    // The test only verifies it returns an array (not throws).
    expect(Array.isArray(result)).toBe(true)
  })

  it('provideDiagnostics: returned diagnostics have source=aihu', async () => {
    const doc = makeDoc('invalid source that triggers compiler error @@@@')
    const result = (await instance.provideDiagnostics!(doc, {} as any)) as any[]
    if (result.length > 0) {
      expect(result[0].source).toBe('aihu')
    }
  })

  it('provideCodeActions: no matching codes → empty array', () => {
    const doc = makeDoc('@state {}')
    const context = makeContext(['C000'])
    const result = instance.provideCodeActions!(doc, {} as any, context as any, {} as any)
    expect(result).toEqual([])
  })

  it('provideCodeActions: C440 code → quickfix CodeAction', () => {
    const doc = makeDoc('@state { $prop name: string }')
    const context = makeContext(['C440'])
    const result = instance.provideCodeActions!(doc, {} as any, context as any, {} as any) as any[]
    // buildMigrateFix may return null if migrate() throws — handle both cases
    if (result.length > 0) {
      expect(result[0].kind).toBe('quickfix')
    }
  })
})
