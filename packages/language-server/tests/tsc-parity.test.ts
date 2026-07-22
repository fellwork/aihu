/**
 * packages/language-server/tests/tsc-parity.test.ts
 *
 * #486 step 5 — the editor/CLI diagnostic parity gate (template-grammar
 * 40-spec §5 step 5; acceptance §8.7 "an editor diagnostic and the CLI
 * diagnostic for the same fixture are byte-identical").
 *
 * The language server and `aihu-tsc` now consume ONE language plugin
 * (`createAihuLanguagePlugin` → `compileSidecar` + `buildMappings`). This
 * test drives BOTH consumers over the same broken fixture:
 *
 *   - CLI side: `run()` from `@aihu/tsc` (the real `aihu-tsc` entry) over a
 *     fixture project, capturing its reported diagnostic.
 *   - Editor side: the language SERVER's `createAihuLanguagePlugin()`
 *     instance driving TypeScript through the same Volar proxy layer
 *     (`proxyCreateProgram`) the server's `createTypeScriptProject` uses,
 *     with the CLI's diagnostic-suppression policy (`keepDiagnosticCode`).
 *
 * Both must report the same TS error, at the same authored `.aihu` line and
 * column, with the same message — the split-brain is gone.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { keepDiagnosticCode, run } from '@aihu/tsc'
import { proxyCreateProgram } from '@volar/typescript'
import ts from 'typescript'
import { afterAll, describe, expect, it } from 'vitest'
import { createAihuLanguagePlugin, withAihuDiagnosticParity } from '../src/core/volar-plugin.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCRATCH = join(__dirname, '.scratch')
mkdirSync(SCRATCH, { recursive: true })

/** A template-expression type error: `count` is a number (wrapper dialect). */
const BROKEN = `@state {
  let count = state(0)
}
@template {
  <p>{count.toUpperCase()}</p>
}
`

const TSCONFIG = {
  compilerOptions: {
    noEmit: true,
    skipLibCheck: true,
    target: 'esnext',
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
  },
  include: ['**/*.aihu'],
}

const fixtureDir = mkdtempSync(join(SCRATCH, 'aihu-parity-'))
writeFileSync(join(fixtureDir, 'tsconfig.json'), JSON.stringify(TSCONFIG))
writeFileSync(join(fixtureDir, 'broken.aihu'), BROKEN)

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true })
})

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI color escapes from tsc's formatted output
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '')

/** CLI consumer — the real `aihu-tsc` run, stderr captured. */
function runCli(): { exit: number; text: string } {
  const chunks: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    chunks.push(args.map(String).join(' '))
  }
  try {
    const exit = run({ project: fixtureDir, cwd: fixtureDir })
    return { exit, text: stripAnsi(chunks.join('\n')) }
  } finally {
    console.error = original
  }
}

/**
 * Editor consumer — the language server's OWN plugin instance, driving
 * TypeScript through the same Volar proxy layer, with the CLI's suppression
 * policy applied. Returns (file, line, character, code, message) tuples in
 * authored `.aihu` coordinates.
 */
function runEditorSide(): Array<{
  file: string
  line: number
  character: number
  code: number
  message: string
}> {
  const configPath = join(fixtureDir, 'tsconfig.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile.bind(ts.sys))
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    fixtureDir,
    { noEmit: true },
    configPath,
    undefined,
    [{ extension: '.aihu', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
  )
  parsed.options.allowNonTsExtensions = true

  // The LS's URI-typed plugin serves the string-id proxy program too — one
  // plugin, both consumers (its script-id normalization is the point).
  const createProgram = proxyCreateProgram(ts, ts.createProgram, () => [
    createAihuLanguagePlugin() as any,
  ])
  const host = ts.createCompilerHost(parsed.options)
  const program = createProgram({ rootNames: parsed.fileNames, options: parsed.options, host })

  return program
    .getSemanticDiagnostics()
    .filter((d) => keepDiagnosticCode(d.code, d.file?.fileName, false))
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => {
      const file = d.file as ts.SourceFile
      const pos = file.getLineAndCharacterOfPosition(d.start ?? 0)
      return {
        file: file.fileName,
        line: pos.line + 1,
        character: pos.character + 1,
        code: d.code,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      }
    })
}

describe('#486 step 5 — editor and CLI report the SAME diagnostic', () => {
  it('one template type error: identical file, line, column, code, and message', () => {
    const cli = runCli()
    expect(cli.exit).toBe(1)

    const editor = runEditorSide()
    expect(editor).toHaveLength(1)
    const diag = editor[0]!

    // The editor-side diagnostic lands on the authored template line.
    expect(diag.file.endsWith('broken.aihu')).toBe(true)
    expect(diag.line).toBe(5)
    expect(diag.code).toBe(2339)
    expect(diag.message).toBe("Property 'toUpperCase' does not exist on type 'number'.")

    // The CLI reported the SAME diagnostic — same authored position, same
    // code, same message text.
    expect(cli.text).toContain(`broken.aihu:${diag.line}:${diag.character}`)
    expect(cli.text).toContain('error TS2339')
    expect(cli.text).toContain("Property 'toUpperCase' does not exist on type 'number'.")
    // Spawns aihu-tsc (→ real tsc) + the editor-side Volar program; both are
    // slow under CI worker load, well past vitest's 5s default. Match the
    // other tsc-spawning lanes' generous ceiling.
  }, 120_000)
})

describe('#486 step 5 — the implicit-any parity filter', () => {
  const makePlugin = (codes: Array<number | string>) => ({
    name: 'stub-ts',
    capabilities: {},
    create: () => ({
      provideDiagnostics: async () =>
        codes.map((code) => ({
          code,
          message: `stub ${code}`,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        })),
    }),
  })

  it('drops the CLI-suppressed implicit-any codes for .aihu documents', async () => {
    const wrapped = withAihuDiagnosticParity(makePlugin([7006, 2339]) as any)
    const instance = wrapped.create({} as never)
    const doc = { uri: 'file:///workspace/x.aihu' }
    const out = (await instance.provideDiagnostics?.(doc as any, {} as never)) ?? []
    expect(out.map((d) => d.code)).toEqual([2339])
  })

  it('leaves non-.aihu documents untouched', async () => {
    const wrapped = withAihuDiagnosticParity(makePlugin([7006, 2339]) as any)
    const instance = wrapped.create({} as never)
    const doc = { uri: 'file:///workspace/x.ts' }
    const out = (await instance.provideDiagnostics?.(doc as any, {} as never)) ?? []
    expect(out.map((d) => d.code)).toEqual([7006, 2339])
  })
})
