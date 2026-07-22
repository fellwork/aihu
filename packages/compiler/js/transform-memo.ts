/**
 * transform-memo.ts — content-addressed memo cache for `aihu-compile` spawns.
 *
 * Every `.aihu` compile is a subprocess spawn (~6ms each, ~63% pure spawn
 * overhead), and the SSG prerender pass re-compiles every file a SECOND time:
 * `prerenderClose` (packages/app/src/prerender.ts) boots a second Vite server
 * that REUSES the already-resolved plugin instances and re-runs the same
 * transforms via `ssrLoadModule` — identical source, identical flags,
 * byte-identical output recompiled. css-engine's `compileSfc` additionally
 * re-spawns the compiler per file for its AST pass (`compileToAst`).
 *
 * This module memoises the RAW STDOUT of a spawn, keyed by a SHA-256 digest of
 * everything that determines that stdout:
 *
 *   kind (transform | ast | route) + file id + options fingerprint
 *     + binary identity (path + mtime + size) + source content
 *
 * Because the key is content-addressed, watch-mode correctness is free: an
 * edit changes the source hash, so a stale entry is simply never looked up
 * again. The binary stamp (mtime+size) additionally invalidates entries when
 * the compiler binary itself is rebuilt mid-session (dev-workspace cargo
 * rebuilds); the stat is ~µs against a ~6ms spawn.
 *
 * Growth is bounded by FIFO eviction at `MAX_ENTRIES` — inert stale entries
 * from long dev sessions age out. Deliberately NOT cleared on Vite
 * `buildStart`: the SSG prerender's second server fires its own start-of-run
 * hooks, and a clear there would defeat the exact pass-two hits this cache
 * exists for.
 *
 * All exports are `_`-prefixed internals of `@aihu/compiler`; consumers go
 * through `transform()` / `compileToAst()` / `compileRouteMeta()`.
 */
import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'

/**
 * FIFO size bound. 1024 entries × a few KB of compiled output ≈ a few MB —
 * comfortably above any real app's file count (one entry per file × kind ×
 * options variant) while keeping unbounded-session growth impossible.
 * @internal
 */
export const _MEMO_MAX_ENTRIES = 1024

const cache = new Map<string, string>()
let hits = 0
let misses = 0
let seeds = 0

/**
 * Identity stamp for the compiler binary: path + mtime + size when statable,
 * path alone otherwise (e.g. tests pointing SCRIBE_COMPILE_BIN at a fake).
 * A rebuilt-in-place binary changes mtime/size → old entries become inert.
 * @internal
 */
function _binStamp(binPath: string): string {
  try {
    const st = statSync(binPath)
    return `${binPath}:${st.mtimeMs}:${st.size}`
  } catch {
    return binPath
  }
}

/** @internal */
export function _memoKey(
  kind: string,
  source: string,
  id: string,
  optionsFingerprint: string,
  binPath: string,
): string {
  return createHash('sha256')
    .update(kind)
    .update('\0')
    .update(id)
    .update('\0')
    .update(optionsFingerprint)
    .update('\0')
    .update(_binStamp(binPath))
    .update('\0')
    .update(source)
    .digest('hex')
}

/**
 * Memoised spawn: returns the cached stdout for an identical
 * (kind, source, id, options, binary) tuple, otherwise runs `spawn()` and
 * caches its result. The cached value is the raw stdout STRING — callers that
 * return structured data (`compileToAst`, `compileRouteMeta`) re-parse per
 * call so a mutated result object can never poison the cache.
 * @internal
 */
export function _memoizedSpawn(
  kind: string,
  source: string,
  id: string,
  optionsFingerprint: string,
  binPath: string,
  spawn: () => string,
): string {
  const key = _memoKey(kind, source, id, optionsFingerprint, binPath)
  const hit = cache.get(key)
  if (hit !== undefined) {
    hits++
    return hit
  }
  const out = spawn()
  misses++
  if (cache.size >= _MEMO_MAX_ENTRIES) {
    // FIFO: Map preserves insertion order; drop the oldest entry.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, out)
  return out
}

/**
 * Seed a memo entry WITHOUT a spawn — the envelope path's sibling-artifact
 * write. One envelope compile of a file yields js + ast + route from a single
 * parse; the js answers the current call, and the ast/route strings are
 * seeded here under the exact keys `compileToAst` / `compileRouteMeta` will
 * look up, so their later calls for the same source are pure cache hits.
 * Never overwrites an existing entry; counts in the `seeds` stat, not
 * hits/misses.
 * @internal
 */
export function _seedMemo(
  kind: string,
  source: string,
  id: string,
  optionsFingerprint: string,
  binPath: string,
  value: string,
): void {
  const key = _memoKey(kind, source, id, optionsFingerprint, binPath)
  if (cache.has(key)) return
  if (cache.size >= _MEMO_MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
  seeds++
}

/** Test/diagnostic hook — wipe the memo and its counters. @internal */
export function _clearTransformMemo(): void {
  cache.clear()
  hits = 0
  misses = 0
  seeds = 0
}

/** Test/diagnostic hook — current memo size + hit/miss/seed counters. @internal */
export function _transformMemoStats(): {
  size: number
  hits: number
  misses: number
  seeds: number
} {
  return { size: cache.size, hits, misses, seeds }
}
