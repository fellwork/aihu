#!/usr/bin/env bun
/**
 * Generate `src/data/gallery.ts` from the REAL cookbook corpus — do not
 * hand-edit the output. This keeps the examples + cookbook gallery derived
 * from a single source of truth rather than mirrored by hand:
 *
 *   - Cookbook recipes  ← `packages/mcp/src/cookbook-index.json` (the generated
 *     machine-readable index of every `cookbook/*.aihu` recipe: id, type,
 *     description, constructs, packages, concerns, since, playground, related,
 *     anti-patterns, and the full `.aihu` source).
 *   - Governed examples ← each `examples/<dir>/coverage.manifest.json` (the 9
 *     founder-ratified governed examples; see cookbook/COVERAGE-MATRIX.md).
 *
 * The landing-hero constants (HERO_SOURCE / AGENT_SURFACE) are NOT corpus rows —
 * they are the hand-authored dual-surface teaching example — so they are carried
 * through verbatim as literals below and re-emitted unchanged.
 *
 * Run:  bun scripts/gen-gallery.ts   (same convention as gen-api.ts: a committed
 * generated artifact you re-run by hand after the corpus changes, not a
 * prebuild hook — see `gen:gallery` in package.json).
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const repoRoot = join(appRoot, '..', '..')
const indexPath = join(repoRoot, 'packages/mcp/src/cookbook-index.json')
const examplesDir = join(repoRoot, 'examples')
const outPath = join(appRoot, 'src/data/gallery.ts')
const recipePagesDir = join(appRoot, 'src/pages/cookbook')

// ── corpus shapes (subset we consume) ────────────────────────────────────────
interface RawRecipe {
  filename: string
  id: string
  type: string
  description: string
  constructs: string[]
  packages: string[]
  concerns: string[]
  since: string
  playground?: string
  antiPatterns?: string[]
  related?: string[]
  source: string
}
interface RawManifest {
  example: string
  id: string
  subsystem: string
  sources: string[]
  exercises: string[]
  ci: string
}

// ── title-casing: strip the aihu- prefix, upcase known acronyms ──────────────
const ACRONYMS: Record<string, string> = {
  ssr: 'SSR',
  ssg: 'SSG',
  aria: 'ARIA',
  ui: 'UI',
  a2a: 'A2A',
  acp: 'ACP',
  mcp: 'MCP',
}
function titleFor(id: string): string {
  return id
    .replace(/^aihu-/, '')
    .split('-')
    .map((w) => ACRONYMS[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ── TS template-literal escaping for embedded source strings ─────────────────
function tl(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  return `\`${escaped}\``
}
function j(v: unknown): string {
  return JSON.stringify(v)
}

// ── read corpus ──────────────────────────────────────────────────────────────
const recipes = JSON.parse(readFileSync(indexPath, 'utf8')) as RawRecipe[]

const governed = readdirSync(examplesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => join(examplesDir, d.name, 'coverage.manifest.json'))
  .filter((p) => {
    try {
      readFileSync(p)
      return true
    } catch {
      return false
    }
  })
  .map((p) => JSON.parse(readFileSync(p, 'utf8')) as RawManifest)
  .sort((a, b) => a.id.localeCompare(b.id)) // G1..G9

// ── landing-hero constants (hand-authored teaching example; carried verbatim) ─
const HERO_SOURCE = `@state {
  // one declaration — reactive for humans, discoverable for agents
  let city = prop({
    default: 'London',
    describe: 'City to forecast',
    expose: 'read write',
  })

  const refresh = action(
    { describe: 'Fetch the latest forecast', expose: 'read write' },
    async () => { forecast = await getForecast(city) },
  )
}

@template {
  <button on:click={refresh}>Forecast {city}</button>
}`

const AGENT_SURFACE = [
  { kind: 'prop', name: 'city', describe: 'City to forecast', expose: 'read write' },
  { kind: 'action', name: 'refresh', describe: 'Fetch the latest forecast', expose: 'read write' },
]

// ── live islands ─────────────────────────────────────────────────────────────
// Recipes with a REAL hydrated island already registered in main.ts (not a
// mockup). Everything else is source-only until the in-browser WASM playground
// lands (explicitly deferred — see docs/plans, apps/docs follow-up). Keep
// this list hand-authored: it names actual custom elements, not corpus data.
const LIVE_ISLANDS: Record<string, { tag: string; attrs: string }> = {
  'aihu-counter': { tag: 'counter-demo', attrs: 'count="0"' },
  'agent-weather': { tag: 'weather-demo', attrs: 'city="London"' },
}

// ── emit ─────────────────────────────────────────────────────────────────────
const recipeLiterals = recipes
  .map((r) => {
    const title = titleFor(r.id)
    return `  {
    id: ${j(r.id)},
    filename: ${j(r.filename)},
    title: ${j(title)},
    type: ${j(r.type)},
    description: ${j(r.description)},
    constructs: ${j(r.constructs)},
    packages: ${j(r.packages)},
    concerns: ${j(r.concerns)},
    since: ${j(r.since)},${r.playground ? `\n    playground: ${j(r.playground)},` : ''}
    related: ${j(r.related ?? [])},
    antiPatterns: ${j(r.antiPatterns ?? [])},
    source: ${tl(r.source)},
  },`
  })
  .join('\n')

const governedLiterals = governed
  .map(
    (g) => `  {
    id: ${j(g.id)},
    example: ${j(g.example)},
    subsystem: ${j(g.subsystem)},
    sources: ${j(g.sources)},
    exercises: ${j(g.exercises)},
    ci: ${j(g.ci)},
  },`,
  )
  .join('\n')

const out = `/**
 * GENERATED by scripts/gen-gallery.ts — DO NOT EDIT BY HAND.
 *
 * Cookbook rows are derived from packages/mcp/src/cookbook-index.json (the real
 * cookbook/*.aihu corpus + frontmatter + source). Governed rows are derived from
 * examples/<name>/coverage.manifest.json (the 9 founder-ratified governed
 * examples; cookbook/COVERAGE-MATRIX.md). Re-run: \`bun scripts/gen-gallery.ts\`.
 *
 * Coverage: ${recipes.length} cookbook recipes, ${governed.length} governed examples.
 */

