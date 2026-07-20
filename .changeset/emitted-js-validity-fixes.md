---
'@aihu/compiler': patch
---

Five codegen bugs that emitted invalid JavaScript.

Found by syntax-checking every component in `cookbook/` and `examples/` with
esbuild — 5 of 32 did not parse. No test caught any of them: the compiler
reported success, and the failure surfaced later in the bundler or not at all.

- **Async `$action` handlers.** `handler: async () => …` lowered to
  `function name(async ()) { … }`. `arrow_args` saw a leading `a` rather than
  `(`, took the single-identifier branch, and returned everything before `=>`.
  Async handlers now lower to `async function name(args) { … }` and are no
  longer wrapped in `batch` — `batch` takes a plain arrow (so `await` in the
  body was a syntax error), and it flushes synchronously, so it would have
  covered only the prefix before the first `await` while looking atomic.

- **Block-bodied `$computed` / `$resource`.** `arrow_body` strips the braces
  off a block body, which `$action` relies on because it re-wraps in its own
  `{ … }` — but `$computed` and `$resource` splice straight into `() => <expr>`,
  yielding `computed(() => if (x) return y)`. Added `arrow_body_spliceable`,
  which re-wraps block bodies and leaves expression bodies (including object
  literals like `({ a: 1 })`) alone.

- **Async propagation.** `$computed`, `$resource`, `$effect`, and `$lifecycle`
  dropped the `async` keyword, so any awaiting body became a syntax error.
  Async `$effect` tracks dependencies only up to the first `await` — a real
  caveat, but the author's to make; emitting a non-async arrow around an
  awaiting body is simply broken.

- **`$form` leaked into the component body.** It was the one `CollectionKind`
  missing from the plain-body skip list, so its entries reached the
  `name: type` declaration scanner and `value: () => value,` was rewritten to
  `let value: () => value,`, leaving a dangling `}`.

- **Destructured `$each` aliases tore.** `as [name, desc]` split on the first
  comma — the one inside the pattern — producing `([name) => name`. The split
  was duplicated in three places; the `emit.rs` copy was the one the
  `$each="…"` attribute form actually reaches. A depth-aware
  `split_each_alias` now backs all three. This also removes the need for the
  `rejoin_alias_list` workaround downstream, whose comment already documented
  the tearing as expected behavior.

All 32 cookbook and example components now emit parseable JavaScript, covered
by five regression tests.
