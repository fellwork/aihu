#!/usr/bin/env bun
/**
 * check-alias-parity.ts — the `tsc` <-> `vitest` package-alias parity gate.
 *
 * THE TWO MAPS. This monorepo resolves `@aihu/*` workspace specifiers through
 * two independent, hand-maintained mechanisms:
 *
 *   1. `compilerOptions.paths` in every `tsconfig*.json` — read by `tsc`.
 *   2. `resolve.alias` in root `vitest.config.ts` — read by vite/vitest.
 *
 * They serve DIFFERENT purposes and are deliberately NOT the same size, which
 * is why "just generate one from the other" is the wrong fix (and why
 * `vite-tsconfig-paths` was investigated and REJECTED — see the bottom of this
 * comment). `tsc` runs PER-PACKAGE (`moon run :typecheck` -> one
 * `bunx tsc --noEmit` per project, each against ITS OWN tsconfig, never the
 * root one) and its DEFAULT resolution for a workspace dependency is that
 * package's `dist` via `package.json` `exports`. So tsconfig `paths` are a
 * sparse, deliberate PATCH SET, added only where dist-resolution is wrong for
 * that project. `vitest`, by contrast, must resolve every workspace package to
 * `src` UNIFORMLY — a missing alias there does not error (every package's
 * `dist` exists in a built tree), it silently tests a stale built artifact.
 *
 * WHAT THIS GATE ASSERTS. Not "the maps are equal" — that is false by design.
 * Three properties:
 *
 *   A. AGREEMENT. A specifier mapped by BOTH systems must resolve to the SAME
 *      file. A src-vs-dist split, or two tsconfigs disagreeing with each other
 *      about the same key, is the failure this whole gate exists for.
 *   B. NO SILENT ONE-SIDEDNESS. A key mapped by only one system must be on the
 *      explicit `ONE_SIDED` allowlist below, each with a written reason. A NEW
 *      one-sided key FAILS until a human either fixes it or deliberately
 *      allowlists it. Silence is the bug; the allowlist is the fix.
 *   C. ORDERING. vite's alias matching (`@rollup/plugin-alias`'s `matches`:
 *      `importee === pattern || importee.startsWith(pattern + '/')`) is
 *      FIRST-MATCH over an ORDERED list, so a subpath key (`@aihu/router/server`)
 *      listed AFTER its own prefix (`@aihu/router`) is unreachable — the prefix
 *      wins and the specifier resolves to `<index.ts>/server`, which does not
 *      exist. vitest.config.ts carries three hand-written "Order matters"
 *      comments about exactly this; a comment is not a check, so it is checked
 *      here, against the file's SOURCE ORDER (a parsed object's key
 *      enumeration is not the array order vite actually consumes).
 *      tsconfig `paths` need no such rule: TS matches exactly (or by an
 *      explicit `*` wildcard), never by implicit prefix. That asymmetry is
 *      itself a trap — a tsconfig that maps `@aihu/arbor` does NOT thereby
 *      cover `@aihu/arbor/hydrate`, and the subpath quietly falls through to
 *      `dist`. Property A catches that once the subpath is mapped anywhere.
 *   D. TARGETS EXIST. Both systems fail SOFTLY on a target that does not exist:
 *      tsc falls through to node resolution (i.e. `dist`) and vite defers to
 *      normal resolution. A typo'd path therefore reads as "no alias", which is
 *      precisely the invisible state this gate is about.
 *
 * WHY NOT `vite-tsconfig-paths`: it derives vitest's aliases FROM tsconfig, so
 * every vitest-only key below (which by definition has no tsconfig source)
 * would fall through to `dist` — and since `dist` exists in a built tree that
 * would not error, it would silently start testing built artifacts. It also
 * cannot express the `virtual:aihu-*` stubs at all, and its per-file
 * nearest-tsconfig semantics differ from this repo's single global
 * prefix-matched map.
 *
 * Run: bun run check:alias-parity
 * Fixture mode: ALIAS_PARITY_ROOT=<dir> bun scripts/check-alias-parity.ts
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')

/**
 * Scan root. Overridable so check:gate-wiring can point this gate at a small
 * fixture tree and observe it go red (and green) — the same shape as
 * MOON_GRAPH_ROOT / RUST_PIN_ROOT. It changes WHERE this reads, nothing else.
 */
