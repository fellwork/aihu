/**
 * criticalPath — a build-time budget + denylist for what a client entry
 * statically pulls in.
 *
 * WHY THIS EXISTS. Twice now a change has silently moved megabytes into the
 * critical path of every page, and in both cases nothing failed: the build was
 * green, the tests passed, and the regression only surfaced later as a
 * Lighthouse score, which then took real work to trace back to a cause.
 *
 *   - `typescript` (3.4 MB) reached the entry even though `strip-ts` was ONLY
 *     ever dynamically imported. The mechanism was invisible from the source:
 *     `typescript` is CJS, so its chunk hosted rolldown's interop helpers, and
 *     the entry — needing those same helpers — statically imported the chunk
 *     that hosted them, dragging the compiler with it.
 *   - Six island components reached the entry because the app registered them
 *     with `import './components/x.aihu'` side-effect lines, defeating the
 *     router's per-route lazy registry.
 *
 * Both are the same class of bug: a module that is *supposed* to be lazy
 * becomes statically reachable from an entry, and nothing says so.
 *
 * WHAT "CRITICAL PATH" MEANS HERE — and why the obvious check is wrong.
 * Inspecting the entry chunk's own module list is NOT sufficient, and would
 * have missed the `typescript` case entirely: that module lived in its own
 * separate chunk. What made it critical was that the entry chunk *statically
 * imported* that chunk. So the set this plugin guards is the transitive
 * closure of the entry chunks over STATIC imports only (`chunk.imports`),
 * deliberately not following `chunk.dynamicImports` — a dynamic import is
 * exactly the thing we want people to be able to use freely.
 *
 * That set is precisely "what the browser must download and evaluate before
 * the entry can run", which is the thing worth budgeting.
 *
 * @example
 * ```ts
 * criticalPath({
 *   maxBytes: 40_000, // gzipped
 *   deny: [
 *     { pattern: /node_modules[\\/]typescript[\\/]/,
 *       reason: 'the 3.4 MB TS compiler must stay behind a dynamic import' },
 *   ],
 * })
 * ```
 */
import { gzipSync } from 'node:zlib'
import type { Plugin } from 'vite'

/** A module pattern that must never become statically reachable from an entry. */
export interface CriticalPathRule {
  /** Tested against the module id (absolute path, posix-normalized). */
  pattern: RegExp
  /**
   * Printed on violation. Say WHY it must stay out and what to do instead —
   * this message is the whole value of the rule when it fires months later.
   */
  reason: string
}

export interface CriticalPathOptions {
  /** Modules forbidden in the critical path. */
  readonly deny?: readonly CriticalPathRule[]
  /**
   * Max gzipped size of the critical path (all statically-entry-reachable
   * chunks combined). Gzip, not raw, because that is what crosses the wire —
   * and it matches `scripts/size.ts`'s existing convention.
   */
  readonly maxBytes?: number
  /** Report without failing the build. Default `false`. */
  readonly warnOnly?: boolean
}

/** Format bytes the same way `scripts/size.ts` does, for consistent reading. */
function fmt(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(2)} kB`
}

export function criticalPath(opts: CriticalPathOptions = {}): Plugin {
  const deny = opts.deny ?? []
  const warnOnly = opts.warnOnly ?? false

  return {
    name: 'aihu:critical-path',
    apply: 'build',
    generateBundle(_outputOptions, bundle) {
      // The SSR/prerender pass has no browser critical path to speak of —
      // budgeting it would fail for reasons that do not affect a user.
      if (this.environment?.name === 'ssr') return

      type Chunk = Extract<(typeof bundle)[string], { type: 'chunk' }>
      const chunks = new Map<string, Chunk>()
      for (const [file, out] of Object.entries(bundle)) {
        if (out.type === 'chunk') chunks.set(file, out as Chunk)
      }

      // Transitive closure over STATIC imports from every entry chunk.
      // `chunk.dynamicImports` is deliberately not followed: deferring work
      // behind a dynamic import is the outcome this plugin exists to protect.
      const critical = new Set<string>()
      const queue = [...chunks.values()].filter((c) => c.isEntry).map((c) => c.fileName)
      while (queue.length > 0) {
        const file = queue.pop() as string
        if (critical.has(file)) continue
        critical.add(file)
        for (const imported of chunks.get(file)?.imports ?? []) {
          if (chunks.has(imported)) queue.push(imported)
        }
      }
      if (critical.size === 0) return

      // ── denylist ───────────────────────────────────────────────────────
      const violations: { rule: CriticalPathRule; id: string; via: string }[] = []
      for (const file of critical) {
        for (const id of Object.keys(chunks.get(file)?.modules ?? {})) {
          const norm = id.replace(/\\/g, '/')
          for (const rule of deny) {
            if (rule.pattern.test(norm)) violations.push({ rule, id: norm, via: file })
          }
        }
      }

      // ── budget ─────────────────────────────────────────────────────────
      let gzipped = 0
      let raw = 0
      for (const file of critical) {
        const code = chunks.get(file)?.code ?? ''
        raw += Buffer.byteLength(code)
        gzipped += gzipSync(code).length
      }
      const overBudget = opts.maxBytes !== undefined && gzipped > opts.maxBytes

      if (violations.length === 0 && !overBudget) return

      const lines: string[] = [
        `critical path: ${critical.size} chunk(s), ${fmt(gzipped)} gzipped (${fmt(raw)} raw)`,
      ]
      if (overBudget) {
        lines.push(`  ✗ over budget: ${fmt(gzipped)} gzipped > ${fmt(opts.maxBytes as number)}`)
      }
      for (const v of violations) {
        // Trace back to an importer so the message says HOW it got in — the
        // part that took longest to work out by hand both times this bit.
        const info = this.getModuleInfo(v.id)
        const importer = info?.importers?.[0]
        lines.push(
          `  ✗ ${v.id}`,
          `      in chunk: ${v.via}`,
          ...(importer ? [`      imported by: ${importer.replace(/\\/g, '/')}`] : []),
          `      ${v.rule.reason}`,
        )
      }
      lines.push(
        '',
        '  A module is in the critical path when it is reachable from an entry',
        '  through STATIC imports only. Moving the offending import behind a',
        '  dynamic `import()` removes it from this set.',
      )
      const msg = lines.join('\n')
      if (warnOnly) this.warn(msg)
      else this.error(msg)
    },
  }
}
