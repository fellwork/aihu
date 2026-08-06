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

### 7. Tag-collision tie-breaks disagree

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

### 10. `_injectShadowMode`'s greedy regex corrupts `if=` conditions — NOT REPRODUCED

**Status: the anchor was replaced with a balanced-paren scan, but the reported
corruption could not be reproduced.** A server-target component with
`<span if={n > 5}>` compiles cleanly under the OLD regex. Either the review's
repro used a shape I did not find, or the finding was wrong. The scan is a
better anchor either way — an unbounded `[^]*` across a whole module cannot be
reasoned about — but nothing here proves a bug was fixed, and the tests say so.
Someone should find the reproducing shape or close this as invalid.

Original report:

`compiler/js/index.ts` — `[^]*` runs past `defineElement` and anchors on the
module's LAST `))`, which for any component with an `if=` is the emitted
condition: `if (n > 5, { shadowMode: "light", … })` — always truthy. Used to
leak one stray empty element; now materializes the child's entire subtree
(measured: 2,211 bytes, 33 nested hosts, from a dead branch).
`_injectLightScopeId` does the same job correctly with a literal replace.

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