const ROOT = resolve(REPO_ROOT, process.env.ALIAS_PARITY_ROOT ?? '.')

// ---------- One-sided allowlist ----------

export type Side = 'vitest-only' | 'tsconfig-only'

export interface OneSided {
  side: Side
  /** Why this key legitimately exists in only one of the two systems. */
  reason: string
}

/**
 * Keys DELIBERATELY mapped by only one of the two systems. Every entry needs a
 * reason a human wrote. This list is the whole point of the gate: a new
 * one-sided key must be a decision, not an accident.
 */
export const ONE_SIDED: Record<string, OneSided> = {
  '@aihu/tsc': {
    side: 'vitest-only',
    reason:
      'tsc side is dist ON PURPOSE. packages/language-server is the only in-repo consumer and ' +
      'its moon.yml says so in as many words ("@aihu/tsc\'s types resolve to its built ' +
      'dist/index.d.ts, so its build must run before this project\'s typecheck") — it carries an ' +
      "explicit dependsOn: ['tsc'] so the inherited `^:build` produces that .d.ts first. vitest " +
      'still needs src so language-server tests exercise @aihu/tsc source, not a prior build.',
  },
  '@aihu/agent-a2a': {
    side: 'vitest-only',
    reason:
      'No tsc project imports it. The only importers are examples/agent-hub/server.ts and doc ' +
      'prose, and examples/* is not in the Moon project graph (.moon/workspace.yml registers ' +
      'packages/* + bench/* only), so no per-package typecheck ever resolves this specifier.',
  },
  '@aihu/agent-acp': {
    side: 'vitest-only',
    reason:
      'Same as @aihu/agent-a2a: only examples/agent-hub imports it, and examples/* is not a Moon project.',
  },
  '@aihu/auth': {
    side: 'vitest-only',
    reason:
      "Only examples/storefront/server.ts and packages/auth's own JSDoc reference it; " +
      'examples/* is not a Moon project, and a package does not self-alias by package name.',
  },
  '@aihu/plugin-demo': {
    side: 'vitest-only',
    reason:
      "Only examples/plugin-demo/aihu.config.ts and packages/plugin-demo's own JSDoc reference " +
      'it; examples/* is not a Moon project.',
  },
  '@aihu/primitives': {
    side: 'vitest-only',
    reason:
      'tsc side is dist ON PURPOSE. The consumer is packages/ui, whose moon.yml declares ' +
      "dependsOn: ['primitives','css-engine'] precisely so `^:build` emits their dist + .d.ts " +
      'BEFORE ui:typecheck; ui/tsconfig.json also excludes tests/**, which is where the ' +
      'vitest-side importer (tests/shadow-adoption.test.ts) lives. vitest aliases to src so ' +
      'those tests run without a prior dist build.',
  },
  '@aihu/css-engine': {
    side: 'vitest-only',
    reason:
      'Same as @aihu/primitives — packages/ui resolves css-engine from dist by design (ui/moon.yml).',
  },
  '@aihu/css-engine/runtime/cn': {
    side: 'vitest-only',
    reason:
      'Imported by packages/ui/registry/*.aihu recipes. .aihu files are not inputs to `tsc` at ' +
      'all, and ui resolves css-engine from dist by design (ui/moon.yml), so there is no ' +
      'tsconfig side to mirror.',
  },
  '@aihu/css-engine/runtime/progressive': {
    side: 'vitest-only',
    reason:
      'Imported by packages/primitives (tooltip + popover position() shim). primitives/moon.yml ' +
      "declares dependsOn: ['css-engine'] so `^:build` emits its .d.ts before primitives:typecheck " +
      '— dist ON PURPOSE. vitest aliases to src so primitives tests need no css-engine build.',
  },
  '@aihu/magna-gqlmin': {
    side: 'vitest-only',
    reason:
      'Not a real package — an optional dep that does not exist on npm. The alias points at a ' +
      "committed empty stub (packages/magna/src/__stubs__/) so Vite does not hard-fail; magna's " +
      'codegen catches the missing export and falls back to untyped mode. Nothing for tsc to map.',
  },
  'virtual:aihu-routes': {
    side: 'vitest-only',
    reason:
      'A Vite VIRTUAL module the aihu plugin injects at build time, stubbed for tests ' +
      '(packages/app/tests/__stubs__/). Not a specifier tsc can or should resolve.',
  },
  'virtual:aihu-layouts': {
    side: 'vitest-only',
    reason: 'Vite virtual module, test stub only — same as virtual:aihu-routes.',
  },
  'virtual:aihu-components': {
    side: 'vitest-only',
    reason: 'Vite virtual module, test stub only — same as virtual:aihu-routes.',
  },
}

