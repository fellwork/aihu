#!/usr/bin/env bun
/**
 * sync-readme.ts — regenerate marker-bounded sections of README.md and every
 * packages/**\/README.md from canonical sources.
 *
 * Canonical sources (root README):
 *   - bench/signals/RESULTS.md, bench/arbor/RESULTS.md  → performance tables
 *   - .size-limit.json + rolldown bundling              → bundle-size table
 *   - examples/* / package.json + README.md             → examples table
 *   - packages/* / package.json                         → packages list
 *   - docs/roadmap/*.md + docs/superpowers/specs/*.md   → reference list
 *
 * Per-package READMEs:
 *   - packages/* / package.json                         → name, version, description, exports, deps
 *   - .size-limit.json                                  → size if applicable
 *   - PACKAGE_TIERS map (below)                         → tier-aware "see also" links
 *
 * Usage:
 *   bun scripts/sync-readme.ts            # regenerate (writes if changed)
 *   bun scripts/sync-readme.ts --check    # exit 1 if any file would change (CI)
 *
 * Pre-commit + CI ensure the README + per-package READMEs never drift.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { Glob } from 'bun'
import { rolldown } from 'rolldown'

const REPO_ROOT = process.cwd()
const CHECK_MODE = process.argv.includes('--check')

const SHORT_SHA = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
})()

interface SectionResult {
  key: string
  body: string
  versionStamp?: string // e.g. "@aihu/signals@0.1.0"
}

// ---------------------------------------------------------------------------
// Marker helpers
// ---------------------------------------------------------------------------

function replaceMarker(source: string, key: string, body: string, versionStamp?: string): string {
  const begin = `<!-- BEGIN_AUTOGEN: ${key} -->`
  const end = `<!-- END_AUTOGEN: ${key} -->`
  const beginIdx = source.indexOf(begin)
  const endIdx = source.indexOf(end)
  if (beginIdx === -1 || endIdx === -1) {
    return source // marker absent — silently skip; per-package may not have every section
  }
  const note = `<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->`
  const stamp = versionStamp
    ? `\n<sub><i>Auto-generated against ${versionStamp} on commit \`${SHORT_SHA}\`.</i></sub>\n`
    : `\n<sub><i>Auto-generated on commit \`${SHORT_SHA}\`.</i></sub>\n`
  const replacement = `${begin}\n${note}\n\n${body.trim()}\n${stamp}\n${end}`
  return `${source.slice(0, beginIdx)}${replacement}${source.slice(endIdx + end.length)}`
}

// ---------------------------------------------------------------------------
// Bench parsing — read RESULTS.md, find p50 from each per-workload table
// ---------------------------------------------------------------------------

interface BenchRow {
  competitor: string
  p50: string
}

function parseBenchResults(path: string): Record<string, BenchRow[]> {
  if (!existsSync(path)) return {}
  const md = readFileSync(path, 'utf8')
  const sections: Record<string, BenchRow[]> = {}
  const workloadRe = /## Workload: `([^`]+)`/g
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: classic regex iteration
  while ((match = workloadRe.exec(md)) !== null) {
    const workload = match[1]
    // find the next "### Time" or just the next table
    const tail = md.slice(match.index)
    const tableRe = /\| Competitor \| mean \| p50 \|[\s\S]+?\n\n/m
    const tableMatch = tableRe.exec(tail)
    if (!tableMatch) continue
    const rows: BenchRow[] = []
    const lines = tableMatch[0]
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.startsWith('| ---') && !l.startsWith('| Competitor'))
    for (const line of lines) {
      const cols = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cols.length < 4) continue
      const [competitor, _mean, p50] = cols
      rows.push({ competitor, p50 })
    }
    sections[workload] = rows
  }
  return sections
}

function genPerformanceSection(): SectionResult {
  const sigPath = join(REPO_ROOT, 'bench/signals/RESULTS.md')
  const arbPath = join(REPO_ROOT, 'bench/arbor/RESULTS.md')
  const sigData = parseBenchResults(sigPath)
  const arbData = parseBenchResults(arbPath)

  const lines: string[] = []

  // Signals section
  lines.push(`### \`@aihu/signals\` vs SOTA reactive libraries`)
  lines.push('')
  lines.push(
    `*Source: [\`bench/signals/RESULTS.md\`](./bench/signals/RESULTS.md). p50 latency shown for each competitor.*`,
  )
  lines.push('')

  const sigWorkloads = ['cellx', 'batched-writes-100', 'dynamic-deps', 'creation-1to1000', 'deep-propagation-100']
  const sigPresent = sigWorkloads.filter((w) => sigData[w])
  if (sigPresent.length > 0) {
    const competitors = sigData[sigPresent[0]].map((r) => r.competitor)
    lines.push(`| Workload | ${competitors.join(' | ')} |`)
    lines.push(`|---|${competitors.map(() => '---:').join('|')}|`)
    for (const wl of sigPresent) {
      const row = sigData[wl]
      const cells = competitors.map((c) => {
        const found = row.find((r) => r.competitor === c)
        return found ? found.p50 : '—'
      })
      lines.push(`| \`${wl}\` | ${cells.join(' | ')} |`)
    }
  } else {
    lines.push('_No bench results found yet — run `cd bench/signals && bun src/runner.ts`._')
  }

  lines.push('')

  // Arbor section
  lines.push(`### \`@aihu/arbor\` vs SOTA DOM-binding libraries`)
  lines.push('')
  lines.push(`*Source: [\`bench/arbor/RESULTS.md\`](./bench/arbor/RESULTS.md). JSDOM workloads, p50 latency.*`)
  lines.push('')

  const arbWorkloads = ['mount-10k-leaves', 'mount-deep-100x10', 'mount-wide-1000', 'update-1-of-10k-leaves', 'krausest-1k-cycle']
  const arbPresent = arbWorkloads.filter((w) => arbData[w])
  if (arbPresent.length > 0) {
    const competitors = arbData[arbPresent[0]].map((r) => r.competitor)
    lines.push(`| Workload | ${competitors.join(' | ')} |`)
    lines.push(`|---|${competitors.map(() => '---:').join('|')}|`)
    for (const wl of arbPresent) {
      const row = arbData[wl]
      const cells = competitors.map((c) => {
        const found = row.find((r) => r.competitor === c)
        if (!found) return '—'
        return found.p50.startsWith('ERROR') ? '—' : found.p50
      })
      lines.push(`| \`${wl}\` | ${cells.join(' | ')} |`)
    }
  } else {
    lines.push('_No bench results found yet — run `cd bench/arbor && bun src/runner.ts`._')
  }

  return { key: 'performance', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Bundle sizes — read .size-limit.json, bundle each entry, gzip
// ---------------------------------------------------------------------------

interface SizeEntry {
  name: string
  path: string
  limit: string
  gzip?: boolean
  ignore?: string[]
}

function parseBytes(limit: string): number {
  const m = limit.trim().match(/^(\d+(?:\.\d+)?)\s*(B|kB|KB)$/)
  if (!m) throw new Error(`Cannot parse limit "${limit}"`)
  return m[2] === 'B' ? parseFloat(m[1]) : parseFloat(m[1]) * 1024
}

function fmtBytes(n: number): string {
  return n < 1024 ? `${Math.round(n)} B` : `${(n / 1024).toFixed(2)} kB`
}

async function peerDepsOf(entryPath: string): Promise<string[]> {
  const pkgPath = join(dirname(entryPath), '..', 'package.json')
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    return Object.keys(pkg.peerDependencies ?? {})
  } catch {
    return []
  }
}

async function measureSizes(): Promise<Array<{ name: string; bytes: number; limit: string; ok: boolean }>> {
  const entries: SizeEntry[] = JSON.parse(readFileSync(join(REPO_ROOT, '.size-limit.json'), 'utf8'))
  const out: Array<{ name: string; bytes: number; limit: string; ok: boolean }> = []
  for (const entry of entries) {
    const peerDeps = await peerDepsOf(entry.path)
    const external = [...new Set([...(entry.ignore ?? []), ...peerDeps])]
    if (!existsSync(join(REPO_ROOT, entry.path))) {
      out.push({ name: entry.name, bytes: -1, limit: entry.limit, ok: false })
      continue
    }
    try {
      const bundle = await rolldown({ input: entry.path, external, platform: 'browser' })
      const { output } = await bundle.generate({ format: 'esm', minify: true })
      await bundle.close()
      const chunk = output.find((c) => c.type === 'chunk') as { code?: string } | undefined
      const code = chunk?.code ?? ''
      const raw = Buffer.from(code)
      const bytes = entry.gzip !== false ? gzipSync(raw).length : raw.length
      const ok = bytes <= parseBytes(entry.limit)
      out.push({ name: entry.name, bytes, limit: entry.limit, ok })
    } catch {
      out.push({ name: entry.name, bytes: -1, limit: entry.limit, ok: false })
    }
  }
  return out
}

async function genBundleSizesSection(
  measurements: Array<{ name: string; bytes: number; limit: string; ok: boolean }>,
): Promise<SectionResult> {
  const lines: string[] = []
  lines.push(`| Package | Size (gz) | Limit | Status |`)
  lines.push(`|---|---:|---:|:---:|`)
  for (const m of measurements) {
    const size = m.bytes >= 0 ? fmtBytes(m.bytes) : '—'
    const status = m.bytes < 0 ? '_no dist_' : m.ok ? 'pass' : 'OVER'
    lines.push(`| \`${m.name}\` | ${size} | ${m.limit} | ${status} |`)
  }
  return { key: 'bundle-sizes', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Examples — scrape examples/* / package.json + README.md tagline
// ---------------------------------------------------------------------------

function firstPara(md: string): string {
  const lines = md.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (line.startsWith('#') || line.startsWith('>') || line === '' || line.startsWith('---')) {
      i++
      continue
    }
    const para: string[] = [lines[i]]
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '' && !lines[j].trim().startsWith('#')) {
      para.push(lines[j])
      j++
    }
    return para.join(' ').replace(/\s+/g, ' ').trim()
  }
  return ''
}

function extractWhatThisTeaches(md: string): string {
  const m = md.match(/\*\*What this teaches:?\*\*\s*([^\n]+)/i)
  if (m) return m[1].trim()
  return firstPara(md).slice(0, 220)
}

function extractPort(pkgJson: { scripts?: { dev?: string } }): string {
  const dev = pkgJson?.scripts?.dev ?? ''
  const m = dev.match(/--port\s+(\d+)/)
  return m ? m[1] : '—'
}

function genExamplesSection(): SectionResult {
  const lines: string[] = []
  lines.push(`| # | Folder | What it teaches | Port |`)
  lines.push(`|---|---|---|---|`)
  const glob = new Glob('examples/*/package.json')
  const all: Array<{ folder: string; name: string; teaches: string; port: string }> = []
  for (const rawPath of glob.scanSync(REPO_ROOT)) {
    const path = rawPath.replace(/\\/g, '/')
    if (path.includes('_shared') || path.includes('archived')) continue
    const dir = dirname(path)
    const folder = dir.replace(/^examples\//, '')
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, path), 'utf8'))
    const readmePath = join(REPO_ROOT, dir, 'README.md')
    let teaches = ''
    if (existsSync(readmePath)) {
      teaches = extractWhatThisTeaches(readFileSync(readmePath, 'utf8'))
    }
    const port = extractPort(pkg)
    all.push({ folder, name: pkg.name, teaches, port })
  }
  all.sort((a, b) => a.folder.localeCompare(b.folder))
  let i = 1
  for (const ex of all) {
    const link = `[\`${ex.folder}/\`](./examples/${ex.folder})`
    const teaches = ex.teaches.length > 140 ? `${ex.teaches.slice(0, 137)}...` : ex.teaches || '_no README_'
    lines.push(`| ${String(i).padStart(2, '0')} | ${link} | ${teaches} | ${ex.port} |`)
    i++
  }
  return { key: 'examples', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Packages list — scrape packages/*/package.json
// ---------------------------------------------------------------------------

interface PkgInfo {
  dir: string // packages/foo or packages/server/npm/darwin-arm64
  name: string
  version: string
  description: string
  pkg: Record<string, unknown> & {
    name?: string
    version?: string
    description?: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    exports?: unknown
    main?: string
    module?: string
    files?: string[]
    license?: string
    scripts?: Record<string, string>
  }
  isPlatform: boolean
}

function discoverPackages(): PkgInfo[] {
  const out: PkgInfo[] = []
  const seen = new Set<string>()
  const glob1 = new Glob('packages/*/package.json')
  const glob2 = new Glob('packages/*/*/package.json')
  const glob3 = new Glob('packages/*/*/*/package.json')
  for (const g of [glob1, glob2, glob3]) {
    for (const rawRel of g.scanSync(REPO_ROOT)) {
      // Normalize path separators (Windows ships backslashes from bun glob/dirname)
      const rel = rawRel.replace(/\\/g, '/')
      if (rel.includes('node_modules') || rel.includes('/dist/') || rel.includes('/fixtures/')) continue
      if (seen.has(rel)) continue
      seen.add(rel)
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'))
      if (!pkg.name) continue
      const dir = dirname(rel)
      const isPlatform = dir.includes('/npm/')
      out.push({
        dir,
        name: pkg.name,
        version: pkg.version ?? '0.0.0',
        description: pkg.description ?? '',
        pkg,
        isPlatform,
      })
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

function genPackagesListSection(packages: PkgInfo[]): SectionResult {
  const lines: string[] = []
  lines.push(`| Package | Version | Description |`)
  lines.push(`|---|---|---|`)
  for (const p of packages) {
    if (p.isPlatform) continue
    lines.push(`| [\`${p.name}\`](./${p.dir}) | \`${p.version}\` | ${p.description || '_no description_'} |`)
  }
  return { key: 'packages', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Reference — scrape docs/roadmap/*.md + docs/superpowers/specs/*.md for H1
// ---------------------------------------------------------------------------

function firstH1(md: string): string {
  const m = md.match(/^#\s+(.+)$/m)
  return m ? m[1].trim() : ''
}

function genReferenceSection(): SectionResult {
  const lines: string[] = []
  lines.push(`#### Roadmap tracks`)
  lines.push('')
  const roadmapGlob = new Glob('docs/roadmap/arch-*.md')
  const archDocs: Array<{ file: string; title: string }> = []
  for (const rawRel of roadmapGlob.scanSync(REPO_ROOT)) {
    const rel = rawRel.replace(/\\/g, '/')
    archDocs.push({ file: rel, title: firstH1(readFileSync(join(REPO_ROOT, rel), 'utf8')) })
  }
  archDocs.sort((a, b) => a.file.localeCompare(b.file))
  for (const d of archDocs) {
    lines.push(`- [\`${d.file}\`](./${d.file}) — ${d.title}`)
  }
  lines.push('')
  lines.push(`#### Specs (ratified + RFC)`)
  lines.push('')
  const specGlob = new Glob('docs/superpowers/specs/*.md')
  const specs: Array<{ file: string; title: string; status: string }> = []
  for (const rawRel of specGlob.scanSync(REPO_ROOT)) {
    const rel = rawRel.replace(/\\/g, '/')
    if (rel.includes('applied-amendments')) continue
    const md = readFileSync(join(REPO_ROOT, rel), 'utf8')
    const title = firstH1(md)
    const statusM = md.match(/\*\*Status:\*\*\s*([^\n]+)/)
    const status = statusM ? statusM[1].trim().split(/[;.(]/)[0].trim() : ''
    specs.push({ file: rel, title, status })
  }
  specs.sort((a, b) => a.file.localeCompare(b.file))
  for (const d of specs) {
    const stamp = d.status ? ` _(${d.status})_` : ''
    lines.push(`- [\`${d.file}\`](./${d.file}) — ${d.title}${stamp}`)
  }
  return { key: 'reference', body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// Per-package READMEs
// ---------------------------------------------------------------------------

type Tier = 'A' | 'B' | 'C' | 'D' | 'E' | 'platform'

interface TierInfo {
  tier: Tier
  label: string
  seeAlso: Array<{ label: string; href: string }>
}

const PACKAGE_TIERS: Record<string, TierInfo> = {
  // Tier A — runtime core
  '@aihu/signals': {
    tier: 'A',
    label: 'Reactive runtime core — signals/computeds/effects',
    seeAlso: [
      { label: 'Phase 2 spec (signals)', href: '../../.team/phase-2/spec-signals.md' },
      { label: 'bench/signals', href: '../../bench/signals/RESULTS.md' },
      { label: '@aihu/arbor', href: '../arbor' },
    ],
  },
  '@aihu/arbor': {
    tier: 'A',
    label: 'Reactive runtime core — DOM materialization layer',
    seeAlso: [
      { label: 'Phase 3 spec (arbor)', href: '../../.team/phase-3/spec-arbor.md' },
      { label: 'bench/arbor', href: '../../bench/arbor/RESULTS.md' },
      { label: '@aihu/signals', href: '../signals' },
      { label: '@aihu/runtime', href: '../runtime' },
    ],
  },
  '@aihu/runtime': {
    tier: 'A',
    label: 'Reactive runtime core — custom-element wiring for compiled SFCs',
    seeAlso: [
      { label: 'Phase 4 spec (runtime)', href: '../../.team/phase-4/spec-runtime.md' },
      { label: '@aihu/arbor', href: '../arbor' },
      { label: '@aihu/compiler', href: '../compiler' },
    ],
  },
  '@aihu/context': {
    tier: 'A',
    label: 'Reactive runtime core — async-context request primitives',
    seeAlso: [
      { label: '@aihu/data', href: '../data' },
      { label: '@aihu/server', href: '../server' },
    ],
  },
  // Tier B — meta-framework
  '@aihu/router': {
    tier: 'B',
    label: 'Meta-framework — file-based router',
    seeAlso: [
      { label: 'arch-1 (website)', href: '../../docs/roadmap/arch-1-website.md' },
      { label: 'docs/site/routing-layouts.md', href: '../../docs/site/routing-layouts.md' },
      { label: '@aihu/server', href: '../server' },
    ],
  },
  '@aihu/server': {
    tier: 'B',
    label: 'Meta-framework — SSR + native renderer (napi-rs)',
    seeAlso: [
      { label: 'arch-1 (website)', href: '../../docs/roadmap/arch-1-website.md' },
      { label: 'docs/site/ssr-hydration.md', href: '../../docs/site/ssr-hydration.md' },
      { label: '@aihu/router', href: '../router' },
      { label: '@aihu/agent-readiness', href: '../agent-readiness' },
    ],
  },
  '@aihu/data': {
    tier: 'B',
    label: 'Meta-framework — reactive resources + loader protocol',
    seeAlso: [
      { label: 'docs/site/data-fetching.md', href: '../../docs/site/data-fetching.md' },
      { label: '@aihu/context', href: '../context' },
    ],
  },
  '@aihu/app': {
    tier: 'B',
    label: 'Meta-framework — top-level integration of runtime, router, adapter',
    seeAlso: [
      { label: 'arch-1 (website)', href: '../../docs/roadmap/arch-1-website.md' },
      { label: '@aihu/router', href: '../router' },
      { label: '@aihu/adapter-cloudflare', href: '../adapter-cloudflare' },
    ],
  },
  '@aihu/adapter-cloudflare': {
    tier: 'B',
    label: 'Meta-framework — Cloudflare Workers/Pages deploy adapter',
    seeAlso: [
      { label: '@aihu/app', href: '../app' },
      { label: '@aihu/server', href: '../server' },
    ],
  },
  '@aihu/adapter-vercel': {
    tier: 'B',
    label: 'Meta-framework — Vercel deploy adapter',
    seeAlso: [
      { label: '@aihu/app', href: '../app' },
      { label: '@aihu/server', href: '../server' },
    ],
  },
  // Tier C — agent surface
  '@aihu/agent': {
    tier: 'C',
    label: 'Agent surface — primitives (foundation of agent-readiness)',
    seeAlso: [
      { label: 'Phase 5 spec (agent)', href: '../../.team/phase-5/spec-agent.md' },
      { label: 'Plugin Contract spec', href: '../../docs/superpowers/specs/2026-05-02-spec-plugin-contract.md' },
      { label: '@aihu/agent-service', href: '../agent-service' },
    ],
  },
  '@aihu/agent-service': {
    tier: 'C',
    label: 'Agent surface — server-side execution + tool dispatch',
    seeAlso: [
      { label: 'Live-Binding RFC', href: '../../docs/superpowers/specs/2026-05-05-spec-live-binding.md' },
      { label: '@aihu/agent', href: '../agent' },
      { label: '@aihu/agent-a2a', href: '../agent-a2a' },
      { label: '@aihu/agent-acp', href: '../agent-acp' },
    ],
  },
  '@aihu/agent-a2a': {
    tier: 'C',
    label: 'Agent surface — A2A (Agent-to-Agent) protocol',
    seeAlso: [
      { label: '@aihu/agent-service', href: '../agent-service' },
      { label: '@aihu/agent', href: '../agent' },
    ],
  },
  '@aihu/agent-acp': {
    tier: 'C',
    label: 'Agent surface — ACP (Agent Control Protocol) protocol',
    seeAlso: [
      { label: '@aihu/agent-service', href: '../agent-service' },
      { label: '@aihu/agent', href: '../agent' },
    ],
  },
  '@aihu/agent-readiness': {
    tier: 'C',
    label: 'Agent surface — discovery manifests (llms.txt, MCP Server Card, robots)',
    seeAlso: [
      { label: 'Agent-Readiness spec', href: '../../.team/agent-readiness/spec-agent-readiness.md' },
      { label: '@aihu/server', href: '../server' },
    ],
  },
  // Tier D — compiler/cli
  '@aihu/compiler': {
    tier: 'D',
    label: 'Compiler — Single-File Component (.aihu) → Web Component',
    seeAlso: [
      { label: 'Block Structure spec', href: '../../docs/superpowers/specs/2026-05-02-spec-block-structure.md' },
      { label: 'Template Attribute Syntax spec', href: '../../docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md' },
      { label: 'Macro Vocabulary spec', href: '../../docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md' },
    ],
  },
  '@aihu/cli': {
    tier: 'D',
    label: 'Toolchain — `aihu` / `create-aihu` CLI',
    seeAlso: [
      { label: 'docs/cli.md', href: '../../docs/cli.md' },
      { label: '@aihu/compiler', href: '../compiler' },
    ],
  },
  // Tier E — held private
  '@aihu/plugin': {
    tier: 'E',
    label: 'Plugin substrate — runtime hook surface (held private until live-binding RATIFIES)',
    seeAlso: [
      { label: 'Plugin Contract spec', href: '../../docs/superpowers/specs/2026-05-02-spec-plugin-contract.md' },
      { label: 'Live-Binding RFC', href: '../../docs/superpowers/specs/2026-05-05-spec-live-binding.md' },
    ],
  },
  'vscode-aihu': {
    tier: 'E',
    label: 'Editor — VS Code extension (TextMate grammar + snippets; LSP in M2)',
    seeAlso: [{ label: 'arch-4 (DX tools)', href: '../../docs/roadmap/arch-4-dx-tools.md' }],
  },
}

function tierFor(name: string): TierInfo {
  if (PACKAGE_TIERS[name]) return PACKAGE_TIERS[name]
  if (/^@aihu\/server-[a-z0-9-]+$/.test(name)) {
    return {
      tier: 'platform',
      label: 'Platform-specific native binary distributor for `@aihu/server`',
      seeAlso: [
        { label: '@aihu/server', href: '../../README.md' },
        { label: 'Aihu framework root', href: '../../../../README.md' },
      ],
    }
  }
  return {
    tier: 'E',
    label: 'Held private (unmapped tier)',
    seeAlso: [],
  }
}

function genInstallSection(p: PkgInfo): SectionResult {
  const ti = tierFor(p.name)
  if (ti.tier === 'platform') {
    const lines: string[] = []
    lines.push(
      `This package is the platform-specific native binary distributor for [\`@aihu/server\`](../../README.md). You almost certainly do **not** need to install it directly — it is wired in as an \`optionalDependencies\` of \`@aihu/server\` and resolved automatically for the platform you are on.`,
    )
    lines.push('')
    lines.push(`**Current platform support matrix:**`)
    lines.push('')
    lines.push(`| Triple | npm package |`)
    lines.push(`|---|---|`)
    lines.push(`| \`darwin-arm64\` (Apple Silicon) | \`@aihu/server-darwin-arm64\` |`)
    lines.push(`| \`darwin-x64\` (Intel macOS) | \`@aihu/server-darwin-x64\` |`)
    lines.push(`| \`linux-x64-gnu\` (glibc Linux) | \`@aihu/server-linux-x64-gnu\` |`)
    lines.push(`| \`win32-x64-msvc\` (Windows) | \`@aihu/server-win32-x64-msvc\` |`)
    lines.push('')
    lines.push(`If you genuinely need to install only this package (e.g. for an offline mirror):`)
    lines.push('')
    lines.push('```bash')
    lines.push(`npm install ${p.name}`)
    lines.push(`# or`)
    lines.push(`bun add ${p.name}`)
    lines.push('```')
    return { key: 'install', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
  }
  const lines: string[] = []
  if (ti.tier === 'D' && p.name === '@aihu/cli') {
    lines.push('```bash')
    lines.push(`# Scaffold a new app`)
    lines.push(`bunx ${p.name} app my-app`)
    lines.push(`# Or install globally`)
    lines.push(`bun add -g ${p.name}`)
    lines.push('```')
  } else if (ti.tier === 'E' && p.name === 'vscode-aihu') {
    lines.push(
      `Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=fellwork.vscode-aihu) (publishing as part of v1.1 LSP work).`,
    )
  } else {
    lines.push('```bash')
    lines.push(`npm install ${p.name}`)
    lines.push(`# or`)
    lines.push(`bun add ${p.name}`)
    lines.push('```')
  }
  return { key: 'install', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
}

function genStatsSection(
  p: PkgInfo,
  sizeMap: Map<string, { bytes: number; limit: string }>,
): SectionResult {
  const lines: string[] = []
  lines.push(`| | |`)
  lines.push(`|---|---|`)
  lines.push(`| **Version** | \`${p.version}\` |`)
  const ti = tierFor(p.name)
  lines.push(`| **Tier** | ${ti.tier} — ${ti.label} |`)
  const sz = sizeMap.get(p.name)
  if (sz && sz.bytes >= 0) {
    lines.push(`| **Bundle size** | ${fmtBytes(sz.bytes)} (gz) — limit ${sz.limit} |`)
  }
  if (Array.isArray(p.pkg.files)) {
    lines.push(`| **Published files** | ${p.pkg.files.length} entries |`)
  }
  if (p.pkg.license) {
    lines.push(`| **License** | ${p.pkg.license} |`)
  }
  return { key: 'stats', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
}

function genExportsSection(p: PkgInfo): SectionResult {
  const lines: string[] = []
  const exp = p.pkg.exports
  if (!exp) {
    lines.push(`_No \`exports\` field in \`package.json\`. Main entry: \`${p.pkg.main ?? p.pkg.module ?? 'unset'}\`._`)
  } else if (typeof exp === 'string') {
    lines.push(`Default export: \`${exp}\`.`)
  } else {
    lines.push(`| Subpath | ESM | CJS |`)
    lines.push(`|---|---|---|`)
    for (const [subpath, val] of Object.entries(exp as Record<string, unknown>)) {
      if (typeof val === 'string') {
        lines.push(`| \`${subpath}\` | \`${val}\` | — |`)
        continue
      }
      const v = val as Record<string, unknown>
      const imp = v.import as unknown
      const req = v.require as unknown
      const impStr =
        typeof imp === 'string'
          ? imp
          : typeof imp === 'object' && imp !== null
            ? ((imp as Record<string, unknown>).default as string) ?? '—'
            : '—'
      const reqStr =
        typeof req === 'string'
          ? req
          : typeof req === 'object' && req !== null
            ? ((req as Record<string, unknown>).default as string) ?? '—'
            : '—'
      lines.push(`| \`${subpath}\` | \`${impStr}\` | \`${reqStr}\` |`)
    }
  }
  return { key: 'exports', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
}

function genDepsSection(p: PkgInfo): SectionResult {
  const lines: string[] = []
  const deps = p.pkg.dependencies ?? {}
  const peerDeps = p.pkg.peerDependencies ?? {}
  const optDeps = p.pkg.optionalDependencies ?? {}

  if (
    Object.keys(deps).length === 0 &&
    Object.keys(peerDeps).length === 0 &&
    Object.keys(optDeps).length === 0
  ) {
    lines.push(`_Zero runtime dependencies_ (per the [dep-free thesis](../../README.md#project-posture))_._`)
    return { key: 'deps', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
  }
  if (Object.keys(deps).length > 0) {
    lines.push(`**Dependencies:**`)
    lines.push('')
    for (const [k, v] of Object.entries(deps)) {
      lines.push(`- \`${k}\` — \`${v}\``)
    }
    lines.push('')
  }
  if (Object.keys(peerDeps).length > 0) {
    lines.push(`**Peer dependencies:**`)
    lines.push('')
    for (const [k, v] of Object.entries(peerDeps)) {
      lines.push(`- \`${k}\` — \`${v}\``)
    }
    lines.push('')
  }
  if (Object.keys(optDeps).length > 0) {
    lines.push(`**Optional dependencies (platform-specific):**`)
    lines.push('')
    for (const [k, v] of Object.entries(optDeps)) {
      lines.push(`- \`${k}\` — \`${v}\``)
    }
  }
  return { key: 'deps', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
}

function genLicenseSection(p: PkgInfo): SectionResult {
  const depth = p.dir.split('/').length
  const href = `${'../'.repeat(depth)}LICENSE`
  const license = (p.pkg.license as string) || 'MIT'
  return {
    key: 'license',
    body: `${license} — see [LICENSE](${href}).`,
    versionStamp: `\`${p.name}@${p.version}\``,
  }
}

function genSeeAlsoSection(p: PkgInfo): SectionResult {
  const ti = tierFor(p.name)
  const lines: string[] = []
  // Compute relative depth back to repo root from p.dir.
  const depth = p.dir.split('/').length
  const rootHref = `${'../'.repeat(depth)}README.md`
  const roadmapHref = `${'../'.repeat(depth)}docs/roadmap/SUMMARY.md`
  if (ti.seeAlso.length === 0) {
    lines.push(`- [Aihu framework root](${rootHref})`)
    lines.push(`- [v1.1 roadmap](${roadmapHref})`)
  } else {
    for (const link of ti.seeAlso) {
      lines.push(`- [${link.label}](${link.href})`)
    }
    // Add framework root only if not already present in tier-specific list.
    if (!ti.seeAlso.some((l) => l.label.toLowerCase().includes('framework root') || l.label.toLowerCase().includes('aihu (framework'))) {
      lines.push(`- [Aihu framework root](${rootHref})`)
    }
  }
  return { key: 'see-also', body: lines.join('\n'), versionStamp: `\`${p.name}@${p.version}\`` }
}

function brandHeader(p: PkgInfo): string {
  const ti = tierFor(p.name)
  const lines: string[] = []
  lines.push(`# ${p.name}`)
  lines.push('')
  lines.push(`> **Aihu** — agentic discovery and interaction, for human purpose.`)
  lines.push('')
  lines.push(p.description || ti.label)
  lines.push('')
  if (ti.tier === 'A') {
    lines.push(
      `Part of the **runtime core** layer of the Aihu meta-framework. Shipped to the client; sized via \`bun run size\`. The runtime core is dep-free and stacks under \`@aihu/runtime\` → \`@aihu/router\` → \`@aihu/server\` → \`@aihu/app\`.`,
    )
  } else if (ti.tier === 'B') {
    lines.push(
      `Part of the **meta-framework** layer of Aihu. Provides whole-app capability — file-based routing, SSR, loaders, cookies — without the boilerplate other meta-frameworks impose. See [arch-1](../../docs/roadmap/arch-1-website.md) for the meta-framework contract.`,
    )
  } else if (ti.tier === 'C') {
    lines.push(
      `Part of the **agent surface** layer of Aihu. Every Aihu component exposes its agent surface via the \`@agent\` block; this package implements one slice of the dispatch + protocol surface that connects \`@agent\` actions to live runtime signals (per the [Live-Binding RFC](../../docs/superpowers/specs/2026-05-05-spec-live-binding.md)).`,
    )
  } else if (ti.tier === 'D') {
    lines.push(
      `Part of the **compiler + toolchain** layer of Aihu. Build-time only — does not ship to the client. The compiler reads \`.aihu\` SFC source (per the [Block Structure spec](../../docs/superpowers/specs/2026-05-02-spec-block-structure.md)) and emits standards-compliant Web Components.`,
    )
  } else if (ti.tier === 'E') {
    lines.push(`Held-private workspace package. Not yet published to npm.`)
    lines.push('')
    lines.push(
      `> **Status:** Held private — not yet published to npm. See [v1.1 roadmap](../../docs/roadmap/SUMMARY.md) for ratification gating (e.g. RFC #56 live-binding for \`@aihu/plugin\` enforcement).`,
    )
  } else if (ti.tier === 'platform') {
    lines.push(
      `Platform-specific native binary distributor for [\`@aihu/server\`](../../README.md). Installed automatically as an \`optionalDependencies\` of \`@aihu/server\` for users on this platform.`,
    )
  }
  return lines.join('\n')
}

function migrateExistingProse(p: PkgInfo, existing: string): string {
  // Pull out the body between the H1 header and the License section, drop the
  // boilerplate "Part of the [aihu] framework — agentic discovery..." sentence
  // (we now put a richer paragraph in the brand block above), drop common
  // template stubs, drop existing autogen markers if any, and return what's
  // left as hand-written prose.

  // Strip any existing autogen-marker blocks (defensive — should not be present
  // on first migration, but second-run safety).
  let body = existing.replace(/<!-- BEGIN_AUTOGEN: \w+ -->[\s\S]*?<!-- END_AUTOGEN: \w+ -->/g, '')
  body = body.replace(/<!-- BEGIN_HANDWRITTEN: \w+ -->[\s\S]*?<!-- END_HANDWRITTEN: \w+ -->/g, '')

  // Trim everything before the H1 line.
  const h1Idx = body.indexOf('\n# ')
  if (h1Idx > 0) body = body.slice(h1Idx)
  // Drop the H1 line itself.
  body = body.replace(/^# [^\n]+\n+/, '')
  // Drop the legacy "> One-line description" blockquote and "Part of the [aihu]" boilerplate paragraph.
  body = body.replace(/^>\s*[^\n]+\n+/, '')
  body = body.replace(/^Part of the \[aihu\][^\n]+\n+/m, '')
  // Drop common stub sections that we now autogen. Use multiline-anchored
  // patterns so we only match real H2 headings, not stray lines starting with
  // "# or" inside fenced code blocks.
  body = body.replace(/^##\s+Install[\s\S]*?(?=^##\s|^#\s|$(?![\r\n]))/im, '')
  body = body.replace(/^##\s+Usage[\s\S]*?(?=^##\s|^#\s|$(?![\r\n]))/im, '')
  body = body.replace(/^##\s+Status[\s\S]*?(?=^##\s|^#\s|$(?![\r\n]))/im, '')
  body = body.replace(/^##\s+License[\s\S]*?(?=^##\s|^#\s|$(?![\r\n]))/im, '')
  body = body.trim()
  // If what's left is the bare placeholder ("Aihu CLI ... — scaffolding ..."), drop it.
  // Heuristic: if shorter than 80 chars, treat as no real prose.
  if (body.length < 80) return ''
  return body
}

function buildPackageReadme(
  p: PkgInfo,
  existing: string | null,
  sizeMap: Map<string, { bytes: number; limit: string }>,
): string {
  const header = brandHeader(p)
  const sections = [
    genInstallSection(p),
    genStatsSection(p, sizeMap),
    genExportsSection(p),
    genDepsSection(p),
    genSeeAlsoSection(p),
    genLicenseSection(p),
  ]

  // Preserve hand-written prose. Two paths:
  //   (a) explicit BEGIN_HANDWRITTEN block exists from a prior run → use it
  //   (b) first migration → migrate any prose between H1 and License
  let prose = ''
  if (existing) {
    const m = existing.match(/<!-- BEGIN_HANDWRITTEN: prose -->([\s\S]*?)<!-- END_HANDWRITTEN: prose -->/)
    if (m) {
      prose = m[1].trim()
    } else {
      prose = migrateExistingProse(p, existing)
    }
  }

  const ti = tierFor(p.name)
  const isPlatform = ti.tier === 'platform'
  const proseBlock = `<!-- BEGIN_HANDWRITTEN: prose -->\n${
    prose ||
    (isPlatform
      ? '_(no hand-written prose — this is a platform binary distributor; the autogen sections below tell you everything you need.)_'
      : '_(Hand-written prose lives in this block. Replace this placeholder; everything below is auto-generated.)_')
  }\n<!-- END_HANDWRITTEN: prose -->`

  let body = `${header}\n\n${proseBlock}\n`

  if (!isPlatform) {
    body += `\n## Install\n\n<!-- BEGIN_AUTOGEN: install -->\n<!-- END_AUTOGEN: install -->\n\n`
    body += `## Package facts\n\n<!-- BEGIN_AUTOGEN: stats -->\n<!-- END_AUTOGEN: stats -->\n\n`
    body += `## Exports\n\n<!-- BEGIN_AUTOGEN: exports -->\n<!-- END_AUTOGEN: exports -->\n\n`
    body += `## Dependencies\n\n<!-- BEGIN_AUTOGEN: deps -->\n<!-- END_AUTOGEN: deps -->\n\n`
    body += `## See also\n\n<!-- BEGIN_AUTOGEN: see-also -->\n<!-- END_AUTOGEN: see-also -->\n\n`
  } else {
    body += `\n## Install\n\n<!-- BEGIN_AUTOGEN: install -->\n<!-- END_AUTOGEN: install -->\n\n`
    body += `## Package facts\n\n<!-- BEGIN_AUTOGEN: stats -->\n<!-- END_AUTOGEN: stats -->\n\n`
    body += `## See also\n\n<!-- BEGIN_AUTOGEN: see-also -->\n<!-- END_AUTOGEN: see-also -->\n\n`
  }

  body += `## License\n\n<!-- BEGIN_AUTOGEN: license -->\n<!-- END_AUTOGEN: license -->\n`

  for (const s of sections) {
    body = replaceMarker(body, s.key, s.body, s.versionStamp)
  }

  return body
}

function syncPackageReadme(
  p: PkgInfo,
  sizeMap: Map<string, { bytes: number; limit: string }>,
): { path: string; existed: boolean; changed: boolean; before: string; after: string } {
  const path = join(REPO_ROOT, p.dir, 'README.md')
  const existed = existsSync(path)
  const existing: string | null = existed ? readFileSync(path, 'utf8') : null

  // Regenerate fully if file is missing, the template stub (≤ 40 lines), or
  // doesn't carry the brand block.
  const tooShort = existing ? existing.split('\n').length < 40 : true
  const hasBrandBlock = existing
    ? /^# (@aihu\/[a-z-]+|vscode-aihu|@aihu\/server-[a-z0-9-]+)\s*\n\s*\n\s*>\s*\*\*Aihu\*\*/m.test(existing)
    : false

  let after: string
  // If the existing file lacks the new license autogen marker, treat as needing
  // full regeneration so the static License section gets converted.
  const hasLicenseMarker = existing ? existing.includes('<!-- BEGIN_AUTOGEN: license -->') : false
  if (!existed || tooShort || !hasBrandBlock || !hasLicenseMarker) {
    after = buildPackageReadme(p, existing, sizeMap)
  } else {
    const sections = [
      genInstallSection(p),
      genStatsSection(p, sizeMap),
      genExportsSection(p),
      genDepsSection(p),
      genSeeAlsoSection(p),
      genLicenseSection(p),
    ]
    after = existing
    for (const s of sections) {
      after = replaceMarker(after, s.key, s.body, s.versionStamp)
    }
  }

  const changed = (existing ?? '') !== after
  return { path, existed, changed, before: existing ?? '', after }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`sync-readme.ts — commit ${SHORT_SHA} — mode: ${CHECK_MODE ? 'check' : 'write'}`)

  const packages = discoverPackages()
  const inventoryPath = join(REPO_ROOT, 'scripts/__package-inventory.json')
  const inventory = packages.map((p) => ({
    name: p.name,
    version: p.version,
    dir: p.dir,
    isPlatform: p.isPlatform,
  }))
  const inventoryJson = `${JSON.stringify(inventory, null, 2)}\n`
  let inventoryChanged = false
  if (!existsSync(inventoryPath) || readFileSync(inventoryPath, 'utf8') !== inventoryJson) {
    inventoryChanged = true
    if (!CHECK_MODE) writeFileSync(inventoryPath, inventoryJson)
  }
  console.log(
    `  → ${packages.length} packages discovered (${packages.filter((p) => p.isPlatform).length} platform)`,
  )

  console.log('  → measuring bundle sizes (rolldown)…')
  const measurements = await measureSizes()
  const sizeMap = new Map<string, { bytes: number; limit: string }>()
  for (const m of measurements) sizeMap.set(m.name, { bytes: m.bytes, limit: m.limit })

  console.log('  → generating root README sections…')
  const rootSections: SectionResult[] = [
    genPerformanceSection(),
    await genBundleSizesSection(measurements),
    genExamplesSection(),
    genPackagesListSection(packages),
    genReferenceSection(),
  ]

  const readmePath = join(REPO_ROOT, 'README.md')
  let readme = readFileSync(readmePath, 'utf8')
  const beforeRoot = readme
  for (const s of rootSections) {
    readme = replaceMarker(readme, s.key, s.body, undefined)
  }
  const rootChanged = beforeRoot !== readme

  console.log('  → syncing per-package READMEs…')
  const pkgResults: Array<{
    path: string
    existed: boolean
    changed: boolean
    before: string
    after: string
    name: string
  }> = []
  for (const p of packages) {
    const r = syncPackageReadme(p, sizeMap)
    pkgResults.push({ ...r, name: p.name })
  }
  const pkgChanged = pkgResults.some((r) => r.changed)
  const pkgCreated = pkgResults.filter((r) => !r.existed).length
  const pkgUpdated = pkgResults.filter((r) => r.existed && r.changed).length

  console.log('')
  console.log(`  Root README: ${rootChanged ? 'CHANGED' : 'in sync'}`)
  console.log(`  Inventory:   ${inventoryChanged ? 'CHANGED' : 'in sync'}`)
  console.log(
    `  Packages:    ${pkgCreated} new, ${pkgUpdated} updated, ${pkgResults.length - pkgCreated - pkgUpdated} unchanged`,
  )

  // For drift detection, ignore the SHA stamp itself — the SHA changes on
  // every commit, which would otherwise create infinite "drift" on CI. We
  // compare the SHA-erased rendered file against the SHA-erased existing file.
  const stripSha = (s: string): string =>
    s.replace(/Auto-generated (?:against [^\n]+? )?on commit `[a-f0-9]+`/g, 'Auto-generated on commit `STAMP`')

  if (CHECK_MODE) {
    const realRootChanged = stripSha(beforeRoot) !== stripSha(readme)
    const realPkgChanged = pkgResults.some((r) => stripSha(r.before) !== stripSha(r.after))
    if (realRootChanged || realPkgChanged || inventoryChanged) {
      console.error('')
      console.error('  README drift detected. Run: bun scripts/sync-readme.ts')
      if (realRootChanged) console.error('    - README.md has stale autogen content')
      if (inventoryChanged) console.error('    - scripts/__package-inventory.json is stale')
      for (const r of pkgResults) {
        if (stripSha(r.before) !== stripSha(r.after))
          console.error(`    - ${relative(REPO_ROOT, r.path)} has stale autogen content`)
      }
      process.exit(1)
    }
    console.log('  All in sync (SHA stamps not checked — they refresh on each commit via the pre-commit hook).')
    return
  }

  if (rootChanged) writeFileSync(readmePath, readme)
  for (const r of pkgResults) {
    if (r.changed) writeFileSync(r.path, r.after)
  }
  if (rootChanged || pkgChanged || inventoryChanged) {
    console.log('')
    console.log(
      `  Wrote ${[
        rootChanged && 'README.md',
        inventoryChanged && '__package-inventory.json',
        pkgChanged && `${pkgCreated + pkgUpdated} package READMEs`,
      ]
        .filter(Boolean)
        .join(', ')}.`,
    )
  } else {
    console.log('')
    console.log('  Already in sync — no writes.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