/** A cookbook recipe: one real, compiled \`.aihu\` component + its frontmatter. */
export interface Recipe {
  readonly id: string
  readonly filename: string
  readonly title: string
  readonly type: string
  readonly description: string
  readonly constructs: readonly string[]
  readonly packages: readonly string[]
  readonly concerns: readonly string[]
  readonly since: string
  /** Preset label when the recipe is wired into the in-browser playground. */
  readonly playground?: string
  readonly related: readonly string[]
  readonly antiPatterns: readonly string[]
  /** The full \`.aihu\` source of the recipe. */
  readonly source: string
}

/** A governed example: a founder-ratified, CI-built subsystem exemplar. */
export interface Governed {
  readonly id: string
  readonly example: string
  readonly subsystem: string
  readonly sources: readonly string[]
  readonly exercises: readonly string[]
  readonly ci: string
}

export const COOKBOOK: readonly Recipe[] = [
${recipeLiterals}
]

export const GOVERNED: readonly Governed[] = [
${governedLiterals}
]

/** id → recipe, for the per-recipe detail pages + the playground seed lookup. */
export const RECIPE_BY_ID: Readonly<Record<string, Recipe>> = Object.fromEntries(
  COOKBOOK.map((r) => [r.id, r]),
)

/** The recipes wired into the in-browser WASM playground, in corpus order. */
export const PLAYGROUND_PRESETS: readonly Recipe[] = COOKBOOK.filter((r) => !!r.playground)

/**
 * Source shown in the landing hero. Kept as a literal (not inline in the page's
 * @state) because the aihu SSR-eligibility scanner reads reactive-looking tokens
 * (\`prop(\`, \`action(\`, \`on:click\`) literally — inlining aihu source in a page's
 * @state would misclassify the page as interactive and drop it from the DOM-free
 * prerender path.
 */
export const HERO_SOURCE = ${tl(HERO_SOURCE)}

/**
 * The AGENT SURFACE half of the dual-surface card — the exposed expose/describe
 * contract an agent discovers for weather.aihu over MCP / A2A. Mirrors the
 * \`expose\` declarations in HERO_SOURCE so the two projections are provably one
 * component.
 */
export interface AgentSurfaceEntry {
  readonly kind: 'prop' | 'action'
  readonly name: string
  readonly describe: string
  readonly expose: string
}
export const AGENT_SURFACE: readonly AgentSurfaceEntry[] = ${j(AGENT_SURFACE)}

/** Source for the live counter shown in the examples playground (the corpus recipe). */
export const COUNTER_SOURCE: string = RECIPE_BY_ID['aihu-counter']?.source ?? ''

/**
 * Recipes with a REAL hydrated island already registered in \`main.ts\` — the
 * "Run" affordance shows the live custom element for these. Every other recipe
 * is source-only until the in-browser WASM playground lands (deferred; see the
 * follow-up note in the docs app's cookbook build). Hand-authored, not corpus data.
 */
export const LIVE_ISLANDS: Readonly<Record<string, { tag: string; attrs: string }>> = ${j(LIVE_ISLANDS)}
`

writeFileSync(outPath, out)

// ── emit one static detail-page route per recipe ─────────────────────────────
// SSG note: renderToString gets NO route params (prerender.ts), so a dynamic
// `[id]` route would render identical content for every path. Per-recipe pages
// must therefore be concrete static routes — one file each, each importing its
// own recipe by id. Shared styling lives in base.css (.dn-recipe-*), so these
// generated files stay lean (route + state + template, no @style).
rmSync(recipePagesDir, { recursive: true, force: true })
mkdirSync(recipePagesDir, { recursive: true })

function detailPage(r: RawRecipe): string {
  const title = titleFor(r.id)
  const head = {
    title: `${title} — Cookbook — aihu`,
    description: r.description,
    canonical: `/cookbook/${r.id}`,
  }
  const live = LIVE_ISLANDS[r.id]
  const runSection = live
    ? `    <section id="run" class="dn-recipe-sec">
      <div class="dn-sec-head">
        <h2>Run it</h2>
        <span class="dn-status dn-status-accent">
          <span class="dn-dot dn-dot-live"></span>live · runnable
        </span>
      </div>
      <p class="dn-recipe-note">The real, compiled <code>${r.filename}</code> component,
        hydrated as an island right here — fully interactive.</p>
      <div class="dn-recipe-live">
        <${live.tag} ${live.attrs}></${live.tag}>
      </div>
    </section>
