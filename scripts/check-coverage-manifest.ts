#!/usr/bin/env bun
/**
 * CI guard — governed-example coverage manifests cannot drift from reality.
 *
 * Each governed example (proposal §1 "the governed set") carries a
 * `coverage.manifest.json` naming the coverage rows it is the designated LIVE
 * exerciser for. This guard makes those claims non-fiction:
 *
 *   1. Every id in a manifest's `exercises` MUST have a detector here, and that
 *      detector MUST match the example's own source. A manifest that claims a
 *      construct its source does not contain is a RED build — the failing
 *      manifest names the example and the row, so a regression is attributable
 *      (proposal §1.4: "claims can't rot").
 *   2. The union of all `exercises` across the governed set MUST cover the
 *      MUST_BE_LIVE floor — the rows the coverage contract guarantees have at
 *      least one CI-built live exerciser today. A row that falls out of the
 *      union (an example deleted/edited away its only exerciser) is RED.
 *   3. Exactly the ratified governed set is present (9: the 8 subsystem anchors
 *      + agent-hub as the agent-protocol flagship), ids unique.
 *
 * Doctrine (shared with the Slice-0 checks + check:cookbook): a bidirectional
 * self-test (should-flag AND should-not-flag) runs before the real scan, and a
 * zero-manifest tree exits 1 rather than passing vacuously.
 *
 * The FULL construct/package/mode universe — including today's GAPS (rows with
 * no live exerciser yet) — lives in the coverage matrix
 * (cookbook/COVERAGE-MATRIX.md), which is the Phase 2b backlog. MUST_BE_LIVE is
 * only the enforced floor: what the governed set actually exercises today. As
 * Phase 2b/3 close gaps, their rows graduate from the matrix into MUST_BE_LIVE.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const examplesDir = join(repoRoot, 'examples')

// ── The ratified governed set (founder decision: 9 = 8 anchors + agent-hub) ──

const GOVERNED_IDS = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'] as const

// ── Region extraction ────────────────────────────────────────────────────────
// Template/directive rows are matched against the @template block only (so CSS
// selectors like `button:hover` or `.todo-empty` never masquerade as `on:hover`
// / `empty`); intrinsics against @state; @route / @agent against their blocks.
// Files with no block (loader/server .ts sidecars) expose their full text as the
// `code` region.

interface Regions {
  state: string
  template: string
  route: string
  agent: string
  code: string // full text (used by region: 'code' rows)
}

function extractBlock(source: string, name: string): string {
  // Line-anchored: real SFC blocks sit at column 0, so a `// @agent block: …`
  // comment or an `@aihu/agent` import can never masquerade as a live block.
  const m = new RegExp(`^@${name}\\b`, 'm').exec(source)
  if (!m) return ''
  const open = m.index
  const braceStart = source.indexOf('{', open)
  if (braceStart === -1) return ''
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(braceStart + 1, i)
    }
  }
  return source.slice(braceStart + 1)
}

function regionsOf(source: string): Regions {
  return {
    state: extractBlock(source, 'state'),
    template: extractBlock(source, 'template'),
    route: extractBlock(source, 'route'),
    agent: extractBlock(source, 'agent'),
    code: source,
  }
}

// ── Detectors: coverage-row id → { region, regex } ───────────────────────────
// A manifest may only claim rows that appear here (else the guard can't verify
// them). Regexes are deliberately boundary-anchored to avoid substring hits
// (`href=` ⇏ `ref=`, `button:hover` ⇏ `on:hover`).

type Region = keyof Regions
interface Detector {
  region: Region
  re: RegExp
}

const D = (region: Region, re: RegExp): Detector => ({ region, re })

const DETECTORS: Record<string, Detector> = {
  // binding intrinsics (@state)
  state: D('state', /\bstate\s*[(<]/),
  prop: D('state', /\bprop\s*[(<]/),
  derived: D('state', /\bderived\s*[(<]/),
  action: D('state', /\baction\s*[(<]/),
  resource: D('state', /\bresource\s*[(<]/),
  stream: D('state', /\bstream\s*[(<]/),
  controller: D('state', /\bcontroller\s*[(<]/),
  consume: D('state', /\bconsume\s*[(<]/),
  // statement intrinsics (@state)
  effect: D('state', /\beffect\s*\(/),
  onMount: D('state', /\bonMount\s*\(/),
  onDispose: D('state', /\bonDispose\s*\(/),
  onAdopt: D('state', /\bonAdopt\s*\(/),
  onAttributeChange: D('state', /\bonAttributeChange\s*\(/),
  aria: D('state', /\baria\s*\(/),
  provide: D('state', /\bprovide\s*\(/),
  form: D('state', /\bform\s*\(/),
  event: D('state', /\bevent\s*\(/),
  beforeNavigate: D('state', /\bbeforeNavigate\s*\(/),
  afterNavigate: D('state', /\bafterNavigate\s*\(/),
  // dotted intrinsic refinements — base + config key both present in @state
  'prop.expose': D('state', /\bprop\s*[(<]/), // + expose: below via composite
  'prop.attribute': D('state', /attribute\s*:/),
  'prop.reflect': D('state', /reflect\s*:/),
  'prop.required': D('state', /required\s*:/),
  'derived.expose': D('state', /\bderived\s*\(/),
  'action.expose': D('state', /\baction\s*\(/),
  // expose tiers (@state literals)
  'expose:read': D('state', /expose\s*:\s*['"]read['"]/),
  'expose:write': D('state', /expose\s*:\s*['"]write['"]/),
  'expose:read-write': D('state', /expose\s*:\s*['"]read write['"]/),
  'expose:public': D('state', /expose\s*:\s*['"]public['"]/),
  describe: D('state', /describe\s*:/),
  // template grammar (@template)
  interpolation: D('template', /=\{|>\s*\{[^{}]*\}/),
  if: D('template', /\bif=\{/),
  elseif: D('template', /\belseif\b/),
  else: D('template', /(^|\s)else(\s|>)/),
  each: D('template', /\beach=\{/),
  key: D('template', /\bkey=\{/),
  empty: D('template', /(^|\s)empty(\s|>)/),
  show: D('template', /\bshow=\{/),
  html: D('template', /\bhtml=\{/),
  ref: D('template', /\bref=\{/),
  memo: D('template', /\bmemo=\{/),
  once: D('template', /(^|\s)once(\s|>)/),
  raw: D('template', /(^|\s)raw(\s|>)/),
  slot: D('template', /<slot[\s/>]/),
  group: D('template', /<group[\s/>]/),
  suspense: D('template', /<suspense[\s/>]/),
  outlet: D('template', /<outlet[\s/>]/),
  shield: D('template', /<shield[\s/>]/),
  router: D('template', /<router[\s/>]/),
  navigate: D('template', /<navigate[\s/>]|\bnavigate\s*\(/),
  guard: D('template', /<guard[\s/>]/),
  'a-enhanced': D('template', /<a\s[^>]*href/),
  prefetch: D('template', /\bprefetch=/),
  // directive families (@template)
  'bind:value': D('template', /\bbind:value\b/),
  'on:click': D('template', /\bon:click\b/),
  'on:change': D('template', /\bon:change\b/),
  'on:input': D('template', /\bon:input\b/),
  'on:submit.prevent': D('template', /\bon:submit\.prevent\b/),
  'class:directive': D('template', /\bclass:[a-zA-Z]/),
  // route / agent blocks
  route: D('route', /[\s\S]/), // presence of an @route block
  'route.head': D('route', /\bhead\s*:/),
  'route.layout': D('route', /\blayout\s*:/),
  'route.dynamic': D('code', /\[[a-zA-Z]+\]|path\s*:\s*['"][^'"]*:[a-zA-Z]/),
  'agent-block': D('agent', /[\s\S]/), // presence of an @agent block
  // packages / platform / modes (code region)
  'output:static': D('code', /output\s*:\s*['"]static['"]/),
  defineLoader: D('code', /\bdefineLoader\s*\(/),
  requireAuth: D('code', /\brequireAuth\b/),
  websocket: D('code', /\bnew WebSocket\b|WebSocket\(/),
  localStorage: D('code', /\blocalStorage\b/),
  'pkg:context': D('code', /@aihu\/context/),
  'pkg:auth': D('code', /@aihu\/auth/),
  'pkg:css-engine': D(
    'code',
    /@aihu\/css-engine|shadowMode|class="[^"]*\b(flex|grid|max-w|px-|py-|gap-)/,
  ),
  'pkg:agent-a2a': D('code', /agent-a2a|a2a|A2A/),
  'pkg:agent-acp': D('code', /agent-acp|\bacp\b|ACP/),
  'ssr-hydration': D('code', /\bssr\s*:\s*true|defineLoader|renderToString|hydrat/i),
  'css-utility-fold': D('code', /class="[^"]*\b(flex|grid|max-w-|px-|py-|gap-|text-|font-)/),
  'css-container-query': D('code', /@container|@md:|@sm:|@lg:/),
}

// Composite rows: base detector must match AND an extra predicate. Keeps the
// dotted refinements honest (prop.expose ⇒ a prop() AND an expose: key).
const COMPOSITE: Record<string, (r: Regions) => boolean> = {
  'prop.expose': (r) => /\bprop\s*[(<]/.test(r.state) && /expose\s*:/.test(r.state),
  'derived.expose': (r) => /\bderived\s*[(<]/.test(r.state) && /expose\s*:/.test(r.state),
  'action.expose': (r) => /\baction\s*[(<]/.test(r.state) && /expose\s*:/.test(r.state),
}

// ── The enforced floor: rows the governed set must collectively exercise live ─
// Deliberately EXCLUDES today's known gaps (stream, resource/consume intrinsics,
// event/$emit, memo/once/raw, beforeNavigate, shield/navigate/router/guard,
// adapter-vercel, @aihu/store, expose:write-alone, output:spa-only) — those are
// tracked as GAPS in the coverage matrix and graduate here as Phase 2b/3 land.

const MUST_BE_LIVE = [
  'state',
  'prop',
  'derived',
  'action',
  'effect',
  'onMount',
  'onDispose',
  'onAdopt',
  'onAttributeChange',
  'provide',
  'prop.attribute',
  'prop.reflect',
  'expose:read',
  'expose:read-write',
  'describe',
  'interpolation',
  'if',
  'each',
  'key',
  'empty',
  'show',
  'html',
  'ref',
  'outlet',
  'slot',
  'prefetch',
  'a-enhanced',
  'bind:value',
  'on:click',
  'on:submit.prevent',
  'class:directive',
  'route',
  'route.head',
  'route.layout',
  'route.dynamic',
  'agent-block',
  'output:static',
  'defineLoader',
  'requireAuth',
  'websocket',
  'localStorage',
  'afterNavigate',
  'pkg:context',
  'pkg:auth',
  'pkg:agent-a2a',
  'pkg:agent-acp',
  'css-utility-fold',
  'css-container-query',
]

// ── Manifest type + loading ──────────────────────────────────────────────────

interface Manifest {
  example: string
  id: string
  subsystem: string
  sources: string[]
  exercises: string[]
  planned?: string[]
  absorbs?: string[]
  ci?: string
  notes?: string
}

interface LoadedManifest extends Manifest {
  dir: string
  regionsBySource: Regions[]
}

function detectRow(row: string, regionsList: Regions[]): boolean {
  const det = DETECTORS[row]
  if (!det) return false
  if (COMPOSITE[row]) return regionsList.some((r) => COMPOSITE[row](r))
  return regionsList.some((r) => det.re.test(r[det.region]))
}

// ── Bidirectional self-test ──────────────────────────────────────────────────

const GOOD = regionsOf(`@state { let x = state(0); const d = derived(() => x()) }
@template { <ul><li each={i of x} key={i}>{i}</li><li empty>none</li></ul> }`)
if (!DETECTORS.state.re.test(GOOD.state) || !DETECTORS.each.re.test(GOOD.template)) {
  console.error('check:coverage-manifest self-test FAILED — real construct not detected.')
  process.exit(1)
}
const BAD = regionsOf(`@template { <div class="todo-empty">x</div><button class="btn">hi</button> }
@style { button:hover { color: red } }`)
if (DETECTORS.empty.re.test(BAD.template) || DETECTORS.ref.re.test('<a href="/x">y</a>')) {
  console.error('check:coverage-manifest self-test FAILED — substring false positive not guarded.')
  process.exit(1)
}

// ── Load manifests ───────────────────────────────────────────────────────────

const manifests: LoadedManifest[] = []
const errors: string[] = []

for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const manifestPath = join(examplesDir, entry.name, 'coverage.manifest.json')
  let raw: string
  try {
    raw = readFileSync(manifestPath, 'utf-8')
  } catch {
    continue // not a governed example
  }
  let m: Manifest
  try {
    m = JSON.parse(raw)
  } catch (e) {
    errors.push(`${entry.name}/coverage.manifest.json: invalid JSON — ${(e as Error).message}`)
    continue
  }
  const dir = join(examplesDir, entry.name)
  const regionsBySource: Regions[] = []
  for (const rel of m.sources) {
    try {
      // Append the source's own path so filename-encoded facts (dynamic
      // `[param]` route files) are visible to the `code`-region detectors.
      const text = `${readFileSync(join(dir, rel), 'utf-8')}\n/* __source_path__ ${rel} */\n`
      regionsBySource.push(regionsOf(text))
    } catch {
      errors.push(`${entry.name}: source not found: ${rel}`)
    }
  }
  manifests.push({ ...m, dir, regionsBySource })
}

if (manifests.length === 0) {
  console.error('check:coverage-manifest — zero coverage manifests found; refusing a vacuous pass.')
  process.exit(1)
}

// ── 1. governed-set shape ────────────────────────────────────────────────────

const ids = manifests.map((m) => m.id).sort()
const expected = [...GOVERNED_IDS].sort()
if (ids.length !== expected.length || ids.some((v, i) => v !== expected[i])) {
  errors.push(
    `governed set is ${JSON.stringify(ids)} — expected exactly ${JSON.stringify(expected)} ` +
      `(the 8 subsystem anchors + agent-hub).`,
  )
}

// ── 2. every claimed row has a detector AND matches the example's source ─────

for (const m of manifests) {
  for (const row of m.exercises) {
    if (!DETECTORS[row]) {
      errors.push(`${m.example} (${m.id}): claims row '${row}' with no detector (unverifiable).`)
      continue
    }
    if (!detectRow(row, m.regionsBySource)) {
      errors.push(
        `${m.example} (${m.id}): claims '${row}' but no source matches it — ` +
          `sources: ${m.sources.join(', ')}`,
      )
    }
  }
}

// ── 3. union covers the MUST_BE_LIVE floor ───────────────────────────────────

const liveUnion = new Set<string>()
for (const m of manifests) for (const row of m.exercises) liveUnion.add(row)
for (const row of MUST_BE_LIVE) {
  if (!liveUnion.has(row)) {
    errors.push(
      `MUST_BE_LIVE row '${row}' has NO live exerciser in the governed set — ` +
        `coverage floor regressed.`,
    )
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (errors.length > 0) {
  console.error(`check:coverage-manifest — ${errors.length} problem(s):`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  console.error(
    '\nManifest schema: examples/<name>/coverage.manifest.json. Detectors + the' +
      '\nMUST_BE_LIVE floor live in scripts/check-coverage-manifest.ts. The full' +
      '\nrow universe (incl. gaps) is cookbook/COVERAGE-MATRIX.md.',
  )
  process.exit(1)
}

const totalRows = liveUnion.size
console.log(
  `check:coverage-manifest — ${manifests.length} governed examples, ` +
    `${totalRows} distinct live rows, MUST_BE_LIVE floor (${MUST_BE_LIVE.length}) covered.`,
)
