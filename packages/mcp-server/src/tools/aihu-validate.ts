/**
 * aihu_validate tool handler.
 *
 * Compiles an aihu SFC source string using the @aihu/compiler Rust binary
 * (via execFileSync --machine-errors flag) and returns structured diagnostics.
 *
 * Response shape:
 *   { ok: true, errors: [], warnings: [], output: "...compiled JS..." }
 *   { ok: false, errors: [{ code: "C440", message: "...", line: N, col: N }], warnings: [] }
 *
 * Uses execFileSync (same as @aihu/compiler's transform()) for reliable
 * stdin piping on all platforms including Windows.
 */

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Binary path resolution — mirrors packages/compiler/js/index.ts convention
const ext = process.platform === 'win32' ? '.exe' : ''

function resolveBinPath(): string {
  if (process.env.SCRIBE_COMPILE_BIN) {
    return process.env.SCRIBE_COMPILE_BIN
  }

  const here = dirname(fileURLToPath(import.meta.url))
  // Path resolution (this file lives in src/tools/ or dist/):
  // - From src/tools/: tools/ → src/ → mcp-server/ → packages/ → compiler/bin
  // - From dist/:       dist/ → mcp-server/ → packages/ → compiler/bin
  const workspaceAttempts = [
    // From src/tools/: go up 3 levels to reach packages/
    resolve(here, '..', '..', '..', 'compiler', 'bin', `aihu-compile${ext}`),
    // From dist/: go up 2 levels to reach packages/
    resolve(here, '..', '..', 'compiler', 'bin', `aihu-compile${ext}`),
    // Workspace root fallback
    resolve(here, '..', '..', '..', '..', 'packages', 'compiler', 'bin', `aihu-compile${ext}`),
  ]

  for (const p of workspaceAttempts) {
    if (existsSync(p)) return p
  }

  // Published install fallback (rely on PATH)
  return `aihu-compile${ext}`
}

const binPath = resolveBinPath()
const TIMEOUT_MS = parseInt(process.env.AIHU_MCP_COMPILE_TIMEOUT_MS ?? '10000', 10)

export interface AihuDiagnostic {
  code: string
  message: string
  line: number
  col: number
}

export interface ValidateResult {
  ok: boolean
  errors: AihuDiagnostic[]
  warnings: AihuDiagnostic[]
  output?: string
}

/**
 * Normalize a raw diagnostic from --machine-errors JSON output into
 * the { code, message, line, col } shape the tool returns.
 */
function normalizeDiagnostic(raw: unknown): AihuDiagnostic {
  if (typeof raw !== 'object' || raw === null) {
    return { code: 'UNKNOWN', message: String(raw), line: 0, col: 0 }
  }
  const r = raw as Record<string, unknown>
  const code = typeof r['code'] === 'string' ? r['code'] : 'UNKNOWN'
  const message = typeof r['message'] === 'string' ? r['message'] : ''

  // Support both { line, col } and { from: { line, character } } shapes
  let line = 0
  let col = 0
  if (typeof r['line'] === 'number') {
    line = r['line']
    col = typeof r['col'] === 'number' ? r['col'] : 0
  } else if (typeof r['from'] === 'object' && r['from'] !== null) {
    const from = r['from'] as Record<string, unknown>
    line = typeof from['line'] === 'number' ? from['line'] : 0
    col = typeof from['character'] === 'number' ? from['character'] : 0
  }

  return { code, message, line, col }
}

/**
 * Handle the aihu_validate tool call.
 * Returns ValidateResult with ok, errors, warnings, and optional output (when ok).
 *
 * Uses execFileSync so stdin piping is reliable on all platforms.
 */
export function handleValidate(input: {
  source: string
  filename?: string
}): ValidateResult {
  const { source, filename = 'component.aihu' } = input
  const stem = basename(filename, '.aihu')

  try {
    const stdout = execFileSync(
      binPath,
      ['--stdin', '--tag', stem, '--path', filename, '--machine-errors'],
      {
        input: source,
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
      },
    )
    return {
      ok: true,
      errors: [],
      warnings: [],
      output: stdout,
    }
  } catch (err: unknown) {
    const e = err as {
      stderr?: string | Buffer
      status?: number
      signal?: string
      killed?: boolean
    }

    // Timeout: Node sets signal to SIGTERM and killed to true
    if (e.killed === true || (typeof e.signal === 'string' && e.signal !== null)) {
      return {
        ok: false,
        errors: [
          {
            code: 'TIMEOUT',
            message: `Compiler timed out after ${TIMEOUT_MS}ms`,
            line: 0,
            col: 0,
          },
        ],
        warnings: [],
      }
    }

    const rawStderr = e.stderr
    const stderr =
      rawStderr instanceof Buffer
        ? rawStderr.toString('utf-8')
        : typeof rawStderr === 'string'
          ? rawStderr
          : ''

    // Try to parse as JSON array of diagnostics (--machine-errors format)
    try {
      const parsed: unknown = JSON.parse(stderr)
      if (Array.isArray(parsed)) {
        const errors = parsed
          .filter((d) => (d as Record<string, unknown>)['severity'] !== 'warning')
          .map(normalizeDiagnostic)
        const warnings = parsed
          .filter((d) => (d as Record<string, unknown>)['severity'] === 'warning')
          .map(normalizeDiagnostic)
        return { ok: false, errors, warnings }
      }
    } catch {
      // not JSON
    }

    // Fallback: plain-text error
    return {
      ok: false,
      errors: [
        {
          code: 'UNKNOWN',
          message: stderr.trim() || 'Compilation failed (no stderr)',
          line: 0,
          col: 0,
        },
      ],
      warnings: [],
    }
  }
}