// ---------- JSONC / source comment stripping ----------

/**
 * Blank out `//` line comments and block comments while preserving string
 * literals (so a `//` inside a quoted path is untouched) and preserving the
 * byte length is NOT required here — only ordering within the remaining text
 * is, and comments are removed wholesale. Handles ' " and ` quotes.
 */
export function stripComments(src: string): string {
  let out = ''
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i] as string
    if (quote) {
      out += c
      if (c === '\\') {
        out += src[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out += c
      i++
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

/** Parse a tsconfig's JSONC (comments + trailing commas). */
export function parseJsonc(src: string): unknown {
  return JSON.parse(stripComments(src).replace(/,(\s*[}\]])/g, '$1'))
}

// ---------- tsconfig side ----------

export interface TsconfigEntry {
  /** tsconfig path, relative to the scan root. */
  file: string
  key: string
  /** Alias target, normalised to a root-relative POSIX path. */
  target: string
}

interface TsconfigShape {
  compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> }
}

/**
 * All `paths` entries of one tsconfig, targets normalised against the scan
 * root. Targets are resolved relative to `baseUrl` when set, else to the
 * tsconfig's own directory (TS >= 4.4 pathsBasePath behaviour). Every tsconfig
 * in this repo that sets baseUrl sets it to '.', so the two agree — the
 * fallback is written out rather than assumed.
 */
export function tsconfigEntries(root: string, file: string, src: string): TsconfigEntry[] {
  const cfg = parseJsonc(src) as TsconfigShape
  const paths = cfg.compilerOptions?.paths
  if (!paths) return []
  const base = resolve(root, dirname(file), cfg.compilerOptions?.baseUrl ?? '.')
  const out: TsconfigEntry[] = []
  for (const [key, targets] of Object.entries(paths)) {
    const first = targets[0]
    if (first === undefined) continue
    out.push({ file, key, target: relative(root, resolve(base, first)) })
  }
  return out
}

/**
 * Every tsconfig*.json under `root`, excluding build output and — importantly —
 * `scripts/fixtures/`, whose tsconfigs belong to THIS gate's own red/green
 * fixture trees and must not be read as repo state. The exclusion is on the
 * path RELATIVE to the scan root, so in fixture mode (where the root IS inside
 * scripts/fixtures) the fixture's own tsconfigs are still found.
 */
export function findTsconfigs(root: string): string[] {
  // node:fs rather than Bun's Glob so this module is importable from a vitest
  // test (vite cannot resolve the `bun` builtin specifier).
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'target', 'coverage', '.git', '.moon'])
  const out: string[] = []
  const walk = (rel: string): void => {
    let entries: ReturnType<typeof readdirSync>
    try {
      entries = readdirSync(join(root, rel), { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
        if (child === 'scripts/fixtures') continue
        walk(child)
      } else if (/^tsconfig.*\.json$/.test(entry.name)) {
        out.push(child)
      }
    }
  }
  walk('')
  return out.sort()
}

// ---------- vitest side ----------

export interface VitestAlias {
  key: string
  /** Alias target, normalised to a root-relative POSIX path. */
  target: string
  /** 0-based position in the emitted alias array — the order vite consumes. */
  index: number
}

/** The text between `alias: {` and its matching `}`. */
export function aliasBlockOf(configSrc: string): string {
  const src = stripComments(configSrc)
  const at = src.indexOf('alias: {')
  if (at === -1) return ''
  let depth = 0
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(at, i)
    }
  }
  return ''
}