`
    : `    <section id="run" class="dn-recipe-sec">
      <div class="dn-sec-head">
        <h2>Run it</h2>
        <span class="dn-status dn-status-graphite">
          <span class="dn-dot dn-dot-graphite"></span>source · static
        </span>
      </div>
      <p class="dn-recipe-note">This recipe doesn't have a hydrated island in the demo
        gallery yet. An in-browser, WASM-compiled playground (edit this source and
        re-render live) is planned as a follow-up — read the real source below.</p>
    </section>
`
  return `@route {
  path: "/cookbook/${r.id}",
  name: "recipe-${r.id}",
  layout: "docs",
  head: {
    title: ${j(head.title)},
    description: ${j(head.description)},
    canonical: ${j(head.canonical)}
  }
}

@state {
  // GENERATED by scripts/gen-gallery.ts — do not edit. Regenerate from the corpus.
  import { RECIPE_BY_ID } from '../../data/gallery.ts'
  import { codeBlock } from '../../lib/code-block.ts'

  const r = RECIPE_BY_ID[${j(r.id)}]
  // Single top-level html={...} binding hydrates (unlike html inside each) and
  // lands in the DOM-free prerender — the datasheet source treatment.
  const code = codeBlock(r.source, { name: r.filename, lang: 'aihu' })

  const constructs = r.constructs
  const packages = r.packages
  const concerns = r.concerns
  const related = r.related
  const antiPatterns = r.antiPatterns
  const hasPackages = r.packages.length > 0
  const hasConcerns = r.concerns.length > 0
  const hasRelated = r.related.length > 0
  const hasAnti = r.antiPatterns.length > 0
}

@template {
  <div class="dn-recipe dn-article">
    <p class="dn-breadcrumb dn-rail"><a href="/cookbook">Cookbook</a> / {r.title}</p>

    <header class="dn-recipe-head">
      <div class="dn-recipe-titles">
        <h1>{r.title}</h1>
        <span class="dn-status dn-status-graphite dn-recipe-type">
          <span class="dn-dot dn-dot-graphite"></span>{r.type}
        </span>
      </div>
      <p class="dn-recipe-desc">{r.description}</p>
      <dl class="dn-recipe-spec">
        <div><dt>id</dt><dd class="dn-num">{r.id}</dd></div>
        <div><dt>since</dt><dd class="dn-num">{r.since}</dd></div>
        <div><dt>file</dt><dd class="dn-num">{r.filename}</dd></div>
      </dl>
      <div class="dn-recipe-chips">
        <code class="dn-chip" each={c of constructs} key={c}>{c}</code>
      </div>
    </header>

${runSection}
    <section class="dn-recipe-sec">
      <div class="dn-sec-head">
        <h2>Source</h2>
        <span class="dn-rail">{r.filename}</span>
      </div>
      <div class="dn-recipe-src" html={code}></div>
    </section>

    <section class="dn-recipe-sec" if={hasPackages || hasConcerns}>
      <div class="dn-sec-head"><h2>Requires</h2></div>
      <dl class="dn-recipe-req">
        <div if={hasPackages}>
          <dt>packages</dt>
          <dd><code class="dn-chip dn-chip-expose" each={p of packages} key={p}>{p}</code></dd>
        </div>
        <div if={hasConcerns}>
          <dt>concerns</dt>
          <dd><code class="dn-chip" each={c of concerns} key={c}>{c}</code></dd>
        </div>
      </dl>
    </section>

    <section class="dn-recipe-sec" if={hasAnti}>
      <div class="dn-sec-head"><h2>Anti-patterns</h2></div>
      <ul class="dn-recipe-anti">
        <li each={a of antiPatterns} key={a}>{a}</li>
      </ul>
    </section>

    <section class="dn-recipe-sec" if={hasRelated}>
      <div class="dn-sec-head"><h2>Related recipes</h2></div>
      <div class="dn-recipe-related">
        <a class="dn-recipe-rel" each={rel of related} key={rel} href={\`/cookbook/\${rel}\`}>
          <span class="dn-dot dn-dot-graphite"></span>{rel}
        </a>
      </div>
    </section>
  </div>
}
`
}

for (const r of recipes) {
  writeFileSync(join(recipePagesDir, `${r.id}.aihu`), detailPage(r))
}

console.log(
  `[gen-gallery] wrote ${outPath} + ${recipes.length} detail pages under ` +
    `src/pages/cookbook/ — ${recipes.length} recipes, ${governed.length} governed examples`,
)
