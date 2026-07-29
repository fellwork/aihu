/**
 * spike/aihu-check/check-tsc.mjs — `aihu check` via the vue-tsc `runTsc` model.
 *
 * This is the production-blessed Volar path: `runTsc` monkeypatches the real
 * `tsc.js` bundle to (a) register `.aihu` as a supported source extension and
 * (b) route `createProgram` through `proxyCreateProgram` + our language plugin
 * (so each `.aihu` file is type-checked against its FULL sidecar_ts virtual
 * code). tsc then drives the whole check — config loading, glob expansion,
 * diagnostics, exit code — exactly as `tsc --noEmit` does today, but in memory.
 *
 * Run it like tsc (it forwards argv):
 *   node spike/aihu-check/check-tsc.mjs --noEmit -p tsconfig.aihu.json
 *   node spike/aihu-check/check-tsc.mjs --noEmit <file.aihu>
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const __dirname = dirname(fileURLToPath(import.meta.url))

// `runTsc` is exposed by the quickstart submodule, NOT the package index.
const { runTsc } = require('@volar/typescript/lib/quickstart/runTsc')
const tscPath = require.resolve('typescript/lib/tsc.js')

// `runTsc` will `require()` this file for the language plugins.
const getLanguagePlugins = require('./language-plugins.cjs')

runTsc(
  tscPath,
  // register `.aihu` as a supported source extension (no extension removal —
  // we don't emit, so basename.d.ts rewriting is irrelevant).
  { extraSupportedExtensions: ['.aihu'], extraExtensionsToRemove: [] },
  getLanguagePlugins,
)

// keep `join` referenced for clarity of resolution base (no-op)
void join
