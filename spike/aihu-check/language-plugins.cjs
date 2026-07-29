/**
 * spike/aihu-check/language-plugins.cjs
 *
 * CommonJS `getLanguagePlugins(ts, options)` for @volar/typescript's `runTsc`.
 * Returns the .aihu LanguagePlugin whose virtual code is the FULL Rust
 * sidecar_ts projection (state + template). Runs under plain node (the tsc
 * bundle is CJS), so this file avoids ESM-only / TS-extension syntax.
 */
const { execFileSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, join } = require('node:path')

function resolveBin() {
  if (process.env.SCRIBE_COMPILE_BIN) return process.env.SCRIBE_COMPILE_BIN
  // this file lives at <root>/spike/aihu-check; root is two levels up.
  return join(__dirname, '..', '..', 'target', 'release', 'aihu-compile')
}

/** Full Rust sidecar_ts for a .aihu source, synchronously (production parity). */
function compileSidecar(sourcePath, source) {
  const stem = basename(sourcePath, '.aihu')
  const dir = mkdtempSync(join(tmpdir(), 'aihu-check-'))
  const sidecarOut = join(dir, stem + '.aihu.ts')
  try {
    execFileSync(
      resolveBin(),
      ['--stdin', '--tag', stem, '--path', sourcePath, '--sidecar-out', sidecarOut],
      { input: source, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] },
    )
  } catch {
    return '' // .aihu syntax error -> native diagnostics path owns it; no sidecar.
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

function snapshotOf(text) {
  return {
    getText: (start, end) => text.slice(start, end),
    getLength: () => text.length,
    getChangeRange: () => undefined,
  }
}

function identityMappings(len) {
  return [
    {
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [len],
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

/** @param {typeof import('typescript')} ts */
function createAihuFullLanguagePlugin(ts) {
  return {
    getLanguageId(scriptId) {
      return String(scriptId).endsWith('.aihu') ? 'aihu' : undefined
    },
    createVirtualCode(scriptId, languageId, snapshot) {
      if (languageId !== 'aihu') return undefined
      const source = snapshot.getText(0, snapshot.getLength())
      let sidecar = compileSidecar(String(scriptId), source)
      // Each sidecar declares the SAME framework globals (`signal`, `$emit`, …)
      // and a `function __aihu_template`. As plain SCRIPTS they share one global
      // scope, so checking >1 .aihu in a single Program collides (TS6200 / TS2393)
      // — the same collision the on-disk `**/*.aihu.ts` glob hits, which is why
      // the existing b3b test runs tsc one file at a time. Appending `export {}`
      // makes each sidecar a MODULE (isolated scope), letting one Program check
      // the whole project at once (amortizing tsc startup). No effect on which
      // errors surface within a file. Only when the sidecar is non-empty.
      if (sidecar) sidecar += '\nexport {};\n'
      return {
        id: 'sidecar_ts',
        languageId: 'typescript',
        snapshot: snapshotOf(sidecar),
        mappings: identityMappings(sidecar.length),
      }
    },
    updateVirtualCode(scriptId, _virtualCode, newSnapshot) {
      return this.createVirtualCode(scriptId, 'aihu', newSnapshot)
    },
    typescript: {
      extraFileExtensions: [
        { extension: 'aihu', isMixedContent: true, scriptKind: ts.ScriptKind.Deferred },
      ],
      getServiceScript(root) {
        return {
          code: root,
          extension: '.ts',
          scriptKind: ts.ScriptKind.TS,
          // preventLeadingOffset unset -> Volar pads with the .aihu file's
          // per-line whitespace so diagnostic LINES land on the .aihu line.
        }
      },
    },
  }
}

// `runTsc` calls this as getLanguagePlugins(ts, options) -> LanguagePlugin[]
module.exports = function getLanguagePlugins(ts /*, options */) {
  return [createAihuFullLanguagePlugin(ts)]
}
