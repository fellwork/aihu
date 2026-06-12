---
"@aihu/compiler": patch
---

Fix the June 2026 fellwork-web bug-ledger family — five compiler bugs around
reactive lowering and template-expression handling:

- **Getter-call interpolations are now reactive (FEL-228).** `{selBookLabel()}`
  as a sole text child lowered to an eager `leaf(expr)` — a static text node
  evaluated once that never re-rendered on signal change. It now lowers to the
  reactive thunk-leaf shape `leaf([() => (expr), () => {}])`. Loop-var
  projections (`{item.title}`) and plain consts stay eager (no per-row effect).
- **Structural directives on macro elements emit their helper definitions
  (FEL-230).** `<$link $each="…">` emitted the `createEachBoundary(...)` call
  site without its inlined definition → `ReferenceError` at mount (blank page).
  The helper collector now scans macro-element attributes the same way it scans
  plain elements.
- **Multiple effect directives on one element compose (FEL-238).** An element
  carrying `$each` plus a second effect directive (`$show` / `$class:` / `$if` /
  `$html` / `$ref`) silently dropped all but the first — `$each` was always the
  one dropped, so the element rendered exactly once with its loop alias
  dangling and descendant `$on` handlers captured an undefined loop variable.
  Directives now nest into a single wrapper with `$each` outermost.
- **Bare getter reads in template expressions are rewritten to calls
  (FEL-172, FEL-173).** Props and signals compile to getter functions, but
  `$if` / `$each` / `$on.*` / attr-binding / complex-interpolation expressions
  were emitted verbatim into thunks: `$if={section.kind === 'prose'}` read
  `.kind` off the signal function → always `undefined` → the branch silently
  never rendered. A conservative token-based rewrite now turns bare reads of
  registered getters into calls across all template expression contexts
  (member accesses, existing calls, object keys/shorthand, string literals,
  and arrow-param shadows are skipped — existing `section().data` workarounds
  keep compiling, un-double-called). Interpolations are rewritten before the
  has-call check, so `{count + 1}` now takes the reactive thunk-leaf path.
- **The cross-block checker no longer flags `$each` loop aliases (FEL-184).**
  `$each="chaptersOf(b) as c"` produced `warning: '@template' references 'c'
  which is not declared in '@state'` for every aliased interpolation — and the
  planned v0.4 promotion of that warning to a hard error would have broken
  valid builds. Aliases from both the attribute and `{#each}` block forms are
  now registered before validating; genuinely undeclared refs still warn.
