/**
 * packages/language-server/src/core/index.ts
 *
 * Editor-agnostic core surface of the aihu language server. Everything here is
 * pure logic + the compiler bridge — no `vscode-languageserver` connection
 * objects. The transport layer (src/server.ts) composes these into LSP handlers.
 *
 * This barrel is the intended adoption seam for a future `@volar/language-core`
 * virtual-code layer (arch-4 §2.7): a Volar plugin would consume these same
 * functions/tables without touching the connection wiring.
 */
export {
  buildMigrateFix,
  MIGRATE_CODES,
  type MigrateFix,
} from './code-action.ts'
export {
  BLOCK_COMPLETIONS,
  COMPOSABLE_COMPLETIONS,
  type LspCompletionItem,
  STATE_MACRO_COMPLETIONS,
} from './completion.ts'
export {
  COMPOSABLE_REGISTRY,
  type ComposableRegistryEntry,
} from './composable-registry.ts'
export {
  type AihuDiagnostic,
  type CompileResult,
  compileWithDiagnostics,
  parseMachineErrors,
} from './diagnostics.ts'
export { getBlockContext, getHoverContent, getMacroAtPosition } from './hover.ts'
export {
  type AihuCodeMapping,
  type AihuSourcePosition,
  type AihuVirtualPosition,
  mapToOriginal,
  mapToVirtual,
  SourceMap,
} from './virtual-source-map.ts'
export {
  type AihuVirtualCode,
  createAihuLanguagePlugin,
  createAihuLanguageServicePlugin,
  withAihuDiagnosticParity,
} from './volar-plugin.ts'
