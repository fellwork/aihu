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
   */
  readonly tier: 'browser-edge' | 'build-time-node'
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
]

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
  const patterns = entry.tier === 'browser-edge' ? [ANY_NODE_BUILTIN] : LEAK_VECTOR
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
      const scope =
        result.tier === 'browser-edge' ? 'no node: builtins' : 'no createRequire/node:module leak'
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
            `  browser-edge entries must be fully node:-free; ALL entries must be free of the\n` +
            `  createRequire / node:module leak vector. The only artifact allowed to carry\n` +
            `  node:module is packages/server/dist/native.js (the @aihu/server/native boundary).\n` +
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
      `(browser-edge: node:-free; build-time-node: createRequire/node:module-free).`,
  )
}

try {
  main()
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('check-runtime-purity: unexpected error', err)
  process.exit(2)
}