/**
 * Ordered alias entries of root vitest.config.ts. Reads the SOURCE TEXT, not a
 * parsed object: property C is about the order of the array vite receives, and
 * a JS object's key enumeration is not a contract you can lean on here.
 *
 * Matches all three shapes the file uses — single-line, argument-wrapped, and
 * `.pathname` on the next line:
 *   'k': new URL('./p', import.meta.url).pathname,
 *   'k': new URL(\n  './p',\n  import.meta.url,\n).pathname,
 *   'k': new URL('./p', import.meta.url)\n  .pathname,
 */
export function vitestAliases(root: string, configSrc: string): VitestAlias[] {
  const block = aliasBlockOf(configSrc)
  const re = /'([^']+)':\s*new URL\(\s*'([^']+)'\s*,\s*import\.meta\.url\s*,?\s*\)/g
  const out: VitestAlias[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    out.push({
      key: m[1] as string,
      target: relative(root, resolve(root, m[2] as string)),
      index: out.length,
    })
  }
  return out
}

// ---------- The three properties ----------

export interface CheckInput {
  tsconfig: TsconfigEntry[]
  vitest: VitestAlias[]
  oneSided: Record<string, OneSided>
  /** Absolute scan root, used only for the target-existence check. */
  root?: string
}

/** A. Same key in both systems (or in two tsconfigs) must mean the same file. */
export function checkAgreement(input: CheckInput): string[] {
  const errors: string[] = []
  const vitestByKey = new Map(input.vitest.map((a) => [a.key, a]))

  // tsconfig <-> tsconfig
  const byKey = new Map<string, TsconfigEntry[]>()
  for (const e of input.tsconfig) {
    const list = byKey.get(e.key) ?? []
    list.push(e)
    byKey.set(e.key, list)
  }
  for (const [key, entries] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    const distinct = [...new Set(entries.map((e) => e.target))]
    if (distinct.length > 1) {
      errors.push(
        `'${key}': tsconfigs disagree with each other — ${entries
          .map((e) => `${e.file} -> ${e.target}`)
          .join(', ')}. One specifier must mean one file.`,
      )
      continue
    }
    // tsconfig <-> vitest
    const alias = vitestByKey.get(key)
    if (alias && alias.target !== distinct[0]) {
      errors.push(
        `'${key}': tsconfig maps it to '${distinct[0]}' (${entries
          .map((e) => e.file)
          .join(', ')}) but vitest.config.ts aliases it to '${alias.target}'. ` +
          `The two systems would validate different code for the same specifier.`,
      )
    }
  }
  return errors
}

/** B. Any key present in only one system must be explicitly allowlisted. */
export function checkOneSided(input: CheckInput): string[] {
  const errors: string[] = []
  const tsKeys = new Set(input.tsconfig.map((e) => e.key))
  const viKeys = new Set(input.vitest.map((a) => a.key))

  for (const key of [...viKeys].sort()) {
    if (tsKeys.has(key)) continue
    const allow = input.oneSided[key]
    if (!allow) {
      errors.push(
        `'${key}' is aliased in vitest.config.ts but mapped by NO tsconfig. Either add the ` +
          `matching \`paths\` entry to the package(s) whose typecheck needs source resolution, ` +
          `or add it to ONE_SIDED in scripts/check-alias-parity.ts with the reason it is ` +
          `deliberately vitest-only.`,
      )
    } else if (allow.side !== 'vitest-only') {
      errors.push(
        `'${key}' is allowlisted as '${allow.side}' but was found only on the vitest side — ` +
          `the allowlist entry is stale.`,
      )
    }
  }

  for (const key of [...tsKeys].sort()) {
    if (viKeys.has(key)) continue
    const allow = input.oneSided[key]
    if (!allow) {
      errors.push(
        `'${key}' is mapped by a tsconfig but has NO vitest.config.ts alias — vitest will ` +
          `resolve it through package exports to dist, silently testing a built artifact. Add ` +
          `the alias (minding subpath ORDER), or add it to ONE_SIDED in ` +
          `scripts/check-alias-parity.ts with the reason.`,
      )
    } else if (allow.side !== 'tsconfig-only') {
      errors.push(
        `'${key}' is allowlisted as '${allow.side}' but was found only on the tsconfig side — ` +
          `the allowlist entry is stale.`,
      )
    }
  }

  // A stale allowlist entry for a key that is now two-sided (or gone) is a
  // silent widening of the exemption surface. Report it so the list shrinks.
  for (const key of Object.keys(input.oneSided).sort()) {
    const inTs = tsKeys.has(key)
    const inVi = viKeys.has(key)
    if (inTs && inVi) {
      errors.push(
        `'${key}' is on the ONE_SIDED allowlist but is now mapped by BOTH systems — remove the ` +
          `allowlist entry (it is exempting nothing, and it will hide a future regression).`,
      )
    } else if (!inTs && !inVi) {
      errors.push(
        `'${key}' is on the ONE_SIDED allowlist but appears in NEITHER system — remove the ` +
          `stale entry.`,
      )
    }
  }
  return errors
}

