/**
 * packages/language-server/src/core/volar-plugin.ts
 *
 * Volar plugin layer for @aihu/language-server.
 *
 * Exports two factories:
 *   - createAihuLanguagePlugin()    — LanguagePlugin<URI, AihuVirtualCode>
 *   - createAihuLanguageServicePlugin() — LanguageServicePlugin (hover provider)
 *
 * See: .context/m2/a4/round-1/architect-brief-volar-refactor.md §4, §5
 */
import type {
  CodegenContext,
  IScriptSnapshot,
  LanguagePlugin,
  LanguageServicePlugin,
  VirtualCode,
} from '@volar/language-server/node'
import type { URI } from 'vscode-uri'
import { buildMigrateFix, MIGRATE_CODES } from './code-action.ts'
import { BLOCK_COMPLETIONS, STATE_MACRO_COMPLETIONS } from './completion.ts'
import { compileWithDiagnostics } from './diagnostics.ts'
import { getBlockContext, getHoverContent, getMacroAtPosition } from './hover.ts'
import { generateStateVirtualCode } from './state-generator.ts'
import type { AihuCodeMapping } from './virtual-source-map.ts'

// ---------------------------------------------------------------------------
// §5.1 AihuVirtualCode
// ---------------------------------------------------------------------------

/**
 * The virtual __state__.ts file generated from a .aihu source's @state block.
 * Implements VirtualCode from @volar/language-core@2.4.28.
 * No further embedding (leaf virtual code — embeddedCodes omitted).
 */
export interface AihuVirtualCode extends VirtualCode {
  /** Always "__state__" — Volar uses this to construct the embedded URI */
  id: string
  /** Always "typescript" */
  languageId: string
  /** IScriptSnapshot wrapping the generated __state__.ts content string */
  snapshot: IScriptSnapshot
  /** Character-level source-map entries (see architect-brief §3) */
  mappings: AihuCodeMapping[]
}

// ---------------------------------------------------------------------------
// §5.2 AihuSource
// ---------------------------------------------------------------------------

/**
 * Metadata attached to the host .aihu source script.
 * Plain data object, NOT a Volar interface implementation.
 */
export interface AihuSource {
  /** The URI of the .aihu file */
  uri: URI
  /** Raw text of the .aihu source */
  text: string
  /** The @state block body text, or null if no @state block found */
  stateBlockText: string | null
  /** Character offset of the @state block's opening brace in `text`, or -1 */
  stateBlockStart: number
}

// ---------------------------------------------------------------------------
// §5.3 AihuLanguagePlugin
// ---------------------------------------------------------------------------

/**
 * Volar LanguagePlugin that handles .aihu files.
 * Implements LanguagePlugin<URI> from @volar/language-core@2.4.28.
 * (Generic parameter K=VirtualCode — AihuVirtualCode satisfies VirtualCode.)
 */
export interface AihuLanguagePlugin extends LanguagePlugin<URI> {
  getLanguageId(scriptId: URI): string | undefined
  createVirtualCode(
    scriptId: URI,
    languageId: string,
    snapshot: IScriptSnapshot,
    ctx: CodegenContext<URI>,
  ): AihuVirtualCode | undefined
  updateVirtualCode?(
    scriptId: URI,
    virtualCode: AihuVirtualCode,
    newSnapshot: IScriptSnapshot,
    ctx: CodegenContext<URI>,
  ): AihuVirtualCode | undefined
}

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

/** Wrap a string in a minimal IScriptSnapshot implementation. */
function createSnapshot(text: string): IScriptSnapshot {
  return {
    getText(start: number, end: number): string {
      return text.slice(start, end)
    },
    getLength(): number {
      return text.length
    },
    getChangeRange(): undefined {
      return undefined
    },
  }
}

// ---------------------------------------------------------------------------
// Factory: AihuLanguagePlugin
// ---------------------------------------------------------------------------

/**
 * Create the Volar LanguagePlugin for .aihu files.
 * Returns "aihu" language ID for .aihu URIs; generates a virtual __state__.ts
 * code block from the @state macro body.
 */
export function createAihuLanguagePlugin(): AihuLanguagePlugin {
  return {
    getLanguageId(scriptId: URI): string | undefined {
      const path =
        typeof scriptId === 'string' ? scriptId : (scriptId.fsPath ?? scriptId.path ?? '')
      return path.endsWith('.aihu') ? 'aihu' : undefined
    },

    createVirtualCode(
      _scriptId: URI,
      languageId: string,
      snapshot: IScriptSnapshot,
      _ctx: CodegenContext<URI>,
    ): AihuVirtualCode | undefined {
      if (languageId !== 'aihu') return undefined

      const source = snapshot.getText(0, snapshot.getLength())
      const output = generateStateVirtualCode({ source, snapshot })

      if (!output.virtualCode) return undefined

      const virtualSnapshot = createSnapshot(output.virtualCode)

      const virtualCode: AihuVirtualCode = {
        id: '__state__',
        languageId: 'typescript',
        snapshot: virtualSnapshot,
        mappings: output.mappings,
      }

      return virtualCode
    },

    updateVirtualCode(
      scriptId: URI,
      _virtualCode: AihuVirtualCode,
      newSnapshot: IScriptSnapshot,
      ctx: CodegenContext<URI>,
    ): AihuVirtualCode | undefined {
      // M2: full regen on every update. Incremental is M3 scope.
      return this.createVirtualCode(scriptId, 'aihu', newSnapshot, ctx)
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
