/**
 * packages/vscode-aihu/server/index.ts
 *
 * Aihu LSP language server - out-of-process Node.js child started by the VS Code
 * extension host via vscode-languageclient (stdio transport).
 *
 * Features implemented:
 *   - Diagnostics: shell out to aihu-compile --machine-errors (debounced 300ms)
 *   - Code actions: QuickFix for C440-C444 via migrate() codemod
 *   - Hover: static lookup table for 13 macro keywords
 *   - Completion: 6 v2 macro-kind snippets ($ trigger) + 5 block names (@ trigger)
 */
import {
  type CodeAction,
  CodeActionKind,
  type CompletionItem,
  CompletionList,
  createConnection,
  type Diagnostic,
  DiagnosticSeverity,
  type InitializeParams,
  type InitializeResult,
  MarkupKind,
  ProposedFeatures,
  type Range,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  type WorkspaceEdit,
} from 'vscode-languageserver/node.js'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { migrate } from '../../compiler/js/codemods/macro-simplification/migrate.js'
import { type AihuDiagnostic, type CompileResult, compileWithDiagnostics } from './compiler.js'
import { BLOCK_COMPLETIONS, STATE_MACRO_COMPLETIONS } from './completion.js'
import { getBlockContext, getHoverContent, getMacroAtPosition } from './hover.js'

// ---------------------------------------------------------------------------
// Connection setup
// ---------------------------------------------------------------------------

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  connection.console.log('Aihu LSP server started')
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      completionProvider: {
        triggerCharacters: ['$', '@'],
      },
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
    },
  }
})

// ---------------------------------------------------------------------------
// Diagnostics - debounced per document
// ---------------------------------------------------------------------------

const pendingValidations = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleValidation(doc: TextDocument): void {
  const uri = doc.uri
  const existing = pendingValidations.get(uri)
  if (existing !== undefined) clearTimeout(existing)
  const handle = setTimeout(() => {
    pendingValidations.delete(uri)
    void validateDocument(doc)
  }, 300)
  pendingValidations.set(uri, handle)
}

async function validateDocument(doc: TextDocument): Promise<void> {
  // Convert file:// URI to a filesystem path (Windows and POSIX)
  const filePath = doc.uri.replace(/^file:\/\/\/([A-Za-z]:)/, '$1').replace(/^file:\/\//, '')
  let result: CompileResult
  try {
    result = await compileWithDiagnostics(doc.getText(), filePath)
  } catch (err) {
    connection.console.error(`Aihu LSP: validation crashed for ${doc.uri}: ${String(err)}`)
    return
  }
  const diagnostics: Diagnostic[] = result.diagnostics.map(toDiagnostic)
  connection.sendDiagnostics({ uri: doc.uri, diagnostics })
}

function toDiagnostic(d: AihuDiagnostic): Diagnostic {
  const range: Range = d.range
    ? { start: d.range.start, end: d.range.end }
    : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
  return {
    range,
    message: d.message,
    severity: DiagnosticSeverity.Error,
    code: d.code,
    source: 'aihu-compile',
  }
}

documents.onDidOpen((e) => scheduleValidation(e.document))
documents.onDidChangeContent((e) => scheduleValidation(e.document))
documents.onDidClose((e) => {
  const uri = e.document.uri
  const pending = pendingValidations.get(uri)
  if (pending !== undefined) {
    clearTimeout(pending)
    pendingValidations.delete(uri)
  }
  connection.sendDiagnostics({ uri, diagnostics: [] })
})

// ---------------------------------------------------------------------------
// Code actions - C440-C444 migration via migrate() codemod
// ---------------------------------------------------------------------------

const MIGRATE_CODES = new Set(['C440', 'C441', 'C442', 'C443', 'C444'])

connection.onCodeAction((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return []

  const migrateDiags = params.context.diagnostics.filter(
    (d) => typeof d.code === 'string' && MIGRATE_CODES.has(d.code),
  )
  if (migrateDiags.length === 0) return []

  const source = doc.getText()
  let migrateResult: ReturnType<typeof migrate>
  try {
    migrateResult = migrate(source)
  } catch (err) {
    connection.console.error(`Aihu LSP: migrate() threw: ${String(err)}`)
    return []
  }

  const { rewritten, warnings } = migrateResult

  let title = 'Migrate to v2 macro syntax (aihu codemod)'
  if (warnings.length > 0) {
    title += ` (${warnings.length} warning(s) - see Output panel)`
    for (const w of warnings) {
      connection.console.warn(`Aihu codemod warning: ${w}`)
    }
  }

  // Replace full document text
  const fullRange: Range = {
    start: { line: 0, character: 0 },
    end: { line: doc.lineCount, character: 0 },
  }

  const edit: WorkspaceEdit = {
    changes: {
      [params.textDocument.uri]: [TextEdit.replace(fullRange, rewritten)],
    },
  }

  const action: CodeAction = {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: migrateDiags,
    edit,
    isPreferred: true,
  }

  return [action]
})

// ---------------------------------------------------------------------------
// Hover - static macro keyword lookup
// ---------------------------------------------------------------------------

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const pos = params.position
  const lineText = doc.getText({
    start: { line: pos.line, character: 0 },
    end: { line: pos.line, character: Number.MAX_SAFE_INTEGER },
  })

  const macro = getMacroAtPosition(lineText, pos.character)
  if (!macro) return null

  const lines = doc.getText().split('\n')
  // getBlockContext used to contextualise hover (state vs template) - currently same table
  const _ctx = getBlockContext(lines, pos.line)

  const content = getHoverContent(macro)
  if (!content) return null

  return {
    contents: { kind: MarkupKind.Markdown, value: content },
  }
})

// ---------------------------------------------------------------------------
// Completion - macro snippets and block names
// ---------------------------------------------------------------------------

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const pos = params.position
  const lineText = doc.getText({
    start: { line: pos.line, character: 0 },
    end: { line: pos.line, character: pos.character },
  })

  const triggerChar = params.context?.triggerCharacter

  if (triggerChar === '$' || lineText.trimEnd().endsWith('$')) {
    const lines = doc.getText().split('\n')
    const ctx = getBlockContext(lines, pos.line)
    if (ctx === 'state') {
      // All state macros in @state context
      return CompletionList.create(STATE_MACRO_COMPLETIONS as CompletionItem[], false)
    }
    // In template context offer only directive-form completions
    const templateItems = STATE_MACRO_COMPLETIONS.filter((c) =>
      ['$on', '$bind', '$show'].includes(c.label),
    )
    return CompletionList.create(templateItems as CompletionItem[], false)
  }

  if (triggerChar === '@' || /^\s*@$/.test(lineText)) {
    return CompletionList.create(BLOCK_COMPLETIONS as CompletionItem[], false)
  }

  return null
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

documents.listen(connection)
connection.listen()
