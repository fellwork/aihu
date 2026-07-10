# Plan: Advanced JS Syntax in Template Expressions (spread, `.map()`, real JS in `{…}`)

**Date:** 2026-07-10
**Author:** Scoping brief (founder direction 2026-07-10; same session as the HTML-comment parser report)
**Status:** APPROVED — founder selected Option C (hybrid, 2026-07-10). W1+W2 in build.
**Supersedes/absorbs:** the two TODOS.md entries added 2026-07-10 — *"Template expressions:
spread, `.map`, and array/array-like functions"* (absorbed fully by W1–W5) and the template
half of *"TS type-check sidecar — completion pass"* (W4; the `@state`-emit-path audit half
stays its own item).

---

## TL;DR / Verdict

The founder report said "spread and `.map()` don't work in templates and the errors are
opaque." The empirical sweep (57 fixtures, harness below) shows the truth is worse and
more interesting: **the parser accepts almost everything** — `{expr}` capture is a raw
brace-matcher, so `.map()` chains, ternaries, optional chaining, `new`, object/array
literals all *parse*. The real defect classes are:

1. **Silent miscompiles.** The signal-read rewrite (`count` → `count()`) is a token
   scanner with systematic blind spots: **spread (`...items`) is never rewritten** (the
   `...` makes the scanner think it's a member access), **template-literal `${count}` is
   never rewritten**, the dotted-base fast path copies arrow bodies verbatim, and
   `{#each}` aliases that shadow a signal still emit the signal tuple. These compile
   clean and break at runtime (`items is not iterable`, `NaN`, rendered function source,
   dead branches). This — not parse rejection — is the founder's bug.
2. **Boundary-scanner artifacts.** The `{…}` scanners are not lexically aware: a `}` in
   a string literal, a regex literal after `{`, and (until b03dba1) a JS comment after
   `{` all misparse with misleading errors. b03dba1 fixed exactly one member of this
   class; the class scales with every new grammar form.

**Recommendation: Option C (hybrid).** Keep the hand-rolled template tokenizer for
finding `{expr}` boundaries (hardened once, lexically aware — W1); hand every captured
expression to **`oxc_parser::parse_expression`** for validation and a **span-based,
scope-aware signal rewrite over a real AST** (W2–W3). Full-parser-for-everything is not
viable (`as` in each-heads collides with TS casts; templates are HTML-shaped), and
extending the hand-rolled grammar means teaching ~10 parallel hand tokenizers every new
form forever.

**wasm finding (measured, not estimated):** oxc expression parsing costs **+817 KB raw /
+241 KB gzip** at the current `release` profile, and **420 KB raw / 159 KB gzip** under
`opt-level="z"` + LTO. Current compiler wasm is 740 KB raw / 252 KB gzip against a
**<500 KB gzip budget** (WASM.md). oxc fits with the size profile adopted in the same
wave (~300–400 KB gzip combined, realistic). **swc_ecma_parser measured 1.31 MB raw /
349 KB gzip for the probe alone → combined would breach the budget → disqualified.**
ratel is unmaintained (no optional chaining/nullish) → disqualified. One MSRV catch:
oxc 0.139 requires rustc ≥ 1.94; `rust-toolchain.toml` pins 1.87.0 → toolchain bump in W2.

---

## Verified findings (with file:line — do NOT re-investigate)

### Where the grammar lives today

| Concern | Location |
|---|---|
| `{expr}` interpolation capture (raw brace-match, no string/regex awareness) | `packages/compiler/src/parser/template.rs:558` (`parse_expr_interpolation`) |
| `{{ident}}` v0 double-brace form (single identifier ONLY) | `template.rs:584` + `directives.rs:687` (`validate_identifier`) |
| Block-tag heads `{#if}`/`{#each}`/`{@html}` capture (brace-match, no strings) | `template.rs:347` (`read_balanced_until_close_brace`) |
| `{#each}` header split (` as `-scan IS string/paren-aware; alias split is NOT) | `template.rs:773` (`parse_each_header`) — alias side uses `split_once(',')` at :872 |
| `{/` vs comment disambiguation (the b03dba1 fix) | `template.rs:712` (`starts_expr_comment` — only exempts `{//` and `{/*`) |
| Attribute token capture (quotes tracked at depth 0 ONLY — not inside `{…}`) | `template.rs:629` (`read_attr_token`) |
| Attribute value brace extraction | `parser/directives.rs:524` (`find_top_level_eq`), :539 (`extract_balanced_braces`) |
| Signal-read rewrite (token-based) | `codegen/emit.rs:5005` (`rewrite_signal_reads_to_calls`) |
| Arrow-param shadow collection (token-based, over-collects) | `emit.rs:4902` (`collect_arrow_params`) |
| Interpolation lowering incl. the dotted-base fast path that skips rewrite | `emit.rs:3767–3841` (`emit_node` Interpolation arm; fast path :3793) |
| Reactive-thunk decision (`(` outside strings) | `emit.rs:5114` (`interpolation_has_call`) |
| State-reference detection (separate token scanner) | `emit.rs:5148` (`expr_references_state`) |
| Attr lowering | `emit.rs:4851` (`lower_attr_expr`) |
| If/each lowering (rewrite called per-site) | `emit.rs:4070` (`lower_if_cond`), :4090 (`emit_each_block`) |
| Sidecar expression lift + line-preserving layout (#389/#390) | `emit.rs:244` (`emit_sidecar_ts`), :672 (`expr_references_ident`), :614 (`collect_loop_aliases`) |
| Existing rewrite tests | `packages/compiler/tests/template_expr_rewrite.rs`, `template_parse.rs`; sidecar: `b3_variant_b.rs`, `route_and_build_target.rs` |

### Empirical truth table

Harness: standard `@state` (signals `count/items/user/nums/obj/pairs/users/loading`,
plain `const extra`), snippet spliced into `@template`, compiled with
`target/release/aihu-compile --stdin --tag t`. Full fixture set preserved in this doc's
tables; re-run by rebuilding the harness from them.

**(a) `{expr}` text interpolations**

| # | Expression | Parse | Emit correctness |
|---|---|---|---|
| a01 | `{user.name}` | ACCEPT | ✅ reactive member leaf (fast path :3793) |
| a02 | `{items.join(', ')}` | ACCEPT | ✅ |
| a03 | `{items.filter(i => i > 1).map(i => i * 2).join(',')}` | ACCEPT | ✅ **method chains + `.map()` already work** in interpolations |
| a04 | ternary | ACCEPT | ✅ rewritten + thunked |
| a05 | arrow IIFE `{(() => count)()}` | ACCEPT | ✅ |
| a06 | ``{`Count: ${count}`}`` | ACCEPT | ❌ **SILENT WRONG** — emits `leaf(`Count: ${count}`)`: `${count}` not rewritten (rewriter skips template literals, :5036) AND not thunked (`interpolation_has_call` sees no `(` outside strings) → renders function source, never updates |
| a07 | `{user?.name}` | ACCEPT | ✅ `user()?.name` |
| a08 | `{count ?? 0}` | ACCEPT | ✅ |
| a09 | `{count > 0 && !loading ? 1 : 2}` | ACCEPT | ✅ |
| a10 | `{Math.max(...nums)}` | ACCEPT | ❌ **SILENT WRONG** — `...nums` not rewritten (after `...` the scanner's `prev_significant == '.'` → treated as member access, :5067) → spreads the getter *function* → `NaN` |
| a11 | `{[...items, extra].length}` | ACCEPT | ❌ **SILENT WRONG ×2** — not rewritten AND eager (no call seen) → `TypeError: items is not iterable` at runtime |
| a12 | `{ {...obj, b: 2}.b }` | ACCEPT | ❌ eager + unrewritten spread of getter (note: needs leading space or `{{` misroutes to v0 form) |
| a13 | `{[1, 2, 3].length}` | ACCEPT | ✅ (no signals involved) |
| a14 | `{JSON.stringify({ a: 1 })}` | ACCEPT | ✅ |
| a15 | `{new Date().getFullYear()}` | ACCEPT | ✅ |
| a16 | `{/^a/.test(user.name) ? 1 : 0}` | **REJECT** | ``unexpected `{:` or `{/` outside of `{#if}` / `{#each}` block`` — regex after `{` hits the `{/` block-tail classifier (`starts_expr_comment` only exempts `//` and `/*`). **Same class as the b03dba1 comment bug.** |
| a17 | `{'}'}` | **REJECT** | `unclosed <p> element` (brace-match counts the `}` inside the string; error surfaces far away) |
| a18 | `{'{'}` | **REJECT** | `unclosed @template block opened at line 13` — the SFC-level block extractor is also string-blind |
| a19 | `{items.map(i => { return i * 2 }).join('')}` | ACCEPT | ✅ block-bodied arrow OK (brace-balanced) |
| a20 | `{{count}}` | ACCEPT | ✅ (v0 double-brace identifier form) |
| a21 | `{{count + 1}}` | **REJECT** | `interpolation must be a single identifier in v0; expressions are not supported` — the `{{` prefix hijacks any expression that *starts* with an object literal |
| a22 | `{items.map(count => count + 1).join('')}` | ACCEPT | ✅ shadowed param NOT rewritten — but only because the dotted fast path copies verbatim (see d01 for the flip side) |
| a23 | `{JSON.stringify({ count: 1 })}` | ACCEPT | ✅ object key not rewritten |
| a24 | ``{`n=${count} of ${items.length}`}`` | ACCEPT | ❌ same class as a06 |
| a25 | `{// note\ncount}` | ACCEPT | ✅ (b03dba1) |

**(b) attribute positions** (`$attr={…}` → `Attr::Binding`; `$if={…}` → macro; component props)

| # | Expression | Parse | Emit correctness |
|---|---|---|---|
| b01–b03, b09, b11, b12 | member / chain / ternary / `new` / optional chain / `.some(…)` in `$if` | ACCEPT | ✅ `lower_attr_expr` thunk-wraps + rewrites |
| b04 | `$class={[...items, 'x']}` | ACCEPT | ❌ **SILENT CRASH** — `[() => __aihu_cls([...items, 'x'])]`, `items` unrewritten → not iterable |
| b05 | `$data-x={JSON.stringify({...obj, b: 2})}` | ACCEPT | ❌ spread of getter inside call |
| b06/b07 | `$on.click={() => setCount(count() + 1)}` / block body | ACCEPT | ✅ handlers pass through |
| b08 | ``$title={`c=${count}`}`` | ACCEPT | ❌ thunked but unrewritten (a06 class) |
| b10 | `$title={/a/.test(user.name) ? 'y' : 'n'}` | ACCEPT | ✅ — regex is FINE in attributes (different scanner than text position; inconsistent grammar surface) |
| b13/b14 | `<UserCard items={[...items]} />`, `cfg={{ a: 1, ...obj }}` | ACCEPT | ❌ component prop spread of a signal unrewritten (same class as b04) |
| b15 | `$title={'}'}` | **REJECT** | `expected attribute` — `read_attr_token` tracks quotes only at brace-depth 0 (:644 skips quote state inside braces) |

**(c) block heads**

| # | Expression | Parse | Emit correctness |
|---|---|---|---|
| c01–c05 | `{#if}` simple / expr / call chain / optional chain / parenthesized ternary | ACCEPT | ✅ |
| c06 | `{#if /a/.test(user.name)}` | ACCEPT | ✅ — regex fine here too (only TEXT position breaks, a16) |
| c07–c09, c13 | `{#each}` simple / idx+key / **filter().map() chain** / block-bodied arrow | ACCEPT | ✅ (`{#each items.filter(e => e.ok) as x (x.id)}` has a unit test, template.rs:1081) |
| c10 | `{#each pairs as [k, v]}` | ACCEPT | ⚠️ **ACCIDENTALLY CORRECT** — `parse_each_header` tears the pattern at the first comma (`item_alias="[k"`, `idx_alias="v]"`), and codegen's `format!("({}, {})", item, idx)` re-joins the text. Emitted JS is right; the *AST is wrong*, so anything consuming the alias as a name (StateNames exclusion, key-expr scoping, future waves) is corrupted. |
| c11 | `{#each users as { name, id }}` | ACCEPT | ⚠️ same accidental-textual-correctness |
| c12 | `{#each [...items, extra] as it}` | ACCEPT | ❌ spread unrewritten in the list thunk → runtime crash |
| c14 | `{#each ['}'] as it}` | **REJECT** | `` `{#each}` header must contain ` as ` separator`` — string-blind brace scan truncates the header |
| c15 | `{@html user.name}` | ACCEPT | ✅ |
| c16 | `{#each Object.entries(obj) as [k, v]}` | ACCEPT | ✅ (obj rewritten — call position) |
| c17 | `{#each Array.from({ length: count }, (_, i) => i) as n}` | ACCEPT | ✅ `count()` rewritten |

**(d) rewrite-fragility probes (the architecture-deciding set)**

| # | Probe | Result |
|---|---|---|
| d01 | `{items.filter(i => i > count).length}` | ❌ dotted-base fast path (:3793) copies the prop path **verbatim** — `i > count` compares against the getter function, always false. The same expression *without* a signal base (d02) is rewritten correctly by the step-3 path. Two code paths, two semantics. |
| d03/d04 | `{#each items as count}<p>{count}</p>` | ❌ emits `leaf([count, setCount])` INSIDE the loop callback — the rewriter/emitter has **no scope model**; each-aliases shadowing a signal still emit the signal tuple. |
| d06 | ``{#if `${count}` === '3'}`` | ❌ unrewritten (template-literal class) → branch never fires. |
| d07 | spread in each body | ❌ same as a10. |
| d10 | `{items.map(({ x }) => x)}` | ✅ destructured arrow params happen to work (over-collection in `collect_arrow_params` is conservative-safe). |

### The signal-rewrite constraint (this decides the architecture)

The rewrite is duplicated across **at least seven independent token scanners** that must
each agree on JS lexical structure, and don't:

- `rewrite_signal_reads_to_calls` (emit.rs:5005) — skips template literals, breaks on spread, guards object keys with a heuristic bracket stack (`'O'` vs `'B'` braces guessed from `=>` adjacency);
- `collect_arrow_params` (emit.rs:4902) — over-collects param-list identifiers (defaults/destructuring all become "shadows" → missed rewrites);
- `expr_references_state` (emit.rs:5148), `expr_references_ident` (emit.rs:672), `first_referenced_ident` (signals.rs:455) — three near-copies of the same ident scan ("Mirrors emit.rs `expr_references_state`'s tokenizer" is a literal comment in signals.rs);
- `interpolation_has_call` (emit.rs:5114) — reactivity decision by "is there a `(`";
- the dotted-base fast path (emit.rs:3793) — bypasses the rewriter entirely for `base.anything`, which is where d01 comes from.

Plus the boundary scanners (template.rs:347/:558/:629, directives.rs:524/:539,
signals.rs `initializer_rhs`:403) — **~10 hand lexers total**. Every new expression form
(spread was the demonstration) must be taught to most of them independently, and each
miss is a *silent* miscompile, not an error. There is no scope model anywhere, so
shadowing correctness is unachievable in the token approach (d03/d04 cannot be fixed
without binding-aware analysis). This is why Option A loses.

### wasm + toolchain measurements (2026-07-10, this machine)

| Artifact | raw | gzip -9 |
|---|---|---|
| Current `aihu_compiler_bg.wasm` (wasm-pack, June 4 vendor copy) | 740,056 B | **252,104 B** |
| oxc probe (`oxc_parser` 0.139 `parse_expression`, TS mode), `release` O3 | 817,152 B | 240,881 B |
| oxc probe, `opt-level="z"` + `lto` + `codegen-units=1` + `panic="abort"` + `strip` | 420,370 B | **158,611 B** |
| swc probe (`swc_ecma_parser` `parse_expr`), `release` O3 | 1,305,561 B | **349,326 B** |

- Budget: **<500 KB gzip** (`packages/compiler/WASM.md`, arch-4 §4.6 / Directive 1; CI warns, non-blocking).
- oxc + compiler combined, naive O3: ≈490 KB gzip (uncomfortable). With the `z` profile applied to the whole cdylib (+ wasm-opt, which wasm-pack already runs): realistic **~300–400 KB gzip**. Fits.
- swc combined: ~600 KB gzip → **breaches budget** → disqualified (also drags `swc_common` sourcemap machinery the compiler doesn't need).
- ratel: unmaintained since ~2019; no optional chaining, nullish, or modern syntax → disqualified on grammar coverage before size.
- **MSRV:** oxc 0.139.0 requires **rustc 1.94.0**; `rust-toolchain.toml` pins **1.87.0**. W2 must bump the pin (1.94+; 1.95.0 verified working locally) and check CI images, the pinned `cross` commit for aarch64-linux, and `packages/server/src-native` (excluded from the workspace but shares the toolchain file).
- Functional check (native, oxc 0.139): `parse_expression` with `SourceType::ts()` accepts every fixture form above — spread in call/array/object, regex literals, `'}'` strings, template literals, destructured arrow params, `new`, block-bodied arrows — and rejects `count +` / `items.` with spanned diagnostics. Message text is terse ("Unexpected token") but spans are exact; we wrap them in aihu diagnostics (see Contract).

---

## Architecture options, costed

### A. Extend the hand-rolled grammar — REJECTED
- **Per-form cost:** each new form touches most of the ~10 scanners. Spread alone needs: rewriter `...`-awareness, `expr_references_state`, both sidecar scanners, `first_referenced_ident`, and boundary scanners for `}` inside new literal forms. The b03dba1 comment fix — the *smallest possible* member of this class — touched 2 classification sites and shipped 4 regression tests.
- **Cumulative fragility:** the `{/`-misclassification family (comments fixed, regex a16 still broken), string-blind brace matching (a17/a18/b15/c14 — four *different* scanners with the same hole), and unfixable-without-scopes shadowing (d03/d04). Each fix is a new special case in a heuristic lexer; the failure mode stays "silent wrong output."
- Honest credit: it got surprisingly far (a03/c09 chains work). But the remaining gap is exactly the part token scanning is worst at.

### B. Real JS parser for EVERYTHING (replace template parsing) — REJECTED
- Templates are HTML-shaped; oxc/swc don't parse HTML. `{#each items as x}` can't go through a TS parser whole (`as` parses as a TS cast — verified hazard). A JSX-mode parse of the whole template would change the authoring surface (void elements, `$on.click=`, `{#if}` blocks are not JSX). Not a real option; listed for completeness.

### C. Hybrid: hand-rolled TOKENIZER for boundaries + oxc for expression SOURCE — **RECOMMENDED**
- Tokenizer keeps doing what it's good at: finding `{`/`}` boundaries, block tags, attributes — hardened ONCE with a shared lexical scanner (strings/template-literals/comments/regex) instead of per-site heuristics (W1).
- Every captured expression string goes to `oxc_parser::parse_expression` (TS mode): **validation** (real syntax errors with spans, mapped to `.aihu` line/col) and a **single scope-aware AST visitor** for the signal rewrite (span-splice `()` after unshadowed signal reads; expand object shorthand `{ count }` → `{ count: count() }` — a case the token rewriter can't even express). Replaces all seven rewrite/reference scanners with one implementation.
- Each-heads: keep the existing string/paren-aware ` as ` split (template.rs:819 — it already exists and is correct), then parse the LIST side as an expression and the ALIAS side as a binding pattern (parse `(alias) => 0` and read the param pattern — validated trick), fixing c10/c11's torn AST for real.
- **Tradeoffs, explicit:**
  - *wasm:* +159–241 KB gzip (profile-dependent); fits the 500 KB budget with the `z` profile adopted in the same wave. CI already emits the size warning; make it assert.
  - *Error messages:* oxc's are terse but exactly-spanned. We do NOT surface raw oxc text; W2 wraps into the existing rich-diagnostic shape (`CompileError` hint/fix/from/to, rendered by `bin/main.rs::render_human_error`) with the subset contract text. Net error quality goes UP vs. today's "unclosed <p> element" for a `}` in a string.
  - *MSRV bump* (1.87 → 1.94+) and oxc's release cadence (pin exact version; oxc AST types churn between minors — contain all oxc types inside one `expr/` module so upgrades are localized).
  - *Dual-path risk during migration:* mitigated by flag-gating + corpus snapshot diffing (below).

---

## Contract: the template-expression subset (docs page + diagnostic text, W5)

**Allowed** in `{…}` interpolations, `$attr={…}` bindings, `{#if}`/`{:else if}` heads,
`{#each}` list positions, `(key)` exprs, and `{@html}`: any single JS/TS **expression** —
member access, calls, method chains (`items.filter(…).map(…)`), ternary/logical/nullish/
comparison operators, arrow functions (expression or block body), template literals,
optional chaining, spread in calls/arrays/objects, array/object literals, `new`, regex
literals, `Object.entries`/`Array.from`/Set/Map iteration in each-heads. Signal reads are
written bare (`count`, `items`); the compiler inserts calls.

**Allowed only in `$on.*` handler position:** assignment/update operators and multi-
statement block bodies (`{(e) => { … }}`).

**Rejected — hoist instead** (diagnostic C321): statements and declarations (`if`/`for`/
`const`), sequence commas, `await`/`yield`, assignments outside handlers. The diagnostic
says exactly: *"template expressions are single JS expressions; move multi-statement or
effectful logic into `$action`, and derived values into `$computed` (then reference the
computed name here)."* Syntax errors get C320 with the oxc span mapped to the real
`.aihu` line/col plus the offending token.

**Sidecar interaction (#389/#390):** expressions keep being lifted as RAW TEXT onto their
line-preserved sidecar lines (`emit_sidecar_ts`'s forward-cursor layout is untouched — the
#390 "tsc cites the real .aihu line" contract holds for every new form, since richer
grammar changes *which* strings are captured, not how they're placed). What changes: the
referenced-ident harvest (`expr_references_ident`) and loop-alias harvest
(`collect_loop_aliases`/`extract_pattern_idents`) read the oxc AST instead of token scans,
so destructured aliases, spread targets, and template-literal reads all surface as sidecar
params instead of TS2304ing or silently vanishing.

---

## Wave plan (PR-sized, flag-gated, each with tests + fixtures)

Gating: new CLI flag `--expr-parser <legacy|ast>` + env `AIHU_EXPR_PARSER` (mirrors the
`--machine-errors`/`AIHU_MACHINE_ERRORS` pattern in `bin/main.rs`). Default stays
`legacy` through W2; W3 flips the default after a corpus diff; `legacy` is removed one
minor version later. The wasm build carries both paths until the flip (size measured at
each wave against the CI gzip check).

### W1 — Boundary-scanner hardening + honest diagnostics (no grammar change, no new deps) — S/M
- One shared lexical scanner (strings, template literals incl. nested `${…}`, `//`/`/* */`
  comments, regex via prev-significant-token heuristic) used by: `parse_expr_interpolation`
  (template.rs:558), `read_balanced_until_close_brace` (:347), `read_attr_token` (:629 —
  fix the quotes-inside-braces hole), `parse_each_header` (:773), `extract_balanced_braces`
  / `find_top_level_eq` (directives.rs), and the SFC block extractor (a18's
  "unclosed @template").
- Generalize the b03dba1 fix: `{/` is a block tail **only** when followed by `if}` or
  `each}` (whitespace-tolerant); everything else falls through to expression parsing.
  Fixes a16 (regex in text position).
- Better `{{` diagnostic: expression after `{{` (a21) should say *"`{{…}}` is the v0
  single-identifier form; for expressions use single braces `{…}` (an object literal
  needs a space: `{ {…} }`)"*.
- Fixes: a16, a17, a18, b15, c14. Tests: extend `template_parse.rs` + parser unit tests
  with the full reject-row fixture set; every fixed case asserts the *message*, not just
  acceptance.

### W2 — Embed oxc behind the flag; validate-only — M
- Deps: `oxc_allocator`, `oxc_parser`, `oxc_span`, `oxc_ast` (pin exact; contain in a new
  `packages/compiler/src/expr/` module). Bump `rust-toolchain.toml` 1.87.0 → 1.94/1.95;
  verify CI images, the pinned `cross` commit, release.yml matrix, and `src-native`.
- Thread expression source offsets through capture sites (Interpolation/Attr/block-head
  nodes carry the `.aihu` byte offset) so oxc spans map to real line/col — this is also
  the groundwork the sidecar's cursor-search can later retire onto.
- Under `--expr-parser=ast`: parse every captured expression (`SourceType::ts()`; handler
  position permits assignment). Parse failure → C320/C321 rich diagnostics. Codegen
  UNCHANGED (validation only) — accepted code compiles byte-identically.
- Adopt the wasm size profile (`opt-level="z"`, `lto`, `codegen-units=1`,
  `panic="abort"`) for the cdylib; turn the CI 500 KB-gzip warning into a hard assert;
  record the new number in WASM.md.

### W3 — Signal rewrite on the AST — M/L
- One visitor replaces `rewrite_signal_reads_to_calls`, `collect_arrow_params`,
  `interpolation_has_call`, `expr_references_state` (and the emitter consults it instead
  of the dotted-base fast path at emit.rs:3793): scope-aware (function/arrow params incl.
  destructuring + defaults; `{#each}` aliases threaded in as pre-bound scope), rewrites
  inside template-literal `${…}` and after spread, expands object shorthand, leaves
  member accesses/keys alone *by construction*.
- Reactivity decision becomes "does the rewritten AST read any signal" instead of "is
  there a `(`".
- Fixes: a06/a24/b08/d06 (template literals), a10/a11/a12/b04/b05/b13/b14/c12/d07
  (spread), d01 (dotted-path arrow bodies), d03/d04 (each-alias shadowing).
- Flip default to `ast` here IF the corpus diff is clean: snapshot-compile every fixture
  in `tests/` + `examples/**/*.aihu` under both paths; every diff must be an intended fix
  from the table above (insta snapshots make this reviewable).

### W4 — Sidecar integration — S/M
- Replace `expr_references_ident` and the loop-alias token harvest with AST-derived
  reference/binding sets; keep raw-text lifting + the #390 line-preserving layout
  untouched. Handlers still emitted via `__handler(…)` call position.
- Absorbs the TEMPLATE half of the TODOS "sidecar completion pass" (every template-
  referenced binding surfaces, incl. destructured/spread/template-literal reads). The
  `@state` emit-path audit half (`$action`/`$computed` return types, slot/prop generics)
  remains a separate TODO — do not fold it in here.
- Tests: `b3_variant_b.rs`, `route_and_build_target.rs`, plus `b3b-sidecar-tsc.test.ts`
  (real `tsc` over fixtures with the new forms; assert cited line numbers).

### W5 — Each-head patterns, spread-everywhere polish, contract docs — M
- `item_alias` becomes a parsed BindingPattern (kills the `split_once(',')` tear and the
  accidental-textual-correctness of c10/c11); destructuring + idx + `(key)` combos get
  explicit tests (`{#each pairs as [k, v], i (k)}`); key exprs get alias-aware rewrite.
- Docs page "Template expressions" (docs site + `llms.txt`) stating the Contract section
  verbatim; diagnostics reference it by URL.
- Remove the `legacy` path + dead token scanners one minor version after W3's flip.
- Closes the TODOS "spread/map/array-fn" entry; the founder-reported failure modes all
  have named fixtures by this point.

---

## Risks / open questions

1. **oxc churn:** AST types move between minors. Mitigation: exact pin, single `expr/`
   module boundary, upgrade only deliberately.
2. **MSRV ripple:** 1.94 bump touches CI, `cross` pin, contributors. Cheap to verify in
   W2's PR; if it snags, oxc versions do exist for older rustc but pinning old oxc
   long-term is worse than the toolchain bump.
3. **Perf:** oxc allocates per-expression arenas; expressions are tiny. The <200 ms p50
   playground target has ~100× headroom; W2 adds a bench guard in `bench/` anyway.
4. **Behavioral flips as bug-fixes:** W3 changes emitted output for the silent-wrong
   cases (that's the point) — components that accidentally depended on rendering a
   function's source text will change. Corpus diff + CHANGELOG callouts cover this.
5. **`{{` legacy form:** long-term, the v0 double-brace form is a grammar wart that
   steals `{{…}}`-leading expressions (a21). Deprecation is NOT in scope here; W1 only
   improves its diagnostic. Flag for a future v2-surface decision.
