# SSR child rendering — review follow-ups

Status: **open.** Tracks what four review passes (architecture, adversarial,
security, performance) found against `feat/child-registry` and the SSR child
work did NOT fix. The fixes that WERE made are recorded in
`2026-08-05-ssr-child-components.md`.

Nine of roughly twenty-nine findings were fixed in that branch — the set that
makes the SSG path correct. This is the remainder, ordered by what should be
done first rather than by which pass found it.

---

## P0 — a regression this work introduced

### 1. An ordinary recursive component is now a hard build failure

`packages/compiler/js/index.ts` derives `__aihu_child_tags__` by regexing
`__aihu_schild('…'` out of emitted code, so it lists every reference site
regardless of whether that reference can ever recurse at runtime. A tree, a
nested menu, a comment thread — `<group if={kids.length}><tree-node>` — reports
`tree-node` as a self-edge, `buildChildRegistry` throws `ChildCycleError`, and
`app/src/vite-plugin.ts` turns it into `this.error()`. **Non-overridable, and
the message is wrong for the case** ("A component cannot render itself, directly
or transitively" — on the client it can, and routinely does).

The guard's original justification was that a cycle would "quietly emit 32
nested copies and ship it". That is no longer true: `__aihu_schild` now has both
a depth cap and a byte budget, and reports loudly when either bites. The
justification for failing the build died with the fix that made cycles safe.

**Do:** downgrade the cycle from a throw to a warning. Runtime guards bound the
damage; a build that refuses legal, common component shapes is worse than a
build that warns about a shape it renders finitely. Keep the detection — the
warning is genuinely useful — and keep naming the loop.

The regex derivation also **under**-approximates: any reference the emitter
declines (§3 below) contributes no edge, so a real cycle through an
`if=`-guarded reference is not detected at all. Downgrading to a warning makes
both directions tolerable; deriving the tag set in Rust from the same decision
the emitter makes would make it accurate.

---

## P1 — silent empty renders

Each of these makes a child render as an empty element with no diagnostic — the
failure mode this whole plan exists to eliminate, reintroduced at the edges.

### 2. The Workers / live-SSR path passes no registry at all

`packages/router/src/server.ts` (both call sites) forwards `lightScopeId` but
never `children`, and `buildChildRegistry`'s only caller is the SSG prerender.
Every request-time SSR consumer — `adapter-cloudflare`, `adapter-vercel`, and
fellwork.com — still ships empty children. Step 5's second half; needs a
generated tag→module manifest. Note "load ALL" is the wrong trade there: a
Worker would bundle every component's server artifact, so the transitive
`__aihu_child_tags__` walk earns its keep in that path even though SSG does not
need it.

### 3. No unresolved-tag diagnostic

`discoverComponents` scans exactly one directory (`dir.components`). A component
colocated with pages, imported from a package, or keyed by `@meta { name }`
rather than its file stem (the client's `scanComponents` keys on the former, the
registry on the latter) never enters the registry and fails closed in silence.

**Do:** after prerender, diff the union of rendered modules' `__aihu_child_tags__`
against the registry keys and warn per missing tag. Uses an export that already
exists; turns "why is my footer empty" into a build-log line.

### 4. Registry entries that can never render are accepted silently

`buildChildRegistry` takes modules lacking `__ssrString` (emitter bail) or
`__aihu_shadow__`; `__aihu_schild` then fails closed on them at render time.
Warn once at registry-build instead.

### 5. A component with no `__aihu_tag__` is skipped without a word

`prerender.ts`'s discovery loop `continue`s, unlike the sibling load-failure
branch that warns.

---

## P2 — correctness the reviews proved but this branch did not fix

### 6. Six more emitter/walker boundary divergences

The emitter gates on the raw template AST; the walker on the lowered arbor node,
so the eligible sets differ. `{#each}` is fixed; still divergent:

- a lone `if=` / `show=` / `class:` / `ref=` / `once` / `raw` — an `Attr::Macro`
  makes `attrs.is_empty()` false for the emitter, while `emit_attrs` filters
  macros out so the walker sees zero attrs (a full `if`/`else` CHAIN matches,
  because the parser folds it into an `IfBlock` — so the two spellings behave
  differently)
- a whitespace-only body (`<x-kid>\n</x-kid>`) — dropped for the walker, not for
  the emitter
- `html={…}` on a reference — the two renderers emit two DIFFERENT non-empty
  trees, which is worse than an empty/full split

**Do:** a differential fixture per boundary line, each asserting the two paths
agree on DECLINING. That is the enforceable form of "the lists mirror exactly";
prose in a comment is not.

### 7a. The compiler and the router derive DIFFERENT tags — REFRAMED

Reported as "`@meta { name }` tags never resolve in the registry". Probed, and
the framing was wrong in a way that matters. For `@meta { name: "custom-thing" }`
in `x-plain.aihu`:

| source | tag |
|---|---|
| compiler `__aihu_tag__` | `x-plain` |
| router `readAihuComponentTag` | `custom-thing` |

`__aihu_tag__` is read off the emitted `defineElement('…')` call, so it is what
the browser ACTUALLY registers. The SSR registry keys on it and therefore agrees
with the runtime. The ROUTER's scan is the one that disagrees — it re-derives a
name from source with a `@meta` → `@route` → stem precedence the compiler does
not apply to `defineElement`.

So this is a **pre-existing compiler/router inconsistency**, not a registry bug,
and it is worse than an SSR miss: a component declaring `@meta { name }`
registers under its file stem, so `<custom-thing>` never upgrades on the client
either. Whoever fixes it has to decide which side is authoritative — the
compiler honouring `@meta { name }` in `defineElement`, or the router dropping
its own derivation — and that decision does not belong inside this SSR work.

Until then the SSR registry is correct to key on `__aihu_tag__`: matching the
router's map would make prerendered markup register under a tag nothing
actually defines. The new unresolved-tag diagnostic (§3, landed) now reports the
mismatch at build time instead of leaving it silent.

### 7b. Tag-collision tie-breaks disagree

`child-registry.ts` keeps the FIRST (over `files.sort()`);
`router/src/vite-plugin.ts` keeps the LAST (over raw `readdirSync` order). The
page ships one module's markup and the client upgrades with the other's — a
guaranteed content swap on hydrate. Both warn, about different winners.

### 8. `__aihu_schild` pins children to the string renderer

It calls `mod.__ssrString` directly rather than through `_ssrStringOf`, so
`AIHU_SSR_STRING=0` no longer disables the string path for child subtrees. Good
for speed; a hole in the escape hatch, and it means the differential suite can
never exercise a walker-rendered child at app scale.

### 9. An async/thenable `__ssrString` is unguarded

Emits `[object Promise]` into the page.

---

## P3 — pre-existing, amplified by this work

### 10. `_injectShadowMode`'s greedy regex corrupts `if=` conditions — CONFIRMED, FIXED

**Status: the finding is REAL, reproduced, and fixed — and the first
balanced-paren replacement was ALSO broken, in the opposite direction.**

Reproduction (raw server-target emit of `<span if={n > 5}>` under the old
regex, `AIHU_COMPILER_NATIVE=0`, freshly built binary):

```js
if ((n() > 5), { shadowMode: 'light', lightScopeId: '…' }) {
```

The earlier NOT-REPRODUCED verdict was a detection error, not an absence of
corruption: the probe regex `/if \([^)]*shadowMode/` can never match the real
shape because the emitted condition `(n() > 5)` contains `)`, which `[^)]`
forbids. The corruption was present in that repro's output and the grep was
blind to it. (The reviewer's illustration `if (n > 5, …)` was idealized — real
emit calls the signal, so any detection must cross a `)`.)

Full extent, established by probing old vs new injection across shapes:

- Server + `if=` — the reviewed corruption (comma operator, dead branch
  renders). The string renderer is emitted AFTER `defineElement`, so its
  `if ((…))` is the module's last `)\s*)` pair.
- Server + interpolated text following a `(` in text content — old anchor
  landed inside `__aihu_stext(n(), { shadowMode: … })`.
- `$form`, ALL targets — old anchor landed inside
  `setFormValue(name(), { shadowMode: … })`.
- Layouts: NOT affected in practice (their server emit has no string renderer,
  so the last `))` is defineElement's own) — the review's layout emphasis was
  wrong, but the bug did not need it.

The first replacement (bare balanced-paren count, commit c0d5ddc1) fixed the
server shapes but silently BAILED — no `shadowMode`, no `lightScopeId` at all —
on any client/universal module whose inlined setup body carries an unbalanced
`(` inside a string literal (`<p>(</p>` → `leaf('(')`, `title="("`,
`signal('(')`), and on every `$form` component (the existing
`, { formAssociated: true }` third argument failed its whitespace check).

Fix as landed: `_matchParen` — a small lexer that matches the
`defineComponent(` close while skipping string literals, template literals
(with `${…}` frames), and comments — plus a merge path that folds
`shadowMode`/`lightScopeId` into `$form`'s existing options object instead of
bailing. Known accepted miss: a regex literal with an unbalanced paren in user
`@state` code reads as division; the landing-site validation turns that into a
no-op, never a corruption.

Tests: `packages/compiler/tests/light-scope-export.test.ts`, the
`_injectShadowMode anchors on defineElement` block. Verified against both
counterfactuals: the old regex fails 3 of the 5 tests (if-condition,
`__aihu_stext`, `setFormValue`); the naive scan fails 2 (paren-in-text bail,
`$form` bail); the landed implementation passes all, plus the full compiler
suite (237 tests).

### 11. `$`-expansion in the prerender content splice

`prerender.ts`'s `injectContent`/`injectIntoOutletMarker` interpolate rendered
content into a `String.replace` REPLACEMENT string, so `` $` `` / `$&` / `$'` in
prose re-splices the layout shell. `/api/store` trips it today. One-line fix:
the function form. This branch grew the injected garbage 172×.

### 12. Unescaped `<title>` and unescaped meta/link attribute NAMES

`ssr.ts`'s `buildHead`. SSG is unaffected (`head-apply.ts` escapes), but
`renderToString(component, { head })` is documented public API.

### 13. Attribute names are never validated

The parser accepts any name; `serializeAttrs` and `__aihu_sattr` escape values
but not keys. `<span data-x/onload="alert(1)">` parses to an `onload` handler in
the browser. Reachable by a hostile or careless third-party component, and child
SSR now carries such attributes into prerendered pages.

### 14. Symlink escape in component discovery

`discoverComponents` uses `readdir({recursive: true})`, which **follows
symlinked directories under bun** (the toolchain here) and not under Node. One
symlink under `dir.components` causes `.aihu` modules from outside the project
to be compiled and executed at build time. Also replace `e.parentPath ?? abs` —
that fallback silently flattens nested paths on a runtime lacking `parentPath`,
loading the wrong file rather than none.

### 15. `validate_define_tag` checks only for a hyphen

So `@route { name: "x-evil onmouseover=alert(1) x" }` reaches `__aihu_tag__` and
`<${wrapTag}>`. Not reachable through the child path (template tag names are
`[A-Za-z0-9_-]`), but it should enforce the custom-element name production.

---

## P4 — performance

### 16. Minify `__aihu_css__` (ranked first by the perf pass)

In shadow mode it is **10.1% of all prerendered HTML** — 651 blocks, 1,007,186
bytes, only 4 distinct payloads (**163× redundancy**), **24% whitespace**.
Measured 2,133 → 1,620 B per block, ~242 kB across the docs build, ~270 B
gzipped off every page. No byte-identity risk: both renderers read the same
export. Must be a CSS-aware pass, not a regex — `content:` strings.

Folding css-engine utility CSS in (already done) makes each copy bigger, so this
win grew.

Deliberately NOT recommended: `<link rel=stylesheet>` inside the template above a
size threshold trades the #754 first-paint failure back in. Config knob at most.

### 17. `discoverComponents` is sequential

`for (…) { await loadModule(file) }` at ~9 ms per module, paid whether or not
any page references it. `Promise.all` over the sorted list (pushing results in
order, so first-wins stays deterministic) overlaps Vite transform + I/O for
free. `apps/docs` pays ~55 ms of a 3.6 s build; it scales with component count.

### 18. Stop warning about unreferenced components

`weather-demo.aihu` fails to load under SSR (`CSSStyleSheet is not defined`) and
warns on every build, though no prerendered page references it. Warn only for
tags actually referenced.

---

## P5 — hygiene

### 19. The test harness may compile with a backend that is not the workspace source

A `transform()` call inside a vitest context emitted output missing a fix that
both `target/release` and `target/debug` binaries contain. The mechanism was not
pinned. The implication is uncomfortable: the differential suite's "real
pipeline" claim is only as strong as the resolved backend, and nothing asserts
the backend matches the source. A version/commit handshake between `transform`
and its resolved backend would make the class impossible.

### 20. Stale invariant documentation

- `runtime/src/shadow-mode.ts` and `runtime/src/index.ts` still describe a
  "cross-package parity test" that was correctly never built (the helper imports
  the constant directly). A future auditor will hunt a phantom.
- `compiler/js/index.ts` points at `route_and_build_target.rs` for the child-tags
  parity test; it lives in `light-scope-export.test.ts`.
- `child-registry.ts` and `prerender.ts` describe a transitive walk the caller
  deliberately does not do, and justify load-all circularly ("the tags cannot be
  read without loading them" — you only need all tags because you load all).
  State the real reasons: simplicity, the cycle check wants a global view, SSG
  cost is negligible.

### 21. A cross-boundary test does not exist

Client adoption is unit-tested and server bytes are pinned, but their meeting is
covered only by manual `apps/docs` inspection. One test that feeds
`__aihu_schild` output to a DOM and upgrades it would close the gap that hid the
duplicate-host bug.

Related: text-node adoption is positional, so a shadow child whose template
begins with a text node could mis-adopt past the injected `<style>`. Untested.


---

## 22. Both new diagnostics are blind to page→component references (found by re-observation)

**Introduced by the Wave 1 warn-gating; found by rebuilding `apps/docs` and
reading the output AFTER the fix landed, not by any test.**

`runPrerender` builds its `referenced` tag set from `childRegistry.values()`
only — i.e. tags referenced BY DISCOVERED COMPONENTS. Pages and layouts also
reference components, and their modules are loaded later, inside the render
loop, so their `__aihu_child_tags__` never reach the set.

Two consequences, both silent:

- **§18's warn-gate suppresses a legitimately referenced broken component.**
  `weather-demo.aihu` fails to load under SSR (`CSSStyleSheet is not defined`)
  and is referenced from `pages/index.aihu` and `pages/cookbook/agent-weather.aihu`
  — pages, not components — so it is judged unreferenced and says nothing. The
  build is now quieter than before the fix, for the wrong reason.
- **§3's unresolved-tag diagnostic has the same hole.** A tag referenced only by
  a page, and absent from the registry, is never reported.

**Do:** accumulate referenced tags from every module the prerender loads —
pages and layouts included — and emit both diagnostics AFTER the render loop
rather than before it. The information exists; it is only collected too early.

Note `<weather-demo city="London">` carries an attribute, so it would decline
child rendering under the v1 boundaries regardless — its emptiness is by design.
The defect is the missing WARNING about a component that cannot load, not the
empty element.

**Method note.** Every fix in this round was verified against the fix and
against the existing suite, and this defect passed both: it is a gap in what the
suite covers, so no test could have caught it. It surfaced only by re-running
the real build and comparing observed output against a recorded baseline. That
step belongs after every correction, not just at the end — a green suite proves
nothing about behaviour the fix newly makes reachable.


---

## 23. Symlink containment is implemented but UNTESTED

`discoverComponents`'s realpath containment (§14) has no test that exercises it.
A review reverted the check to `if (true)` and the whole suite stayed green.

I then wrote one, and it was vacuous: in the vitest fixture the symlinked module
is never discovered at all, so the test passed against the pre-fix code too and
could not distinguish "containment excluded it" from "discovery never saw it". A
standalone probe under bun DOES traverse a symlinked directory
(`readdir({recursive:true})` returns the file with a correct `parentPath`), so
the hazard is real and something about the fixture differs — temp-dir realpath
resolution is the likely candidate and was not run to ground.

Rather than ship a green test that asserts a security property it does not
exercise, the test was removed and this recorded. A real one needs a fixture
where discovery PROVABLY traverses the link — assert that the out-of-tree module
is discovered-then-excluded, not merely absent.

This is the highest-value untested item remaining: every discovered file is
compiled and EVALUATED by Vite at build time.


---

## 24. A structural template root bypasses the ROOT_PATH scope stamp

Found incidentally while probing the boundary fixtures.

The child gate declines a reference at `ROOT_PATH`, and the stated reason is that
the root element carries the PARENT's `data-a` stamp, which the host attributes
handed to `__aihu_schild` do not model. But when the template ROOT is structural
— `<x-kid if={…}>` as the whole template — the reference sits at
`0.conditional.true`, passes the `!== ROOT_PATH` check, and resolves on both
renderers. The parent's `lightScopeId` is then silently dropped: no `data-a`
appears anywhere in the output.

Consistent across both renderers, so it is NOT a differential bug and does not
threaten byte-identity — which is why the fixtures do not catch it. It is a hole
in the ROOT_PATH boundary's own rationale: "the root carries the parent's stamp"
stops being true the moment the root is a structural node.

Consequence: such a component's `@scope([data-a=…])` rules match nothing in the
prerendered HTML until its chunk loads — the #754 unstyled-first-paint class,
narrowly scoped to templates whose root is a bare conditional.

Pre-existing relative to the child work (the ROOT_PATH check predates it), and
not urgent. Worth fixing when someone next touches the root-stamp logic: either
stamp the structural root's first rendered element, or decline the child at any
path whose ROOT segment is structural.
