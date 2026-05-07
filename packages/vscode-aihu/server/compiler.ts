/**
 * packages/vscode-aihu/server/compiler.ts
 *
 * Async wrapper around the aihu-compile Rust binary with --machine-errors support.
 * Invoked by the LSP server on every textDocument/didOpen and textDocument/didChange.
 *
 * NOTE: Uses node:child_process execFile (not exec) with argv arrays — safe from
 * shell injection. The LSP server process runs out-of-process for VS Code isolation.
 */
import { execFile } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const ext = process.platform === 'win32' ? '.exe' : ''
// Resolve binary relative to this file: server/ -> vscode-aihu/ -> compiler/bin/
const binPath: string =
  process.env.AIHU_COMPILE_BIN ??
  resolve(dirname(fileURLToPath(import.meta.url)), `../../compiler/bin/aihu-compile${ext}`)

/**
 * The raw JSON shape emitted by the Rust binary with --machine-errors.
 * range uses 1-based lines (Rust internal) and 0-based cols.
 */
interface RawMachineError {
  code: string
  message: string
  hint?: string
  fix?: string
  /** Original text token (string) NOT an LSP Position */
  from: string | null
  /** Replacement text (string) NOT an LSP Position */
  to: string | null
  /** { line, col, end_line, end_col } — 1-based line, 0-based col from Rust */
  range: { line: number; col: number; end_line: number; end_col: number } | null
}

/** Normalised diagnostic with 0-based LSP positions. */
export interface AihuDiagnostic {
  code: string
  message: string
  hint?: string
  fix?: string
  /** Original source text to replace (for code-action text edits). */
  fromText: string | null
  /** Replacement text (for code-action text edits). */
  toText: string | null
  /** 0-based LSP range. null when position is unknown. */
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  } | null
}

function toAihuDiagnostic(raw: RawMachineError): AihuDiagnostic {
  let lspRange: AihuDiagnostic['range'] = null
  if (raw.range && raw.range.line > 0) {
    // Rust uses 1-based lines; convert to 0-based for LSP.
    const startLine = raw.range.line - 1
    const endLine = raw.range.end_line - 1
    lspRange = {
      start: { line: startLine, character: raw.range.col },
      end: { line: endLine, character: raw.range.end_col },
    }
  }
  return {
    code: raw.code,
    message: raw.message,
    hint: raw.hint,
    fix: raw.fix,
    fromText: raw.from ?? null,
    toText: raw.to ?? null,
    range: lspRange,
  }
}

/**
 * Fallback: parse a plain-text compiler error into a synthetic diagnostic.
 * Used when the binary does not emit JSON (very old binary or stdin parse error).
 * TODO: remove when --machine-errors covers all error paths.
 */
function parsePlainError(stderr: string, _filePath: string): AihuDiagnostic {
  const m = /\b(\d+):\s*(.+)/.exec(stderr)
  const line = m ? Math.max(0, Number.parseInt(m[1]!, 10) - 1) : 0
  const message = m ? m[2]! : stderr.trim() || 'Unknown compiler error'
  return {
    code: 'C000',
    message,
    fromText: null,
    toText: null,
    range: {
      start: { line, character: 0 },
      end: { line, character: 0 },
    },
  }
}

export interface CompileResult {
  code: string | null
  diagnostics: AihuDiagnostic[]
}

/**
 * Compile a .aihu source string via stdin, returning structured diagnostics.
 */
export async function compileWithDiagnostics(
  source: string,
  filePath: string,
): Promise<CompileResult> {
  const stem =
    filePath
      .replace(/\\/g, '/')
      .split('/')
      .pop()
      ?.replace(/\.aihu$/, '') ?? 'component'

  try {
    const { stdout } = await execFileAsync(
      binPath,
      ['--stdin', '--tag', stem, '--path', filePath, '--machine-errors'],
      { input: source, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
    )
    return { code: stdout, diagnostics: [] }
  } catch (err: unknown) {
    const stderr: string = (err as { stderr?: string }).stderr ?? ''
    const diagnostics: AihuDiagnostic[] = []
    let jsonParsed = false
    for (const line of stderr.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed?.startsWith('{')) continue
      try {
        const raw = JSON.parse(trimmed) as RawMachineError
        diagnostics.push(toAihuDiagnostic(raw))
        jsonParsed = true
      } catch {
        // not a JSON line — skip
      }
    }
    if (!jsonParsed) {
      diagnostics.push(parsePlainError(stderr, filePath))
    }
    return { code: null, diagnostics }
  }
}
