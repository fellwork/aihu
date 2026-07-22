/**
 * packages/language-server/src/core/volar-plugin.ts
 *
 * Volar plugin layer for @aihu/language-server.
 *
 * Exports two factories:
 *   - createAihuLanguagePlugin()    — LanguagePlugin<URI, AihuVirtualCode>
 *   - createAihuLanguageServicePlugin() — LanguageServicePlugin (hover provider)
 *
 * ## #486 step 5 — one virtual code, two consumers
 *
 * The language plugin is the SAME `createAihuLanguagePlugin` the `aihu-tsc`
 * CLI runs (`@aihu/tsc`, packages/tsc/src/language-plugin.ts): the `.aihu`
 * file is presented to TypeScript as the compiler's line-preserving
 * type-check surface (`compileSidecar`), and diagnostics map back to the
 * authored line through `buildMappings`. The old regex-based `@state`-only
 * generator (`state-generator.ts`) is retired — an editor squiggle and a CI
 * failure are now the same diagnostic by construction (template-grammar
 * 40-spec §5 step 5; acceptance §8.7).
 */
import type { AihuVirtualCode } from '@aihu/tsc'
import {
  createAihuLanguagePlugin as createSharedAihuLanguagePlugin,
  IMPLICIT_ANY_CODES,
} from '@aihu/tsc'
import type { LanguagePlugin, LanguageServicePlugin } from '@volar/language-server/node'
import ts from 'typescript'
import type { URI } from 'vscode-uri'
import { buildMigrateFix, MIGRATE_CODES } from './code-action.ts'
import { BLOCK_COMPLETIONS, STATE_MACRO_COMPLETIONS } from './completion.ts'
import { compileWithDiagnostics } from './diagnostics.ts'
import { getBlockContext, getHoverContent, getMacroAtPosition } from './hover.ts'

export type { AihuVirtualCode }

// ---------------------------------------------------------------------------
// Factory: AihuLanguagePlugin — the shared compileSidecar-backed virtual code
// ---------------------------------------------------------------------------

/**
 * Create the Volar LanguagePlugin for .aihu files.
 *
 * Thin URI-typed instantiation of the shared `@aihu/tsc` plugin, so the
 * editor and the CLI consume one type-check surface. `strictTemplates`
 * defaults off, matching `aihu-tsc` without `--strict-templates`.
 */
export function createAihuLanguagePlugin(): LanguagePlugin<URI, AihuVirtualCode> {
  return createSharedAihuLanguagePlugin<URI>(ts)
}

// ---------------------------------------------------------------------------
// TS diagnostic parity filter (#486 step 5)
// ---------------------------------------------------------------------------

/**
 * Wrap a TypeScript LanguageServicePlugin (volar-service-typescript) so its
 * diagnostics apply the SAME implicit-`any` suppression `aihu-tsc` applies to
 * `.aihu` files by default (`IMPLICIT_ANY_CODES`, packages/tsc/src/index.ts).
 * Without this, the editor would show implicit-any noise the CI gate
 * deliberately filters — the exact split-brain step 5 removes.
 */
export function withAihuDiagnosticParity(plugin: LanguageServicePlugin): LanguageServicePlugin {
  return {
    ...plugin,
    create(context) {
      const instance = plugin.create(context)
      const provideDiagnostics = instance.provideDiagnostics?.bind(instance)
      if (!provideDiagnostics) return instance
      return {
        ...instance,
        async provideDiagnostics(document, token) {
          const diagnostics = await provideDiagnostics(document, token)
          if (!diagnostics || !document.uri.includes('.aihu')) return diagnostics
          return diagnostics.filter((d) => !IMPLICIT_ANY_CODES.has(Number(d.code)))
        },
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Factory: AihuLanguageServicePlugin (hover)
// ---------------------------------------------------------------------------

/**
 * Create the Volar LanguageServicePlugin for aihu.
 * Wraps the existing getMacroAtPosition / getHoverContent from core/hover.ts.
 * Per architect-brief §4.2 — "direct translation" of the existing onHover handler.
 */
export function createAihuLanguageServicePlugin(): LanguageServicePlugin {
  return {
    capabilities: {
      hoverProvider: true,
      completionProvider: { triggerCharacters: ['$', '@'] },
      diagnosticProvider: { interFileDependencies: false, workspaceDiagnostics: false },
      codeActionProvider: { codeActionKinds: ['quickfix'] },
    },
    create(_context) {
      return {
        provideHover(document, position, _token) {
          // document is TextDocument from vscode-languageserver-textdocument
          // position is vscode.Position = { line: number, character: number }
          const lineText = document.getText({
            start: { line: position.line, character: 0 },
            end: { line: position.line, character: Number.MAX_SAFE_INTEGER },
          })

          const macro = getMacroAtPosition(lineText, position.character)
          if (!macro) return null

          const content = getHoverContent(macro)
          if (!content) return null

          return {
            contents: { kind: 'markdown', value: content },
          }
        },

        provideCompletionItems(document, position, _context, _token) {
          const lines = document.getText().split('\n')
          const ctx = getBlockContext(lines, position.line)
          if (ctx === 'state') {
            return { isIncomplete: false, items: STATE_MACRO_COMPLETIONS as any }
          }
          if (ctx === 'template') {
            return { isIncomplete: false, items: [] }
          }
          // 'unknown' covers top-level AND @style/@agent/@route blocks
          return { isIncomplete: false, items: BLOCK_COMPLETIONS as any }
        },

        async provideDiagnostics(document, _token) {
          const filePath = document.uri.replace(/^file:\/\//, '')
          const result = await compileWithDiagnostics(document.getText(), filePath)
          return result.diagnostics.map((diag) => ({
            severity: 1 as const,
            range: diag.range ?? {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            message: diag.message,
            code: diag.code,
            source: 'aihu',
          }))
        },

        provideCodeActions(document, _range, context, _token) {
          const matching = context.diagnostics.filter(
            (d) => typeof d.code === 'string' && MIGRATE_CODES.has(d.code),
          )
          if (matching.length === 0) return []
          const fix = buildMigrateFix(document.getText())
          if (!fix) return []
          return [
            {
              title: fix.title,
              kind: 'quickfix',
              edit: {
                changes: {
                  [document.uri]: [
                    {
                      range: {
                        start: { line: 0, character: 0 },
                        end: { line: Number.MAX_SAFE_INTEGER, character: 0 },
                      },
                      newText: fix.rewritten,
                    },
                  ],
                },
              },
            },
          ]
        },
      }
    },
  }
}
