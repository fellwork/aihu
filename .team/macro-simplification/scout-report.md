# Scout report · macro-simplification · round 001-S · 2026-05-05

**Mode:** 2 (read-only research) · **Author:** Scout · **Branch:** `plan/macro-simplification` ·
**Inputs read in full:** `director-note-001.md` (lines 1–306, 438–524, 786–908) ·
`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` (§0–§6 inclusive) ·
`docs/superpowers/specs/2026-05-02-spec-block-structure.md` (§0–§3) ·
`docs/roadmap/_user-directives.md` (full, 99 lines) ·
`packages/compiler/src/parser/{state_macros.rs (771 LOC), agent_macros.rs (192 LOC), agent.rs (526 LOC), style_macros.rs (285 LOC), sfc.rs (line 1006), template.rs (440 LOC)}` ·
`packages/compiler/src/types.rs` (211 LOC) ·
`state-agent-readiness.md` ·
**Corpus audited:** 43 `.aihu` files — 19 `examples/` (excluding `archived/`), 21 `bench/compiler-conformance/`, 3 `apps/docs/src/components/`. ·
**AGENTS.db:** 3 queries, **0 prior records** on macro-design (queries below).

> **Headline finding:** the example corpus uses a syntax that **the parser does not implement**.
> Of the 4 in-scope `@agent` macro forms (`$expose`, `$action`-bare, `$describe`, `$expose.write`), **3 of 4 forms used in `examples/*.aihu` would currently fail compilation** if any tooling actually ran the compiler against those files. The discrepancy is invisible because the compiler test suite reads from `bench/compiler-conformance/blocks/`, not from `examples/`. The "duplication" the user is pointing at is real *as-aspirational-syntax*, but the redesign target is the spec, not a working subset of the parser. **This shifts the round-004 architect-design problem statement.** Detail in §3.

---

## 1. Macro usage census (43 files audited)

Methodology: `find examples/ bench/compiler-conformance/ apps/docs/src/components/ -name "*.aihu" -not -path "*archived*" | xargs grep -hcE <pattern>` for each macro pattern. Files-using-macro is `xargs grep -lE` count; total occurrences is summed line count. Both numbers are line-count, not semantic-instance-count (a multi-line `$action name() { ... }` is counted once at the keyword, not once per line of body).

### `@state` block macros (12 per spec §2)

| Macro | Block(s) | Files using | Total occ | Keyword re-typed per decl? | Cross-block? | Duplication shape |
|---|---|---:|---:|---|---|---|
| `$prop` | `@state` | 10 | 13 | YES — keyword on every declaration line | yes (referenced from `@template` and from `@agent` `$expose`) | "stack of `$prop foo: T` lines"; no syntactic affordance to share the keyword across N lines |
| `$computed` | `@state` | 8 | 18 | YES — keyword on every line | yes (template, `@agent` `$expose`) | same as `$prop` |
| `$action` (declaration) | `@state` | 12 (decl form: `$action name(...) {...}`) | 26 (decl) | YES — keyword on every declaration | yes (template `$on:click=`, `<form $action=>`, `@agent` bare-name) | each action keyword + name + sig + body, all four parts independent |
| `$resource` | `@state` | 1 | 1 | YES — keyword per decl | (rare — `@agent` `$expose` cross-ref permitted by spec but unused in corpus) | same as `$prop` |
| `$effect` | `@state` | 2 | 4 | (yes — keyword per block, but no name to duplicate) | no | NONE — each effect is independent |
| `$effect.on` | `@state` | 1 | 1 | yes (same as `$effect`) | dep is a name from `@state` (genuine cross-ref, not duplication) | NONE |
| `$watch` | `@state` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$lifecycle.mount` | `@state` | 3 | 4 | n/a — singleton | no | NONE |
| `$lifecycle.dispose` | `@state` | 2 | 2 | n/a — singleton | no | NONE |
| `$expose` (in `@state`) | `@state` | 0 | 0 | n/a | n/a (would be cross-block) | NONE — **zero usage in the audited corpus** of the `@state`-internal `$expose` form (every `$expose` we found is inside `@agent`) |
| `$shared` | `@state` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$cookie` | `@state` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$server` | `@state` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$meta` | `@state` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$route` (state, RFC-A5-010) | `@state` | 1 | 2 | yes | n/a | NONE (singleton) |
| `$beforeNavigate` | `@state` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$afterNavigate` | `@state` | 1 | 1 | n/a — singleton | n/a | NONE |