/**
 * C. In vitest's ORDERED alias list, a subpath key must precede its own prefix.
 * `@rollup/plugin-alias` takes the FIRST match, and it matches `pattern` or
 * `pattern + '/'`, so a prefix listed first makes the subpath unreachable.
 */
export function checkOrdering(input: CheckInput): string[] {
  const errors: string[] = []
  for (const outer of input.vitest) {
    for (const inner of input.vitest) {
      if (inner.key === outer.key) continue
      if (!inner.key.startsWith(`${outer.key}/`)) continue
      if (inner.index > outer.index) {
        errors.push(
          `vitest.config.ts alias order: '${inner.key}' (position ${inner.index}) is listed AFTER ` +
            `its prefix '${outer.key}' (position ${outer.index}). @rollup/plugin-alias takes the ` +
            `FIRST match and matches "prefix + '/'", so '${inner.key}' is UNREACHABLE — it would ` +
            `resolve as '${outer.target}/${inner.key.slice(outer.key.length + 1)}'. Move it above.`,
        )
      }
    }
  }
  return errors
}

/** D. Both systems fail softly on a missing target, so prove the files exist. */
export function checkTargetsExist(input: CheckInput): string[] {
  const root = input.root
  if (!root) return []
  const errors: string[] = []
  const seen = new Set<string>()
  for (const e of input.tsconfig) {
    const id = `ts:${e.file}:${e.key}`
    if (seen.has(id)) continue
    seen.add(id)
    if (!existsSync(join(root, e.target))) {
      errors.push(
        `'${e.key}' in ${e.file} points at '${e.target}', which does not exist. tsc falls ` +
          `through to node resolution (i.e. dist) on a bad path — the mapping reads as absent.`,
      )
    }
  }
  for (const a of input.vitest) {
    if (!existsSync(join(root, a.target))) {
      errors.push(
        `'${a.key}' in vitest.config.ts points at '${a.target}', which does not exist. Vite ` +
          `defers to normal resolution on a bad alias target — the alias reads as absent.`,
      )
    }
  }
  return errors
}

export function checkAll(input: CheckInput): string[] {
  return [
    ...checkAgreement(input),
    ...checkOneSided(input),
    ...checkOrdering(input),
    ...checkTargetsExist(input),
  ]
}

// ---------- Self-test ----------

/**
 * The gate's own negative fixture, run in-process on every invocation (the
 * check-gate-wiring idiom): prove each detector CAN fire and does NOT fire on
 * the correct arrangement, BEFORE trusting any of them on the real tree. A
 * check with no demonstrated failing case is green-by-construction.
 */
