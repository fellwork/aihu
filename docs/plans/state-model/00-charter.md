# @state Reactive-Declaration Model — charter

**Status:** ratified design (founder, 2026-07-21) — spec written, no implementation.
**Branch:** `docs/state-model-spec` off `origin/main@9e6ddbfd`.
**Tracking:** GitHub #487 (the "@state arc" row of `docs/plans/template-grammar/60-status.md`).
**Normative document:** `40-spec.md` (this directory). This charter records why and what was
decided; the spec records exactly what builders implement.

## Why this exists

The template-grammar redesign (#484/#489) retired `$` from `@template`; `@state` is the last
surface where `$` survives, and it carries ~16 distinct declaration kinds in three parallel
dialects: `$`-macro collections (`$prop: { … }`, `$action: { … }`), runtime signal tuples
(`const [x, setX] = signal(0)`), and the aihu-only bare typed declaration
(`loading: boolean = false`). None of the three is plain TypeScript, two of the three are
reactive by different mechanisms, and the third is *semi*-reactive (template thunks re-read
it, nothing invalidates on write). The just-shipped TS-generator (#485/#490) type-checks
`@state` bodies for the first time — and has to blank every macro line because they are not
TS.

## The ratified design, in one sentence

**`@state` declarations factor into two orthogonal axes — nature (`const`/`let`, the TS
keyword, same as `@template`) and role (compiler-recognized wrapper functions: `state`,
`prop`, `derived`, `action`, `resource`, `stream`, `controller`) — every declaration is
valid TypeScript, reactivity is explicit (`let loading = state(false)`), writes stay plain
assignment, bare `let`/`const` stay inert plain JS, and `$` retires from `@state`
entirely.**

Ratified by the founder 2026-07-21. The spec transcribes this design into normative form —
it does not re-litigate it. The `60-status.md` open fork (bare-`let` auto-reactive vs
explicit `state()`) was resolved by the founder **for explicit `state()`**, on the
Svelte-4→5 / Vue-`$ref` evidence plus aihu's own corpus (§1.2 of the spec).

## Scope

- **In:** the two-axis declaration model; the full wrapper reference (`config?, valueOrFn`
  signatures); a disposition for every one of the ~16 existing `@state` declaration kinds
  and dedicated forms; the reactivity semantics including the new write-rewrite pass; the
  identity-typed intrinsic declarations and their threading into the shipped `__aihu_ctx`
  sidecar; GX `expose:` shorthand alignment; the incremental migration plan with the
  signal-tuple compat window; acceptance criteria.
- **Out:** `@template` grammar (done — `docs/plans/template-grammar/40-spec.md`); `@agent`
  member macros `$scope`/`$rate-limit`/`$stream` (untouched by ratification); `@style`;
  any change to the GX resolved-boolean semantics (opaque member IDs, DE5 schema
  derivation, write-exposed-props-never-tools — all unchanged, only the sugar in front of
  them changes).

## Posture decisions carried into the spec

- **Incremental migration, not big-bang.** Unlike the grammar wave, `signal()` is a runtime
  import, not grammar — the compiler keeps accepting the old tuple form during a
  deprecation window and files migrate one at a time (spec §7). The `$`-collection forms
  hard-retire only in the final wave, with the C440-style `fix:`-hint pattern.
- **No new reactivity semantics.** The wrappers lower to the same runtime primitives the
  macros lower to today (`signal`, `computed`, `effect`, `batch`, `createResource`,
  `createStream`, …). This is a *declaration-surface* redesign.
- **Wrappers only where a binding exists.** Non-binding kinds (`effect`, lifecycle,
  `aria`, `context.provide`, `form`, `event`) become statement-position calls; component
  configuration (`$shadow`, `$extract`) stays directives, not bindings.

## Relationship to other efforts

- `docs/plans/template-grammar/` — the ratified grammar spec (#481) whose "one rule" this
  arc completes: after this lands, `$` appears nowhere in an `.aihu` file.
- `docs/plans/w1-compiler` + #485/#490 — the TS-generator sidecar (`__aihu_ctx` value view)
  the identity-typed wrappers thread into (spec §5).
- `docs/plans/co1-prop-write-rewrite` — the shipped `$prop` write-rewrite
  (`expr/prop_write.rs`) the new general write-rewrite pass extends (spec §4.3).
- `docs/plans/governed-extractability/` — the shipped `expose`/`$extract`/`$scope`
  machinery the wrapper configs desugar onto (spec §6).