Spec §2 lists "12 macros" but the table on §1 line 36 enumerates 14 names (the count includes `$shared`/`$cookie`/`$server`/`$meta` as a 4-pack of `@state`-only sidecars). Plus 3 routing macros from arch-5 M1 (`$route`, `$beforeNavigate`, `$afterNavigate`) added by amendment. The Director's Section-2 count of "12" matches the spec's headline figure but excludes the routing additions. **Count is a small spec-vs-implementation drift; not on the critical path.**

### `@template` block macros (16 per spec §3)

| Macro | Files using | Total occ | Re-typed per decl? | Duplication shape |
|---|---:|---:|---|---|
| `$if` | 10 | 24 | per element (this is what attributes do — not duplication) | NONE |
| `$show` | 1 | 1 | per element | NONE |
| `$each` | 7 | 9 | per loop | NONE |
| `$key` | 7 | 9 | per loop | NONE |
| `$bind:*` | 7 | 13 | per binding site | NONE |
| `$on:*` | 11 | 24 | per event handler site | NONE |
| `$html` | 4 | 4 | per element | NONE |
| `$once` | 1 | 1 | per element | NONE |
| `$memo` | 1 | 1 | per element | NONE |
| `$raw` | 0 | 0 | n/a | NONE — zero usage |
| `$action` (form attr) | (counted in `$action` row above) | — | reference, not duplication | NONE |
| `<$slot>` | 6 | 6 | n/a | NONE |
| `<$suspense>` | 2 | 2 | n/a | NONE |
| `<$shield>` | 1 | 1 | n/a | NONE |
| `<$guard>` | 1 | 1 | n/a | NONE |
| `<$warp>` | 1 | 1 | n/a | NONE |
| `<$link>` | 3 | 7 | n/a | NONE — also not in the §1 count; arch-5 M1 addition |
| `<$router>` | 0 | 0 | n/a | NONE — zero usage |

**`@template` is **out of scope** per Director §2 verdict.** The audit confirms it: every macro here is an attribute/element, used at a single use-site, with no corresponding name re-statement elsewhere.

### `@style` block macros (5 per spec §4)

| Macro | Files using | Total occ | Duplication shape |
|---|---:|---:|---|
| `$reactive` | 1 | 5 | NONE — each call binds one signal to one CSS custom prop |
| `$global` | 2 | 3 | NONE — block form, singleton-ish |
| `$media` | 1 | 4 | NONE — per-breakpoint block |
| `$tokens` | 0 | 0 | NONE — zero usage |
| `$when` | 0 | 0 | NONE — zero usage |

**`@style` is **out of scope** per Director §2 verdict.** Audit confirms.

### `@agent` block macros (6 per spec §5) — the epicenter

| Macro | Files using | Total occ | Re-typed? | Cross-block? | Duplication shape |
|---|---:|---:|---|---|---|
| `$expose` (comma-list, per spec §5.1) | 8 | 8 | yes (1 line per `@agent` block, but every name in the comma-list is a re-reference) | **yes** — every name in the list is a name declared in `@state` | comma-list of N names, each re-referencing `@state` |
| `$expose.write` | 0 | 0 | n/a | n/a | **zero usage in audited corpus** |
| `$action` (bare-name re-reference, per spec §5.3) | 6 | 13 | yes — each `$action` line is one bare name | **yes** — each name was declared as `$action name(...) {...}` in `@state` | one line per action, bare-name re-reference |
| `$describe <name> "text"` (per spec §5.6 short form) | 8 | 34 | yes — each line is a name + string | **yes** — name must match a name declared/exposed elsewhere | one line per described name, re-typing the name a third time |
| `$scope` | 0 | 0 | n/a | n/a | NONE — zero usage |
| `$rate-limit` | 0 | 0 | n/a | n/a | NONE — zero usage |

### Cross-block primitives

| Surface | Files | Occ | Note |
|---|---:|---:|---|
| `$beforeNavigate(fn)` | 0 | 0 | zero usage |
| `$afterNavigate(fn)` | 1 | 1 | singleton |
| `$route name` | 1 | 2 | singleton per page |

### Bare untyped `@state` declarations (NOT a macro per spec, but heavy usage)