export function selfTest(): void {
  const fail = (msg: string) => {
    console.error(`check:alias-parity SELF-TEST FAILED — ${msg}`)
    process.exit(1)
  }
  const green: CheckInput = {
    tsconfig: [
      { file: 'packages/a/tsconfig.json', key: '@x/b', target: 'packages/b/src/index.ts' },
      { file: 'packages/c/tsconfig.json', key: '@x/b', target: 'packages/b/src/index.ts' },
    ],
    vitest: [
      { key: '@x/b/sub', target: 'packages/b/src/sub.ts', index: 0 },
      { key: '@x/b', target: 'packages/b/src/index.ts', index: 1 },
    ],
    oneSided: { '@x/b/sub': { side: 'vitest-only', reason: 'fixture' } },
  }
  if (checkAll(green).length) fail(`correct arrangement flagged: ${checkAll(green).join(' | ')}`)

  // A: src-vs-dist split between the two systems
  const split: CheckInput = {
    ...green,
    vitest: [
      { key: '@x/b/sub', target: 'packages/b/src/sub.ts', index: 0 },
      { key: '@x/b', target: 'packages/b/dist/index.d.ts', index: 1 },
    ],
  }
  if (!checkAgreement(split).some((e) => e.includes('different code'))) {
    fail('tsc/vitest target disagreement not flagged')
  }

  // A: two tsconfigs disagreeing with each other
  const tsSplit: CheckInput = {
    ...green,
    tsconfig: [
      { file: 'packages/a/tsconfig.json', key: '@x/b', target: 'packages/b/src/index.ts' },
      { file: 'packages/c/tsconfig.json', key: '@x/b', target: 'packages/b/src/other.ts' },
    ],
  }
  if (!checkAgreement(tsSplit).some((e) => e.includes('disagree with each other'))) {
    fail('tsconfig-vs-tsconfig disagreement not flagged')
  }

  // B: a new, un-allowlisted vitest-only key
  const newVitestOnly: CheckInput = { ...green, oneSided: {} }
  if (!checkOneSided(newVitestOnly).some((e) => e.includes('mapped by NO tsconfig'))) {
    fail('new vitest-only key not flagged')
  }
  // B: a new, un-allowlisted tsconfig-only key
  const newTsOnly: CheckInput = {
    ...green,
    tsconfig: [
      ...green.tsconfig,
      { file: 'packages/a/tsconfig.json', key: '@x/d', target: 'packages/d/src/index.ts' },
    ],
  }
  if (!checkOneSided(newTsOnly).some((e) => e.includes('NO vitest.config.ts alias'))) {
    fail('new tsconfig-only key not flagged')
  }
  // B: an allowlist entry that no longer exempts anything
  const staleAllow: CheckInput = {
    ...green,
    oneSided: { ...green.oneSided, '@x/gone': { side: 'vitest-only', reason: 'fixture' } },
  }
  if (!checkOneSided(staleAllow).some((e) => e.includes('NEITHER system'))) {
    fail('stale allowlist entry not flagged')
  }

  // C: subpath listed after its prefix
  const misordered: CheckInput = {
    ...green,
    vitest: [
      { key: '@x/b', target: 'packages/b/src/index.ts', index: 0 },
      { key: '@x/b/sub', target: 'packages/b/src/sub.ts', index: 1 },
    ],
  }
  if (!checkOrdering(misordered).some((e) => e.includes('UNREACHABLE'))) {
    fail('subpath-after-prefix ordering not flagged')
  }
  // C must NOT fire on a sibling that merely shares a textual prefix without a
  // '/' boundary — '@x/b' does not match '@x/bee', and treating it as a prefix
  // would force a bogus reordering.
  const sibling: CheckInput = {
    tsconfig: [],
    vitest: [
      { key: '@x/b', target: 'packages/b/src/index.ts', index: 0 },
      { key: '@x/bee', target: 'packages/bee/src/index.ts', index: 1 },
    ],
    oneSided: {
      '@x/b': { side: 'vitest-only', reason: 'fixture' },
      '@x/bee': { side: 'vitest-only', reason: 'fixture' },
    },
  }
  if (checkOrdering(sibling).length) fail('non-subpath sibling flagged as an ordering violation')

  // Parsers: the three shapes vitest.config.ts actually uses, in order, with a
  // comment that mentions a quoted specifier (must not be read as an entry).
  const cfg = [
    'export default defineConfig({ resolve: { alias: {',
    "  // '@x/b' is mentioned here but is not an entry",
    "  '@x/b/sub': new URL('./packages/b/src/sub.ts', import.meta.url).pathname,",
    "  '@x/b': new URL(",
    "    './packages/b/src/index.ts',",
    '    import.meta.url,',
    '  ).pathname,',
    "  '@x/c': new URL('./packages/c/src/index.ts', import.meta.url)",
    '    .pathname,',
    '} } })',
  ].join('\n')
  const parsed = vitestAliases('/r', cfg)
  if (parsed.map((a) => a.key).join(',') !== '@x/b/sub,@x/b,@x/c') {
    fail(`vitestAliases parse/order wrong: got [${parsed.map((a) => a.key)}]`)
  }
  if (parsed[1]?.target !== 'packages/b/src/index.ts') {
    fail(`vitestAliases multi-line target wrong: ${parsed[1]?.target}`)
  }
  const ts = tsconfigEntries(
    '/r',
    'packages/a/tsconfig.json',
    '{ "compilerOptions": { "baseUrl": ".", "paths": { "@x/b": ["../b/src/index.ts"] } }, }',
  )
  if (ts[0]?.target !== 'packages/b/src/index.ts') {
    fail(`tsconfigEntries target wrong: ${ts[0]?.target}`)
  }
}

