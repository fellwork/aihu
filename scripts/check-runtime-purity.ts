#!/usr/bin/env bun
/**
 * CI guard — runtime portability purity (Bug-4 client-leak regression).
 *
 * Asserts that the runtime-agnostic / browser / edge build entries contain NO
 * `node:` builtin imports (`node:module`, `createRequire`, `node:fs`, …). Such
 * a static import does not tree-shake, so a consumer bundling these entries for
 * the browser (transitively via @aihu/app) hits a `TypeError` on bootstrap —
 * the exact regression that broke @aihu/app@0.1.8 when the Bug 4 fix put
 * `platform:'node'` on @aihu/server's main entry. See investigation
 * 4a796a8f-0f2b-4865-a498-73cf11b6f04c.
 *
 * The ONLY allowed `node:`-referencing build artifact is @aihu/server's
 * dist/native.js (the explicit `@aihu/server/native` Node-native boundary,
 * built with platform:'node' so its createRequire survives a downstream
 * re-bundle).
 *
 * The mirror-image boundary is @aihu/app's dist/node-module-stub.js: the file
 * substituted FOR that builtin in a Worker bundle. It has to declare the
 * builtin's export names, so it is checked under its own `builtin-stub` tier
 * (no quoted `node:` specifier of any kind) rather than by carving the
 * createRequire token out of some other entry's scan. Both are declared
 * artifacts with a stated contract; neither is an exception.
 *
 * Exit codes:
 *   0  all checked entries are node:-builtin-free
 *   1  one or more entries leak a node: builtin (or a checked file is missing)
 *   2  unexpected error
 *
 * Run locally:   bun run check:runtime-purity   (after `bun run build`)
 * Wired into:    .github/workflows/plan-a.yml `check` job + package.json check:ci
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The leak vector. `node:module` + the `createRequire` symbol are the specific
 * tokens behind the @aihu/app@0.1.8 client-leak regression: a static
 * `import { createRequire } from "node:module"` does not tree-shake, so it
 * breaks any browser bootstrap. These are forbidden on EVERY checked entry —
 * including build-time-only Node entries, which still must never carry the
 * createRequire shim (that is what the dedicated @aihu/server/native boundary
 * exists for).
 */