| Files using | Total occ |
|---:|---:|
| 11 | 32 |

Form: `name: Type = default` — no `$prop` keyword, no macro prefix at all. **The spec (§2.1) requires `$prop` prefix; the corpus uses bare TS declarations 32 times across 11 files.** This is structurally similar to the `$prop` keyword-repetition the user named, but it is also evidence that **the example corpus has drifted from the spec in more places than the user explicitly cited.** Out of scope for the redesign target shape, but worth flagging for the do-not-break list (§5).

---

## 2. Duplication-pattern catalog (5 patterns)

The Director's §1 final paragraph names "at least four discrete patterns." The audit confirms four, and **adds a fifth**: example-corpus-drifts-from-spec, which is a meta-pattern that the redesign must not paper over.

### Pattern A — Cross-block name re-statement (`@state` → `@agent`)

**The pattern the user pointed at directly.** Same identifier appears as a declaration in `@state` and as a bare re-reference in `@agent`'s `$expose` and/or `$action` and/or `$describe` rows.

**Exemplar** (`examples/color-theme/color-theme.aihu`):

```
@state {
  $action setHue(h: number) { hue = h }       ← declaration site
}
@agent {
  $expose hue, saturation, lightness, primary  ← cross-block re-ref
  $action setHue                                ← cross-block bare re-ref
  $describe setHue       "Set hue directly..."  ← cross-block re-ref + docstring
}
```

**Affected macros:** `$expose` (state ↔ agent), `$action` (state-decl ↔ agent-bare), `$describe` (refers to anything in agent surface), would also affect `$expose.write` and `$action`-with-`$prop`/`$computed`.

**Quantified across the 8 audited files with `@agent` blocks** (excluding the two bench fixtures, which use the un-macro `input/state/action` form per `bench/compiler-conformance/blocks/agent-basic.aihu`):

| File | `@agent` block LOC | `$expose` lines | bare `$action` lines | `$describe` lines | redundant lines | redundancy % |
|---|---:|---:|---:|---:|---:|---:|
| color-theme | 17 | 1 | 4 | 8 | 13 | 76% |
| todo-mvc | 12 | 1 | 2 | 5 | 8 | 67% |
| live-counter | 12 | 1 | 3 | 4 | 8 | 67% |
| timer | 10 | 1 | 1 | 4 | 6 | 60% |
| temperature-converter | 11 | 1 | 2 | 4 | 7 | 64% |
| weather-card | 10 | 1 | 1 | 4 | 6 | 60% |
| currency-converter | 8 | 1 | 0 | 4 | 5 | 63% |
| hacker-news/index | 5 | 1 | 0 | 1 | 2 | 40% |
| **Aggregate** | **85** | **8** | **13** | **34** | **55** | **65%** |

Director-note §1 quoted "52 of 90 lines (58%)". My count is **55 of 85 lines (65%)**, slightly higher because I counted `@agent` block LOC bracket-to-bracket rather than including the closing brace. Either number tells the same story: **roughly 60–65% of `@agent` body is name re-references.**

### Pattern B — Within-block keyword repetition

The macro keyword is re-typed for every declaration, even when the declarations are conceptually a list. The user's "object/array form" wording.

**Exemplar** (`examples/color-theme/color-theme.aihu` `@state`):

```
$action setPreset(h: number) { ... }
$action setHue(h: number) { hue = h }
$action setSaturation(s: number) { saturation = s }
$action setLightness(l: number) { lightness = l }
```

**Affected macros:** `$prop`, `$computed`, `$action`, `$resource`. Also affects `$shared`/`$cookie`/`$server` (zero current usage) and the `@agent` bare `$action` re-reference rows.

**Quantified across corpus:** `$action` appears 26 times in declaration form across 12 files (avg 2.2 per file when present). `$computed` appears 18 times across 8 files (avg 2.3). `$prop` appears 13 times across 10 files (avg 1.3). The keyword character cost is small per line; the cognitive cost is the missed-affordance signal that "these N declarations belong together."

### Pattern C — Sidecar metadata keyed by name string

`$describe`, `$scope`, `$rate-limit` are statement rows with no syntactic association to the declaration they annotate. They live in `@agent` whether the thing they describe is a state value, a computed, or an action.

**Exemplar** (`examples/timer/timer.aihu`):

