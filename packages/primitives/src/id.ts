/**
 * `@aihu/primitives` id-generation substrate (LDF §10 step 5 / Q3) — the one
 * place a fallback element id gets minted when a consumer doesn't supply
 * one (`<aihu-label>` with no `for`, `<aihu-form-control>` with no `id`,
 * tooltip/dialog content panels needing an `aria-describedby`/`aria-labelledby`
 * target). Four pieces (`label/`, `form-control/`, `tooltip/`, `dialog/`)
 * each hand-rolled an identical `let _counter = 0; \`prefix-${++counter}\``
 * — this consolidates them into one core.
 *
 * In-package only (Q3, resolved): no third-party consumer needs the raw
 * counter directly today, so this is NOT re-exported from `index.ts` or
 * given a `package.json` export entry, matching `composed-tree.ts`'s
 * existing internal-module precedent rather than adding a new micro-package.
 *
 * This is a de-duplication of the mechanism, not a behavior change to the
 * emitted ids: each call site's numbering is preserved exactly as it was —
 * `label`/`form-control`/`tooltip` each get their OWN independent sequence
 * ([[createIdSequence]]); `dialog` shares ONE counter across its three
 * prefixes (`dialog`/`dialog-title`/`dialog-desc`, via [[createCounter]]
 * directly), matching its pre-existing interleaved numbering.
 */

/** A fresh counter starting at 0 — `next()` returns 1, 2, 3, … */
export function createCounter(): () => number {
  let n = 0
  return () => {
    n += 1
    return n
  }
}

/** A fresh, independent id sequence for one `prefix` — `next()` returns
 * `${prefix}-1`, `${prefix}-2`, … Each call site should create ONE sequence
 * at module scope and call `next()` per fallback id needed, exactly like the
 * hand-rolled counters this replaces. */
export function createIdSequence(prefix: string): () => string {
  const next = createCounter()
  return () => `${prefix}-${next()}`
}