// A real node: import specifier is ALWAYS quoted (`import … from "node:module"`,
// `require('node:fs')`, `import("node:os")`). The leading-quote lookbehind
// excludes object-property false positives: minified SSR code emits
// `{node:n(),path:…}` (the structural-walk `{ node, path }` segment), which the
// bare `/node:[a-z/]+/` regex wrongly flagged as a `node:` builtin. A bundled
// import can never be unquoted, so requiring the quote loses no real leak.
const LEAK_VECTOR: ReadonlyArray<RegExp> = [/(?<=["'`])node:module/g, /\bcreateRequire\b/g]

/** Any quoted node: builtin specifier (node:module, node:fs, node:path, …). */
const ANY_NODE_BUILTIN: RegExp = /(?<=["'`])node:[a-z/]+/g

interface Entry {
  readonly file: string
  /**
   * 'browser-edge' — true runtime-agnostic / browser / edge entry: NO node:
   *   builtin of any kind is allowed (must run in browser, Cloudflare/Vercel
   *   edge, Deno).
   * 'build-time-node' — Node-only build/config-time entry (e.g. the @aihu/app
   *   Vite plugin): general node: builtins (node:fs, node:path) are legitimate,
   *   but the createRequire / node:module leak vector is STILL forbidden so the
   *   regression class can never reappear here either.
   * 'builtin-stub' — a declared REPLACEMENT for a node: builtin, bundled into
   *   an edge/Worker output in that builtin's place. Its whole job is to
   *   declare the builtin's export names, so the createRequire identifier is
   *   permitted here and ONLY here; every quoted node: specifier is forbidden,
   *   which is the strictness that actually matters for a file destined for
   *   workerd. Same species of narrow, named boundary as
   *   packages/server/dist/native.js — an artifact with a stated contract, not
   *   an exception carved into another entry's scan.
   */
  readonly tier: 'browser-edge' | 'build-time-node' | 'builtin-stub'
}

/**
 * Entries checked by this guard. The native boundary
 * (packages/server/dist/native.js) is intentionally NOT listed — it is the one
 * artifact allowed to carry node:module by design.
 */
const CHECKED_ENTRIES: ReadonlyArray<Entry> = [
  // Server main is importable from the edge (json/notFound/router are used by
  // adapter-cloudflare/-vercel) and from Deno — fully node:-free.
  { file: 'packages/server/dist/index.js', tier: 'browser-edge' },
  // App client is the browser bootstrap (createApp) — fully node:-free.
  { file: 'packages/app/dist/client.js', tier: 'browser-edge' },
  // App main is the Vite plugin (runs in the Vite/Node config context). node:fs
  // / node:path are legitimate here; only the createRequire leak vector is
  // forbidden.
  { file: 'packages/app/dist/index.js', tier: 'build-time-node' },
  // The `output: 'ssr'` document assembler. Bundled into the consumer's Worker
  // by the ssr environment, so it must be as node:-free as the browser entry —
  // it shares `head-apply.ts` with `dist/client.js` and adds only the outlet
  // splice and a Response rewrap.
  { file: 'packages/app/dist/ssr-document.js', tier: 'browser-edge' },
  // The `node:module` stub @aihu/app's SSR plugin substitutes for the builtin
  // in the Worker bundle. It must DECLARE `createRequire` (the built
  // native.js imports that binding by name), so the leak vector cannot apply;
  // it is scanned instead for any quoted node: specifier, which is the
  // property a file bundled into workerd has to hold.
  { file: 'packages/app/dist/node-module-stub.js', tier: 'builtin-stub' },
]

/**
 * What each tier is scanned FOR. A total record rather than a ternary so a new
 * tier is a compile error here instead of silently inheriting whichever branch
 * happened to be the `else`.
 *
 * 'builtin-stub' shares 'browser-edge''s pattern set but not its rationale: the
 * stub is ALLOWED the createRequire identifier — declaring it is the entire
 * point of the artifact — and forbidden every quoted node: specifier, which is
 * the property a file bundled into workerd actually has to hold.
 */
const PATTERNS_BY_TIER: Readonly<Record<Entry['tier'], ReadonlyArray<RegExp>>> = {
  'browser-edge': [ANY_NODE_BUILTIN],
  'build-time-node': LEAK_VECTOR,
  'builtin-stub': [ANY_NODE_BUILTIN],
}

/** Human-readable statement of what a PASS on each tier actually asserts. */
const SCOPE_BY_TIER: Readonly<Record<Entry['tier'], string>> = {
  'browser-edge': 'no node: builtins',
  'build-time-node': 'no createRequire/node:module leak',
  'builtin-stub': 'no node: builtins (declared builtin replacement)',
}

type ScanResult =
  | { file: string; ok: true; tier: Entry['tier'] }
  | { file: string; ok: false; tokens: ReadonlyArray<string>; tier: Entry['tier'] }
  | { file: string; missing: true }

function scan(entry: Entry): ScanResult {
  const abs = join(ROOT, entry.file)
  if (!existsSync(abs)) {
    return { file: entry.file, missing: true }
  }
  const src = readFileSync(abs, 'utf8')
  const patterns = PATTERNS_BY_TIER[entry.tier]
  const hits = new Set<string>()
  for (const re of patterns) {
    for (const m of src.matchAll(re)) hits.add(m[0])
  }
  if (hits.size === 0) return { file: entry.file, ok: true, tier: entry.tier }
  return { file: entry.file, ok: false, tokens: [...hits].sort(), tier: entry.tier }
}

function main(): void {
  const offences: Array<{ file: string; tokens: ReadonlyArray<string>; tier: Entry['tier'] }> = []
  const missing: string[] = []

  for (const entry of CHECKED_ENTRIES) {
    const result = scan(entry)
    if ('missing' in result) {
      missing.push(result.file)
      // eslint-disable-next-line no-console
      console.error(`MISSING ${result.file} — build first (bun run build)`)
      continue
    }
    if (result.ok) {
      const scope = SCOPE_BY_TIER[result.tier]
      // eslint-disable-next-line no-console
      console.log(`PURE   ${result.file} [${result.tier}] — ${scope}`)
      continue
    }
    offences.push({ file: result.file, tokens: result.tokens, tier: result.tier })
    // eslint-disable-next-line no-console
    console.error(
      `LEAK   ${result.file} [${result.tier}] — forbidden tokens: ${result.tokens.join(', ')}`,
    )
  }

  if (offences.length > 0 || missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `\nruntime-purity check FAILED.\n` +
        (offences.length > 0
          ? `  ${offences.length} entr${offences.length === 1 ? 'y' : 'ies'} leak a forbidden token into a runtime/browser/edge bundle.\n` +
            `  browser-edge and builtin-stub entries must be fully node:-free; build-time-node\n` +
            `  entries must be free of the createRequire / node:module leak vector. The only\n` +
            `  artifact allowed to carry node:module is packages/server/dist/native.js (the\n` +
            `  @aihu/server/native boundary); the only one allowed to declare createRequire is\n` +
            `  packages/app/dist/node-module-stub.js (the Worker-bundle builtin replacement).\n` +
            `  See investigation 4a796a8f-0f2b-4865-a498-73cf11b6f04c.\n`
          : '') +
        (missing.length > 0
          ? `  ${missing.length} checked entr(y/ies) not built — run \`bun run build\`.\n`
          : ''),
    )
    process.exit(1)
  }

  // eslint-disable-next-line no-console
  console.log(
    `\nruntime-purity PASS — ${CHECKED_ENTRIES.length} runtime/browser/edge entries clean ` +
      `(browser-edge + builtin-stub: node:-free; build-time-node: createRequire/node:module-free).`,
  )
}

try {
  main()
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('check-runtime-purity: unexpected error', err)
  process.exit(2)
}