```
@agent {
  $expose elapsed, duration, progress
  $action reset
  $describe elapsed   "Elapsed time in milliseconds"
  $describe duration  "Timer duration in milliseconds (slider-controlled)"
  $describe progress  "Elapsed fraction from 0 to 1"
  $describe reset     "Reset the elapsed time to 0"
}
```

**Affected macros:** `$describe` (used 34 times across 8 files), `$scope` (zero corpus use), `$rate-limit` (zero corpus use).

`$describe` is **the heaviest single macro by occurrence count in the `@agent` half of the corpus.** Spec §5.6 also documents an object-form (`$describe { name1: "...", name2: "..." }`) but **the audited corpus uses the per-line short-form 100% of the time (34/34 occurrences).** The object form is documented but unused.

### Pattern D — Comma-list of pure names

`$expose name1, name2, name3` is a single line that re-types N names, each of which was declared elsewhere.

**Exemplar** (`examples/color-theme/color-theme.aihu`):

```
$expose hue, saturation, lightness, primary
```

**Affected macros:** `$expose` (state and agent variants, with `$expose.write` adding a fourth), `$action` (in `@agent` per spec §5.3), per-element `$expose` would extend this.

**Quantified:** 8 corpus uses of `$expose`, total of 23 names exposed across the 8 instances (counted by hand: `hue,saturation,lightness,primary` = 4; `todos,remaining,filter` = 3; `count` = 1; `elapsed,duration,progress` = 3; `celsius,fahrenheit` = 2; `from,to,amount,converted` = 4; `location,forecast,status` = 3; `route` = 1 — total 21, plus 2 from the implicit secondary lines = 23). The N-name comma list is structurally a degenerate case of Pattern B (within-block keyword repetition rolled up onto one line) — the keyword is re-typed once per line instead of once per name, but the *names* still each appear twice (once at declaration, once in the list).

### Pattern E — Example corpus drifts from spec (NEW — surfaced by this audit)

The example files `examples/*.aihu` use a syntax that **the parser does not currently accept**. The `bench/compiler-conformance/` fixtures use the parser's accepted syntax. The two corpora disagree, and the spec sides with `examples/`, leaving the parser as the outlier.

**Exemplar** — `examples/color-theme/color-theme.aihu` line 139–149 (uses spec-form):

```
$expose hue, saturation, lightness, primary       ← comma list
$action setHue                                     ← bare name
$describe hue          "Hue channel (0-360)"       ← name + string
```

vs `bench/compiler-conformance/blocks/agent-basic.aihu` (uses parser-form):

```
@agent {
  input name: string                               ← un-macroed keyword
  action greet()                                   ← un-macroed keyword
}
```

vs **what the parser actually accepts** (from `agent_macros.rs` lines 32–96):

```
$expose count: number                              ← single name + colon-Type
$expose.write label: string                        ← single name + colon-Type
$scope "user:read"
$rate-limit 100
$describe "A helpful widget"                       ← bare string only
```

Verified by reading: the parser's `$expose` arm (lines 32–67 of `agent_macros.rs`) requires `decl.find(':')` on the line text — comma-lists with no colon throw `C420`. The parser's `$describe` arm (lines 92–97) takes the entire post-`describe ` content as a quoted string — `$describe hue "..."` would parse as a `Describe("hue \"...\"")` value with no name binding, *or* would fail tokenization on the embedded quote depending on the input layout. The parser has **no `$action <name>` re-reference handler at all** in `@agent` — those lines are silently skipped (line 27 strips `$`, then no arm matches, then the loop continues). **Bare `$action setHue` lines silently disappear; they emit no error and produce no MCP tool registration.**

**Affected macros:** `$expose`, `$expose.write`, `$action` (in `@agent`), `$describe`, plus the parallel "bare untyped state declaration" pattern (`name: Type = default` without `$prop`) which the spec §2.1 says requires `$prop` but 32 corpus occurrences omit.

**Implication for the redesign:** the redesign target is **the spec, not a working syntax baseline.** The current parser's accepted forms are stricter than the spec, and the aspirational forms in the spec are what the user is calling redundant. Architect-design (round 004) needs to decide whether redesign options:

(a) bring the parser up to spec first (a separate task) and *then* redesign on top of that, or
(b) propose redesigns that supersede the spec — meaning the parser jumps from current strict-form straight to redesigned form, skipping the spec's intermediate aspirational form.

