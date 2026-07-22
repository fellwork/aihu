/**
 * aihu-tsc — type-check a project that contains `.aihu` Single File Components.
 *
 * `.aihu` files are projected into the TypeScript program as virtual TypeScript
 * (see `language-plugin.ts`) via Volar's `proxyCreateProgram` — the same
 * mechanism `vue-tsc` uses. Nothing is written to disk: the `.aihu.ts` sidecars
 * that used to sit beside every source, which authors saw, editors indexed and
 * `.gitignore` had to hide, are gone. Diagnostics are reported against the
 * `.aihu` file, on the line the author wrote.
 *
 * Scope: this is a type-CHECKER (`--noEmit`), not a general-purpose `tsc`. It
 * reads a `tsconfig.json`, checks the project, and reports. Emitting from
 * `.aihu` is the job of `aihu build`, so there is nothing here to emit.
 */

import { relative } from 'node:path'
import { proxyCreateProgram } from '@volar/typescript'
import ts from 'typescript'
import { createAihuLanguagePlugin, getUncompilableFiles } from './language-plugin.ts'

/**
 * Implicit-`any` diagnostics, suppressed for `.aihu` files only.
 *
 * A `@state` body is ordinary JS (`const noGloss = (m) => !m.locked`), and until
 * now none of it was type-checked at all — so nothing in any corpus was ever
 * annotated for it. Under `strict`, switching checking on lights up hundreds of
 * TS7006s that say nothing about correctness and would bury the diagnostics that
 * do.
 *
 * Filtered HERE rather than relaxed in `tsconfig` deliberately: `noImplicitAny:
 * false` in the config would weaken the project's real `.ts` files too. This
 * keeps the relaxation scoped to exactly the files that need it. `--strict-templates`
 * drops the filter once a corpus is annotated.
 */
export const IMPLICIT_ANY_CODES = new Set([
  7005, // Variable implicitly has an 'any' type.
  7006, // Parameter implicitly has an 'any' type.
  7008, // Member implicitly has an 'any' type.
  7031, // Binding element implicitly has an 'any' type.
  7034, // Variable implicitly has type 'any[]' in some locations.
  7053, // Element implicitly has an 'any' type (no index signature).
])

export interface RunOptions {
  /** Path to a tsconfig.json, or a directory containing one. Defaults to cwd. */
  project?: string
  /** Report implicit-`any` inside .aihu files too. */
  strictTemplates?: boolean
  cwd?: string
}

export function run(options: RunOptions = {}): number {
  const cwd = options.cwd ?? process.cwd()
  const configPath = ts.findConfigFile(options.project ?? cwd, ts.sys.fileExists.bind(ts.sys))
  if (!configPath) {
    console.error(`error: no tsconfig.json found from ${options.project ?? cwd}`)
    return 1
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile.bind(ts.sys))
  if (configFile.error) {
    console.error(formatDiagnostics([configFile.error], cwd))
    return 1
  }

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    ts.sys.resolvePath(configPath.replace(/tsconfig\.json$/, '')),
    // Type-check only. `.aihu` has no emit path through tsc — `aihu build` owns that.
    { noEmit: true },
    configPath,
    undefined,
    // `.aihu` is not a known extension, so tsc's own file-globbing would skip
    // every SFC in `include`. Teaching it the extension is what puts them in the
    // program at all.
    [{ extension: '.aihu', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred }],
  )

  // Without this, TypeScript rejects every .aihu root as an unsupported extension
  // (TS6054) and checks NOTHING — and because that lands in getOptionsDiagnostics
  // rather than the semantic set, an unwary caller sees a clean exit 0. A green
  // check over files the compiler refused to read is the exact failure this tool
  // exists to remove, so it is asserted below rather than trusted.
  parsed.options.allowNonTsExtensions = true

  const createProgram = proxyCreateProgram(ts, ts.createProgram, (tsModule) => [
    // #486 step 4 — `--strict-templates` turns the sidecar's attribute/
    // component-prop check layer on; default-off keeps the virtual code
    // byte-identical to the previous surface.
    createAihuLanguagePlugin(tsModule, { strictTemplates: options.strictTemplates ?? false }),
  ])

  const host = ts.createCompilerHost(parsed.options)
  // `projectReferences` is spread in only when present: under
  // `exactOptionalPropertyTypes`, passing an explicit `undefined` is not the same
  // as omitting the key.
  const program = createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    host,
    ...(parsed.projectReferences ? { projectReferences: parsed.projectReferences } : {}),
  })

  // A .aihu root that never became a source file is UNCHECKED — it does not
  // compile, so there is no surface to type-check. Its compile error is `aihu
  // build`'s to report, but silence here would let a green run mean "TypeScript
  // refused to read your file", which is the false green this tool exists to
  // remove. So: name them, count them as failures, and still check the rest.
  // NOT "has no source file": a non-compiling SFC still gets one (TypeScript
  // parses its raw text). The only sound test is whether a type-check surface was
  // generated for it at all.
  const unchecked = [...getUncompilableFiles()].sort()

  const diagnostics = [
    ...program.getConfigFileParsingDiagnostics(),
    ...program.getOptionsDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ].filter((d) => keep(d, options.strictTemplates ?? false))

  if (diagnostics.length > 0) {
    console.error(formatDiagnostics(diagnostics, cwd))
  }

  let errors = diagnostics.filter((d) => d.category === ts.DiagnosticCategory.Error).length

  if (unchecked.length > 0) {
    console.error(
      `\n${unchecked.length} .aihu file(s) could not be compiled, so nothing in them was ` +
        `type-checked. Run \`aihu build\` for the compile error:\n` +
        unchecked.map((f) => `  ${relative(cwd, f)}`).join('\n'),
    )
    errors += unchecked.length
  }

  if (errors > 0) {
    console.error(`\nFound ${errors} error${errors === 1 ? '' : 's'}.\n`)
    return 1
  }
  return 0
}

function keep(d: ts.Diagnostic, strictTemplates: boolean): boolean {
  return keepDiagnosticCode(d.code, d.file?.fileName, strictTemplates)
}

/**
 * The one diagnostic-suppression policy, shared with the language server
 * (step 5): an editor squiggle and a CI failure must apply the SAME filter,
 * or the split-brain this unification removes would creep back in as
 * editor-only implicit-any noise.
 */
export function keepDiagnosticCode(
  code: number | string | undefined,
  fileName: string | undefined,
  strictTemplates: boolean,
): boolean {
  if (strictTemplates) return true
  if (!fileName?.endsWith('.aihu')) return true
  return !IMPLICIT_ANY_CODES.has(Number(code))
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[], cwd: string): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => cwd,
    getNewLine: () => ts.sys.newLine,
  })
}

export type { AihuLanguagePluginOptions, AihuVirtualCode } from './language-plugin.ts'
export { buildMappings, createAihuLanguagePlugin, getUncompilableFiles } from './language-plugin.ts'
