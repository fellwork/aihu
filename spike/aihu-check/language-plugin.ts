/**
 * spike/aihu-check/language-plugin.ts
 *
 * A Volar `LanguagePlugin` for `.aihu` files whose virtual code is the FULL
 * Rust `sidecar_ts` projection (state + template) — byte-equivalent to the
 * on-disk `<file>.aihu.ts` written today by the Vite plugin.
 *
 * Unlike packages/language-server/src/core/volar-plugin.ts (which only projects
 * @state via generateStateVirtualCode and produces NO TS service-script), this
 * plugin:
 *   1. Calls @aihu/compiler's `transform(source, id, { sidecarOut })` to get the
 *      EXACT production sidecar (synchronous — execFileSync + a temp file read).
 *   2. Wires `LanguagePlugin.typescript.getServiceScript` so @volar/typescript
 *      treats the embedded virtual TS as a real program input — the missing
 *      piece that lets `tsc`/`createProgram` actually type-check it.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { CodegenContext, LanguagePlugin, VirtualCode } from '@volar/language-core'
import type { IScriptSnapshot } from 'typescript'
import ts from 'typescript'

/** Resolve the aihu-compile binary. Env override wins (used by the spike). */
function resolveBin(): string {
  if (process.env.SCRIBE_COMPILE_BIN) return process.env.SCRIBE_COMPILE_BIN
  // dev fallback: workspace-root target/release (this spike lives at
  // <root>/spike/aihu-check, so the root is two levels up).
  return join(import.meta.dirname, '..', '..', 'target', 'release', 'aihu-compile')
}

/**
 * Produce the full Rust `sidecar_ts` for a .aihu source, synchronously.
 *
 * Mirrors @aihu/compiler's transform(source, id, { sidecarOut }) exactly:
 * shell out to the native binary with --sidecar-out pointed at a temp file,
 * then read it back. This is the production projection (state + template), so a
 * parity claim against the on-disk sidecar holds by construction.
 *
 * Returns '' when the compiler emits no sidecar (no @template present) — Volar
 * then treats the file as having empty virtual TS (no diagnostics).
 */
function compileSidecar(sourcePath: string, source: string): string {
  const stem = basename(sourcePath, '.aihu')
  const dir = mkdtempSync(join(tmpdir(), 'aihu-check-'))
  const sidecarOut = join(dir, `${stem}.aihu.ts`)
  try {
    execFileSync(
      resolveBin(),
      ['--stdin', '--tag', stem, '--path', sourcePath, '--sidecar-out', sidecarOut],
      { input: source, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] },
    )
  } catch {
    // Compile failed (syntax error in the .aihu). No sidecar was written; the
    // native diagnostics path (not type-checking) owns those errors. Return ''.
    return ''
  }
  let text = ''
  try {
    text = readFileSync(sidecarOut, 'utf8')
  } catch {
    text = ''
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return text
}

function snapshotOf(text: string): IScriptSnapshot {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  }
}

/**
 * Build an identity mapping covering the whole virtual file. With
 * `preventLeadingOffset` unset, @volar/typescript pads the virtual TS with the
 * original file's per-line whitespace so diagnostic LINES land on the matching
 * .aihu line; the mapping below makes columns navigate 1:1 within the virtual
 * region. (Full column-accurate source-map back to the .aihu curly expression
 * would require the Rust emitter to emit a map — see the report.)
 */
function identityMappings(virtualText: string) {
  return [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [virtualText.length],
      data: {
        verification: true,
        completion: true,
        semantic: true,
        navigation: true,
        structure: true,
        format: false,
      },
    },
  ]
}

export interface AihuFullVirtualCode extends VirtualCode {
  id: string
  languageId: string
  snapshot: IScriptSnapshot
  mappings: ReturnType<typeof identityMappings>
}

/**
 * The Volar LanguagePlugin for .aihu, projecting the FULL sidecar_ts and wiring
 * the TS service-script so @volar/typescript treats the embedded TS as program
 * input. Generic param keyed on `string` because proxyCreateProgram uses string
 * file names as script ids.
 */
export function createAihuFullLanguagePlugin(): LanguagePlugin<string, AihuFullVirtualCode> {
  return {
    getLanguageId(scriptId) {
      return scriptId.endsWith('.aihu') ? 'aihu' : undefined
    },

    createVirtualCode(scriptId, languageId, snapshot): AihuFullVirtualCode | undefined {
      if (languageId !== 'aihu') return undefined
      const source = snapshot.getText(0, snapshot.getLength())
      const sidecar = compileSidecar(scriptId, source)
      const virtualSnapshot = snapshotOf(sidecar)
      return {
        id: 'sidecar_ts',
        languageId: 'typescript',
        snapshot: virtualSnapshot,
        mappings: identityMappings(sidecar),
      }
    },

    updateVirtualCode(scriptId, _virtualCode, newSnapshot) {
      return this.createVirtualCode(scriptId, 'aihu', newSnapshot, undefined as unknown as CodegenContext<string>)
    },

    // The piece the existing LSP plugin omits: tell @volar/typescript that the
    // .aihu file contributes a TS service-script (the virtual sidecar). This is
    // what makes `createProgram` / tsc actually parse + type-check it.
    typescript: {
      extraFileExtensions: [
        { extension: 'aihu', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
      ],
      getServiceScript(root) {
        return {
          code: root,
          extension: '.ts',
          scriptKind: ts.ScriptKind.TS,
          // leave preventLeadingOffset unset -> Volar pads with the source
          // file's per-line whitespace so diagnostic LINES match .aihu lines.
        }
      },
    },
  }
}

export { compileSidecar }