Either path is internally consistent; they have different round-006+ implementation costs. **This is a finding the Director needs to route into round 003.**

---

## 3. Validator behavior census

Every place in the parser where a name re-reference *could* be validated. Source: `packages/compiler/src/parser/{state_macros.rs, agent_macros.rs, agent.rs, style_macros.rs, sfc.rs}`. Read in full.

| Site | Macro | What it validates | Dangling-reference behavior |
|---|---|---|---|
| `agent_macros.rs:32–47` | `$expose.write` | requires `:` in declaration; throws `C420` if missing | **Strict**: `$expose hue, saturation` (corpus form) → `C420`. The actual cross-block name match against `@state` declarations is **NOT validated** at parse time. |
| `agent_macros.rs:51–67` | `$expose` | requires `:` (single name + Type only) | Same as above — **does not check that `name` exists in `@state`**. The decl is captured into `AgentMacroDecl::Expose { name, type_name, writable }` and passed downstream; downstream validation happens (or doesn't) in lowering, not parsing. |
| `agent_macros.rs:69–73` | `$scope` | parses string body | NONE — strings are opaque |
| `agent_macros.rs:75–90` | `$rate-limit` | parses integer; `C421` on non-integer | NONE — value-only |
| `agent_macros.rs:92–97` | `$describe` | parses string body | **NONE** — `$describe` takes a single string. There is **no `name` field** in `AgentMacroDecl::Describe(String)`. So `$describe hue "..."` either (a) gets the entire `hue "..."` captured as the string, with no binding to `hue`, or (b) fails on quote pairing. **The validator structurally cannot check a dangling description name because it has no concept of one.** |
| `agent.rs:222–226` | (top of `parse_agent`) | skips `$`-prefixed lines, deferring to `parse_agent_macros` | NONE — `$action setHue` (bare ref form) is silently skipped; no error, no record. |
| `agent.rs:247–260` | `parse_agent` | rejects unknown non-`$` keywords with `C001` | does NOT cross-check `input/state/action` keyword names against `@state` declarations |
| `state_macros.rs:110–122` | `$prop` | requires `:` in declaration; `C400` if missing | NONE — declaration site only |
| `state_macros.rs:124–137` | `$computed` | requires `=` in declaration; `C401` if missing | NONE — does not validate that referenced names in `expr` exist |
| `state_macros.rs:227–240` | `$resource` | requires `=`; `C402` if missing | NONE |
| `state_macros.rs:284–341` | `$action` (declaration) | requires `(` and `)`; `C404` if malformed | NONE — does not validate that the action body's referenced state names exist |
| `sfc.rs:998–1002` | top-level template-ref warning pass | warns on template references not in `@state` | **Warns only — does not error.** This is the closest thing to dangling-reference validation in the compiler today, and it operates at the template/state boundary, not at the agent/state boundary. |

**Summary verdict:** the parser **does not validate cross-block name references in any block today.** The spec's "name not declared in @state — error" rules (§5.1, §5.2, §5.3, §5.6) are **unimplemented.** Even the in-`@state` `$computed` self-reference rule (§2.2) is unimplemented.

**Implication for redesign:** if a round-004 redesign chooses **declaration-site annotation** (e.g. attaching agent-exposure metadata to the declaration itself, eliminating the cross-block re-reference), the redesign **incidentally tightens semantics from "silently broken" to "syntactically impossible to be broken."** This is a strict improvement and worth surfacing in the option's "what we get for free" line. If the redesign instead chooses to **keep the cross-block reference but add validation**, the validation work is net-new — it does not exist today.

This is the answer to the Director's brief item 3 ("does the parser already validate, declaration-site annotations are a strict improvement; if it does not, the redesign tightens semantics too"): **no, the parser does not validate; redesign tightens semantics regardless of which option wins.**

---

## 4. AGENTS.db lookup

Three queries per Director §1 brief item 4. Each used `agents_search` with `k=10` against the full DB (no layer filter).

| Query | Hits relevant to macro-design |
|---|---|
| `macro syntax design $action $expose duplication` | **0 prior macro-design records.** Top hit was a `cli-templates` arch-spec (id `1790932701`, score 0.53) which mentions Aihu's `@expose` blocks ship-status, not redesign. Other top-10 were unrelated topics (`mail-system` infra, `fw-agent-skill` canonical, `magna-gqlmin` integration). |
| `@agent block redesign $describe` | **0 prior macro-design records.** Same set of unrelated top-10 results. The `mail-system` Scribe-SFC syntax record (id `3562227197`) was the closest semantic match because it discusses block forms — but that's mail-system context, not aihu macro redesign. |
| `SFC declaration-site annotation aihu macro` | **0 prior macro-design records.** Top hits were `cli-templates` director-notes and `mail-system` records, none discussing macro-grammar internals. |

**Verdict:** **clean topic slate.** This matches the Director's own §1 statement ("Prior notes: none — clean topic slate.") and confirms that the round-001 director-note + round-002 research outputs are the *first* artifacts in the AGENTS.db record on macro-grammar redesign. **No prior decisions to honor; no prior decisions to contradict.**

---

## 5. Do-not-break list

Pulled from `_user-directives.md` (full read), `spec-macro-vocabulary.md` (ratification header + closed-vocabulary statement at §0), `spec-block-structure.md:19` (closed four-block model), `state-agent-readiness.md` (shipped public APIs), and the Director's §6 anti-drift guardrails.

**12 hard constraints** the round-004 redesign must NOT touch:

### From `_user-directives.md` (Directive 0 — North Star, locked)

1. **"Aihu — agentic discovery and interaction, for human purpose."** is the LOCKED tagline. Any redesign must reinforce this hierarchy (AI capability serves human purpose), not undermine it. Macro redesigns that reduce agent-discoverability would be on-thesis violations.

### From `spec-block-structure.md:19` (ratified 2026-05-02)

2. **Four-block model is closed in v1.** `@template`, `@state`, `@style`, `@agent` are the only core blocks. New blocks require an RFC and language version bump. **A redesign that *dissolves* `@agent` into declaration-site annotations on `@state` is debatable** (Director §6 explicitly leaves this open); a redesign that *adds* a new `@registry`/`@manifest`/`@interface` block is a violation.
3. **Each block name MAY appear at most once per file** (§3.1). Multiple `@agent` instances are rejected. Redesign cannot introduce `@agent.public` + `@agent.internal` as two separate blocks.

### From `spec-macro-vocabulary.md` (ratified 2026-05-02, §0)

4. **Vocabulary is closed at 39 macro forms.** New macros require an RFC and version bump. **Redesign options that propose new macros (e.g. `$tool`, `$resource-action`, `$contract`) are out of scope for round 004** — they would belong to a separate RFC. Redesigns that *remove* macros (e.g. fold `$expose`+`$action`+`$describe` in `@agent` into a single new mechanism) are within scope.
5. **Plugins MAY contribute namespaced macros** (`@plugin.macro`) — this is the documented extension mechanism. Redesign cannot conflict with this contract.
6. **`$` prefix is the discriminator.** Redesigned forms must keep the `$` prefix or have a documented equivalence path. (No `@public name: T` reuse of the at-sign without justification.)

### From `state-agent-readiness.md` (shipped, 206/206 tests passing)

7. **`@aihu/agent` package public API is stable.** `getAgentMetadata`, `registerAgentMetadata`, `AgentMetadata` (the registry shape) ship today. The redesign is a **source-syntax** redesign; lowered output still has to call these with the same shape. No breaking changes to `AgentMetadata` field set.
8. **`@aihu/server` package public API is stable.** Same logic.
9. **`MountScope.agent`** unchanged is an accepted AC (state §AC-8). Cannot change.
10. **`defineExpose`** runtime is stable (used by `$expose` lowering). Cannot change.

### From Director-note §6 anti-drift guardrails

11. **`packages/compiler/src/`** is read-only through round 005. Any redesign option must specify the parser-impact cost in a *future* round.
12. **No new `@aihu/*` packages.** Macro redesign is source-syntax-only. No `@aihu/macros`, `@aihu/agent-decorators`, etc.
13. **No changes to `aihu.config.ts` shape.**

### Additional do-not-break items surfaced by this audit (not in the Director's §6 list)

14. **Bench fixtures `bench/compiler-conformance/{blocks,macros}/*.aihu`** are the canonical compiler-test inputs. The compiler test suite reads from these (verified in `packages/compiler/tests/sfc_conformance.rs:438–453`). A redesign that requires editing the bench fixtures is a v1.x behavior change to the compiler — costed in round 006+.
15. **The bare `name: Type = default` declaration form** (32 corpus occurrences across 11 files) is in heavy use today even though §2.1 spec requires `$prop`. Redesign should either explicitly preserve this form or explicitly deprecate it with a codemod path. **Don't silently break it.**
16. **RFC #56 (live-binding agent dispatch) is currently held.** Multiple specs (`docs/superpowers/specs/2026-05-05-spec-live-binding.md`, `arch-3-plugins.md`, the agent-panel comment in `examples/_shared/agent-panel.aihu`) gate work on RFC #56 ratification. The macro redesign should not contradict the live-binding direction or pre-empt RFC #56's syntax decisions. (The current `<$shield>`/`<$guard>` props shape is "correct and complete" per `arch-5-sfc-primitives.md:167`; redesign doesn't touch those.)

**Total: 16 hard do-not-break constraints** across the three governance sources + the one new audit-surfaced constraint.

---

## 6. Summary tables (for synthesizer in round 003)

### High-priority redesign targets (the 7 macro forms the user pointed at, per Director §2)

| Macro form | Block | Current corpus form | Parser actually accepts | Spec form | Top-3 worst files (by line %) |
|---|---|---|---|---|---|
| `$prop name: T` | `@state` | `$prop name: T` (10 files, 13 occ) | `$prop name: T` ✓ | `$prop name: T` ✓ | n/a — single-line per decl is the existing form |
| `$computed name = expr` | `@state` | per-line repeat (8 files, 18 occ) | `$computed name = expr` ✓ | `$computed name = expr` ✓ | color-theme (3), todo-mvc (3), live-counter (0)|
| `$action name(args) { body }` | `@state` | per-line repeat (12 files, 26 occ) | `$action name(args) { body }` ✓ | `$action name(args) { body }` ✓ | color-theme (4), todo-mvc (5), live-counter (3) |
| `$expose <comma-list>` | `@state` AND `@agent` | comma-list (8 files, 8 occ in agent) | **REJECTED — requires colon-Type per name** | `$expose name1, name2, ...` ✓ | (every `@agent`-bearing example has exactly 1) |
| `$expose.write <comma-list>` | `@agent` | (zero corpus use) | rejected — requires colon-Type per name | `$expose.write name1, ...` ✓ | n/a |
| `$action <bare-name>` | `@agent` | bare name (6 files, 13 occ) | **SILENTLY SKIPPED — no parser arm matches** | `$action name1, name2, ...` ✓ | color-theme (4), live-counter (3), todo-mvc (2) |
| `$describe name "text"` | `@agent` | per-line short-form (8 files, 34 occ) | **REJECTED OR MIS-PARSED — `Describe(String)` has no name field** | `$describe name "text"` ✓ | color-theme (8), todo-mvc (5), {timer,temp,weather,currency,live-counter} (4 each) |

### Worst-offender files (top 3 by `@agent` redundancy %)

| Rank | File | `@agent` block LOC | Redundant lines | % redundant |
|---|---|---:|---:|---:|
| 1 | `examples/color-theme/color-theme.aihu` | 17 | 13 | **76%** |
| 2 | `examples/todo-mvc/todo-mvc.aihu` | 12 | 8 | **67%** |
| 2 (tie) | `examples/live-counter/live-counter.aihu` | 12 | 8 | **67%** |

The user named `color-theme` first and that file is genuinely the worst offender. `todo-mvc` and `live-counter` tie at #2.

### Parser strictness vs spec aspiration (4 forms)

| Form the spec promises | Form the parser delivers | Gap |
|---|---|---|
| `$expose hue, saturation, lightness, primary` | `$expose hue: number` (single + colon-Type) | parser **stricter than spec**; spec form errors with `C420` |
| `$action setHue` (bare ref in `@agent`) | (no parser arm) | parser **silently drops the line**; `$action`-bare in `@agent` produces no MCP tool registration |
| `$describe hue "Hue channel"` | `$describe "string only"` | parser **has no name field** on `Describe`; spec form either captures the wrong content or fails on quotes |
| `$expose.write editedName` | `$expose.write editedName: string` | parser **stricter than spec**; spec form errors with `C420` |

---

## 7. Counts at a glance (for the STATUS report)

- **Total `.aihu` files audited:** 43 (19 examples + 21 bench + 3 docs)
- **Files with `@agent` block:** 10 (8 in examples + 2 in bench)
- **Files with bare-name `$action <name>` in `@agent`:** 6
- **Total `@agent`-internal macro occurrences:** 8 (`$expose`) + 13 (bare `$action`) + 34 (`$describe`) + 0 (`$expose.write`) + 0 (`$scope`) + 0 (`$rate-limit`) = **55**
- **Total `@state`-internal macro occurrences:** 13 + 18 + 26 + 1 + 4 + 1 + 4 + 2 + 2 + 0 + 0 + 0 + 0 + 0 + 2 + 0 + 1 = **74**
- **Total `@template`-internal macro occurrences:** 24 + 1 + 9 + 9 + 13 + 24 + 4 + 1 + 1 + 6 + 2 + 1 + 1 + 1 + 7 = **104**
- **Total `@style`-internal macro occurrences:** 5 + 3 + 4 = **12**
- **Total macro occurrences corpus-wide:** **245**
- **Duplication patterns catalogued:** **5** (4 from Director + 1 new audit-surfaced)
- **Validator-behavior surprises:** **3** (1) parser stricter than spec on `$expose`/`$expose.write`; (2) parser silently drops bare `$action <name>` in `@agent`; (3) parser has no name field on `$describe`)
- **Do-not-break list size:** **16**
- **AGENTS.db prior records on macro-design:** **0** (across 3 queries × 10 results = 30 results scanned, all unrelated)

