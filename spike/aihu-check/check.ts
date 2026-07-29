/**
 * spike/aihu-check/check.ts — programmatic `proxyCreateProgram` attempt.
 *
 * STATUS: SUPERSEDED by check-tsc.mjs (the runTsc path). KEPT AS A RECORD.
 *
 * This builds a one-shot ts.Program via @volar/typescript's
 * `proxyCreateProgram` and calls getSemanticDiagnostics. It DOES route .aihu
 * through the language plugin, BUT TypeScript's own program builder never calls
 * getSourceFile() on a `.aihu` root name because `.aihu` is not in TS's internal
 * `supportedTSExtensions` arrays — so the file is silently dropped and 0 errors
 * are reported. `proxyCreateProgram` alone does NOT patch those arrays; only
 * `runTsc`'s `transformTscContent` does (it rewrites the tsc bundle to splice
 * `.aihu` into supportedTSExtensions/supportedJSExtensions/allSupportedExtensions).
 *
 * To make THIS path work you would have to monkeypatch TS's internal extension
 * arrays (not exposed on the `ts` object) before createProgram — fragile. The
 * supported route is check-tsc.mjs. See the spike report for details.
 *
 * Original intent below; the wiring is correct, only extension registration is
 * missing.
 *
 * Type-checks .aihu files IN MEMORY (no .aihu.ts on disk) using
 * @volar/typescript's `proxyCreateProgram` to drive the real TypeScript
 * compiler over Volar virtual code whose content is the FULL Rust sidecar_ts
 * projection. This is the vue-tsc / svelte-check / astro check architecture.
 *
 * Usage:
 *   bun spike/aihu-check/check.ts <file.aihu> [more.aihu ...]
 *   bun spike/aihu-check/check.ts --tsconfig <tsconfig.json>   (checks every .aihu in `include`/dir)
 *
 * Exit code: 0 if no errors, 1 if type errors found, 2 on internal failure.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { proxyCreateProgram } from '@volar/typescript'
import ts from 'typescript'
import { createAihuFullLanguagePlugin } from './language-plugin.ts'

function parseArgs(argv: string[]): { files: string[]; tsconfig?: string } {
  const files: string[] = []
  let tsconfig: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tsconfig') {
      tsconfig = argv[++i]
    } else {
      files.push(a)
    }
  }
  return { files, tsconfig }
}

/** Minimal default compiler options that mirror the repo's tsconfig.base.json. */
function defaultOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    strict: true,
    noImplicitAny: true,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
  }
}

function loadTsconfig(tsconfigPath: string): { options: ts.CompilerOptions; rootNames: string[] } {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  )
  return { options: parsed.options, rootNames: parsed.fileNames }
}

function main(): number {
  const { files, tsconfig } = parseArgs(process.argv.slice(2))

  let options: ts.CompilerOptions
  let rootNames: string[]

  if (tsconfig) {
    const cfg = loadTsconfig(tsconfig)
    options = { ...cfg.options, noEmit: true }
    rootNames = cfg.rootNames
    // also include any explicitly-passed .aihu files
    rootNames.push(...files.map((f) => resolve(f)))
  } else {
    if (files.length === 0) {
      console.error('usage: check.ts <file.aihu> [...]  |  check.ts --tsconfig <path>')
      return 2
    }
    options = defaultOptions()
    rootNames = files.map((f) => resolve(f))
  }

  // de-dup
  rootNames = [...new Set(rootNames)]
  for (const r of rootNames) {
    if (r.endsWith('.aihu') && !existsSync(r)) {
      console.error(`no such file: ${r}`)
      return 2
    }
  }

  // ── The core wiring: proxy ts.createProgram so .aihu files route through the
  // Volar language plugin (sidecar_ts virtual code) before TS type-checks them.
  const createProgram = proxyCreateProgram(ts, ts.createProgram, () => [
    createAihuFullLanguagePlugin(),
  ])

  // A standard CompilerHost. proxyCreateProgram intercepts getSourceFile to swap
  // .aihu contents for the virtual sidecar TS.
  const host = ts.createCompilerHost(options, true)

  const program = createProgram({ rootNames, options, host })

  // Gather diagnostics across the whole program (or just the .aihu inputs).
  const aihuInputs = rootNames.filter((r) => r.endsWith('.aihu'))
  const targets = aihuInputs.length
    ? aihuInputs.map((f) => program.getSourceFile(f)).filter(Boolean)
    : program.getSourceFiles().filter((sf) => !sf.isDeclarationFile)

  const diags: ts.Diagnostic[] = []
  for (const sf of targets as ts.SourceFile[]) {
    diags.push(...program.getSyntacticDiagnostics(sf))
    diags.push(...program.getSemanticDiagnostics(sf))
  }
  // global (options) diagnostics
  diags.push(...program.getGlobalDiagnostics())

  const errors = diags.filter((d) => d.category === ts.DiagnosticCategory.Error)

  if (errors.length === 0) {
    console.log(`aihu check: ${aihuInputs.length || targets.length} file(s) — no errors`)
    return 0
  }

  const formatHost: ts.FormatDiagnosticsHost = {
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (f) => f,
    getNewLine: () => '\n',
  }
  console.error(ts.formatDiagnosticsWithColorAndContext(errors, formatHost))
  console.error(`aihu check: ${errors.length} error(s)`)
  return 1
}

process.exit(main())
