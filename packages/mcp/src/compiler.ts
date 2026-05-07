/**
 * Compiler invocation and error parsing for aihu_validate.
 *
 * Shells out to aihu-compile --machine-errors using execFile (async, non-blocking).
 * Returns structured ValidateResult — either compiled TS on success or
 * an array of AihuDiagnostic objects on failure.
 */

import { execFileSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Binary path resolution:
// 1. SCRIBE_COMPILE_BIN env override (matches convention in packages/compiler/js/index.ts)
// 2. Workspace-relative: packages/compiler/bin/aihu-compile[.exe]
// 3. node_modules/.bin/aihu-compile (published install)
const ext = process.platform === 'win32' ? '.exe' : ''

function resolveBinPath(): string {
  if (process.env.SCRIBE_COMPILE_BIN) {
    return process.env.SCRIBE_COMPILE_BIN
  }

  // Workspace sibling: packages/mcp/ is adjacent to packages/compiler/
  const here = dirname(fileURLToPath(import.meta.url))
  // In dist/: here = packages/mcp/dist, so ../../../compiler/bin/
  // In src/: here = packages/mcp/src, so ../../../compiler/bin/
  const workspaceAttempts = [
    resolve(here, '../../../compiler/bin', `aihu-compile${ext}`),
    resolve(here, '../../compiler/bin', `aihu-compile${ext}`),
  ]

  for (const p of workspaceAttempts) {
    // We return the best guess; if it doesn't exist, execFileAsync will throw
    // and we handle it gracefully via the UNKNOWN fallback.
    if (p) return p
  }

  // Published install fallback: installed by @aihu/compiler's bin field
  return `aihu-compile${ext}`
}

const binPath = resolveBinPath()

// Timeout: configurable via env var, default 10 seconds
const TIMEOUT_MS = parseInt(process.env.AIHU_MCP_COMPILE_TIMEOUT_MS ?? '10000', 10)

export interface AihuDiagnostic {
  code: string
  message: string
  hint?: string
  fix?: string
  from: { line: number; character: number }
  to: { line: number; character: number }
  range: {
    start: { line: number; character: number }
    end: { line: number; character: number }
  }
}

export type ValidateResult =
  | { valid: true; code: string }
  | { valid: false; errors: AihuDiagnostic[] }

/**
 * Compile a .aihu source string and return structured results.
 *
 * On success (exit 0): returns { valid: true, code: compiledTypeScript }
 * On failure (exit 1): returns { valid: false, errors: AihuDiagnostic[] }
 * On non-JSON stderr: wraps in a synthetic UNKNOWN diagnostic
 * On timeout: returns a synthetic TIMEOUT diagnostic
 */
export async function compileSource(source: string, filename: string): Promise<ValidateResult> {
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
    return { valid: true, code: stdout }
  } catch (err: unknown) {
    const e = err as { stderr?: string; killed?: boolean; signal?: string; code?: unknown }

    // Timeout detection: Node sets killed=true and signal='SIGTERM' on timeout
    if (e.killed === true || (typeof e.signal === 'string' && e.signal !== null)) {
      return {
        valid: false,
        errors: [
          {
            code: 'TIMEOUT',
            message: `Compiler timed out after ${TIMEOUT_MS}ms`,
            from: { line: 0, character: 0 },
            to: { line: 0, character: 0 },
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
        ],
      }
    }

    const stderr = e.stderr ?? ''

    // Try to parse as JSON array of diagnostics (--machine-errors format)
    try {
      const errors: AihuDiagnostic[] = JSON.parse(stderr)
      if (Array.isArray(errors)) {
        return { valid: false, errors }
      }
      // JSON but not an array — fall through to UNKNOWN
    } catch {
      // Not JSON
    }

    // Fallback: wrap plain-text error as a synthetic diagnostic
    return {
      valid: false,
      errors: [
        {
          code: 'UNKNOWN',
          message: stderr.trim() || 'Compilation failed (no stderr)',
          from: { line: 0, character: 0 },
          to: { line: 0, character: 0 },
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 },
          },
        },
      ],
    }
  }
}