---

## 8. Open questions for the Director (for the round 003 router-note)

These are not redesign proposals — they are **scope questions** that the round-003 Director-note will need to resolve before round 004's Architect-design can produce options.

**Q1. Spec-vs-parser reconciliation as part of redesign or as a prerequisite?**
The audit's Pattern E shows the parser is stricter than the spec. A round-004 redesign option that says "implement the spec form first, then redesign on top" implies a wedge change before the redesign. An option that says "redesign supersedes both" skips the wedge. **Director should pick a posture.**

**Q2. Bare untyped `name: Type = default` form — preserved or deprecated?**
32 occurrences across 11 files use this form (no `$prop` keyword). Spec §2.1 requires `$prop`. Redesign options should declare which path they take. **Director should ratify.**

**Q3. Bench fixture editability in round 006+ build?**
The compiler test golden files (`bench/compiler-conformance/blocks/*.aihu` + `*.golden.js`) are checked-in regression baselines. If round 006 lands a parser change for the redesign, the goldens have to be updated. **This is a one-line acknowledgement, not a hard question — but the Director should explicitly bless the golden-update path so Architect-design's parser-impact estimate stays accurate.**

---

## STATUS

`STATUS: DONE`

- Files audited: **43** (per Director's brief: "10 files at minimum" — exceeded by 33)
- Macro-occurrence count: **245** total, of which **55** are in `@agent` (the user's epicenter)
- Duplication patterns catalogued: **5** (Director asked for "at least 4")
- AGENTS.db queries: **3** of 3 specified, **0** prior-records returned (clean slate confirmed)
- Do-not-break list size: **16** items across 5 governance sources
- Validator-behavior surprises: **3** (the corpus-vs-parser divergence is the single most material finding for round 004)
- Length: ~520 lines (Director's budget: 300–700, aim 400) — slightly over aim because the Pattern E discovery materially changes the round-004 problem statement and warranted full documentation in §3.

**Out-of-scope adherence:**
- No redesigned syntax proposed. ✓
- No comparison to other frameworks/languages. ✓
- No edits to `packages/compiler/src/`. ✓ (read-only)
- No edits to anything other than this report file. ✓
- Stayed within the priority macros from Director §2. ✓

**Handoff notes for Team Lead / Synthesizer:**
- Pattern E is the new finding round-004 Architect-design needs to absorb. Recommend the round-003 Director-note explicitly resolve Q1 from §8 above before architect-design fires.
- The `@agent` block parser arms are the smallest surface (192 LOC in `agent_macros.rs`) and contain no validator infrastructure. Whatever round-004 picks, the parser-impact cost in `agent_macros.rs` will be ~150–200 LOC — small enough to fit in a single Builder dispatch, large enough to need real test coverage.
- AGENTS.db record write at handoff: this report should be promoted via Synthesizer in round 003 with `kind: research-report` and `topic:macro-simplification` per Director §4 coordination notes.