// ---------- CLI ----------

function main(): void {
  selfTest()

  const tsconfigFiles = findTsconfigs(ROOT)
  if (tsconfigFiles.length === 0) {
    console.error(
      `check:alias-parity: found no tsconfig*.json under ${ROOT} — refusing to pass vacuously.`,
    )
    process.exit(1)
  }
  const tsconfig: TsconfigEntry[] = []
  for (const file of tsconfigFiles) {
    tsconfig.push(...tsconfigEntries(ROOT, file, readFileSync(join(ROOT, file), 'utf8')))
  }

  const vitestConfigPath = join(ROOT, 'vitest.config.ts')
  if (!existsSync(vitestConfigPath)) {
    console.error(
      `check:alias-parity: no vitest.config.ts at ${ROOT} — refusing to pass vacuously.`,
    )
    process.exit(1)
  }
  const vitest = vitestAliases(ROOT, readFileSync(vitestConfigPath, 'utf8'))
  if (vitest.length === 0) {
    console.error(
      'check:alias-parity: parsed ZERO aliases out of vitest.config.ts — refusing to pass ' +
        'vacuously (the alias block moved, or its shape changed and the parser needs updating).',
    )
    process.exit(1)
  }

  // In fixture mode the real allowlist does not apply: every entry names a
  // real repo package, so against a fixture tree all 13 would report as stale
  // ("appears in NEITHER system") and BOTH the red and the green run would
  // fail — an indiscriminate fixture, which is the thing check:gate-wiring
  // exists to reject. Fixture trees are therefore self-contained and fully
  // two-sided; they exercise agreement/ordering/existence, and the allowlist
  // logic is covered by selfTest() above, which runs in fixture mode too.
  const oneSided = process.env.ALIAS_PARITY_ROOT ? {} : ONE_SIDED
  const input: CheckInput = { tsconfig, vitest, oneSided, root: ROOT }
  const errors = checkAll(input)

  const tsKeys = new Set(tsconfig.map((e) => e.key))
  const viKeys = new Set(vitest.map((a) => a.key))
  const both = [...tsKeys].filter((k) => viKeys.has(k)).length

  console.log('\n  tsc <-> vitest alias parity check')
  console.log(
    `  ${tsconfigFiles.length} tsconfig*.json scanned (${tsKeys.size} distinct \`paths\` key(s)), ` +
      `${vitest.length} vitest alias(es); ${both} key(s) mapped by BOTH.`,
  )
  console.log(
    `  ${Object.keys(oneSided).length} key(s) deliberately one-sided (allowlisted in this script).\n`,
  )

  for (const e of errors) console.error(`  ERROR: ${e}`)

  if (errors.length > 0) {
    console.error(
      '\n  Alias parity violation. `tsc` (per-package tsconfig `paths`, defaulting to dist) and ' +
        '`vitest` (one global src alias map) must not disagree about what a specifier means — ' +
        'a disagreement means one of them is validating different code, silently.\n' +
        '  See the header comment in scripts/check-alias-parity.ts.\n',
    )
    process.exit(1)
  }

  console.log('  OK — the two alias systems agree, and every subpath alias precedes its prefix.\n')
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] as string) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  try {
    main()
  } catch (err) {
    console.error(`  FATAL: ${(err as Error).message}`)
    process.exit(2)
  }
}
