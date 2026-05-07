# Macro Vocabulary v2 — Object-literal Collection-Form

**Status:** RATIFIED 2026-05-05 (round 006 build authorization)
**Spec version:** v2
**Author:** Builder B6.1 · **Last updated:** 2026-05-05
**Supersedes (in v1 spec `2026-05-02-spec-macro-vocabulary.md`):** §1 vocabulary table for the 6 changing macros; §2.1 (`$prop`), §2.2 (`$computed`), §2.3 (`$resource`), §2.4 (`$effect`), §2.7 (`$action`), §2.8 (`$lifecycle.{mount,dispose}`); §5.1 (`$expose`), §5.2 (`$expose.write`), §5.3 (`$action` agent), §5.6 (`$describe`).
**Preserved from v1 (unchanged):** §2.5 (`$effect.on`), §2.6 (`$watch`), §2.9–§2.13 (`$shared`/`$cookie`/`$server`/`$meta`/state-`$expose` LOW), §3 `@template` (16 macros), §4 `@style` (5 macros), §5.4 (`$scope`), §5.5 (`$rate-limit`), §1.1 disambiguation principles.
**Companion canonical example:** `examples/_shared/macro-test.aihu` (137 lines, locked grammar).
**References:** `.team/macro-simplification/director-note-001.md` §3 (AC-1..AC-6); `.team/macro-simplification/director-note-003.md` (round 006 brief); `.team/macro-simplification/option-4-evaluation.md` §4.4–§4.8; `.team/macro-simplification/codemod-dryrun.md` §2.

**Abstract.** v2 collapses six `@state`-side macro families (`$prop`, `$computed`, `$action`, `$effect`, `$resource`, `$lifecycle`) into a single object-literal **collection-form**: each macro keyword takes ONE object whose keys are entry names and whose values are either bare function expressions (implicit handler/value/callback) or wrapped metadata-bag object literals. `@agent` is reshaped to a vestigial cross-cutting block holding only `$scope` and `$rate-limit`; `$expose`, `$expose.write`, agent-`$action`, and `$describe` are removed in favor of per-name `expose:` / `describe:` keys on the corresponding `@state` collection entry. Pattern-E path (a): parser, runtime lowering, and example corpus all converge on this form. Hard-cut migration: v1 syntax is rejected with error code **C440** pointing at the codemod.

---

## §1 — Scope and non-scope

**In scope.** The 6 changing `@state` macros: `$prop`, `$computed`, `$action`, `$effect`, `$resource`, `$lifecycle` (covers `mount`/`dispose`). The `@agent` block reshape: removal of `$expose`, `$expose.write`, agent-bare-`$action`, `$describe`; retention of `$scope`, `$rate-limit`. Pattern-E reconciliation per Architect §4.8 (path (a)).

**Out of scope (preserved from v1).** `@template` (16 macros), `@style` (5 macros), `@route` block. Other `@state` macros: `$watch`, `$effect.on`, `$shared`, `$cookie`, `$server`, `$meta`, `$route` (state form), `$beforeNavigate`, `$afterNavigate`, state-`$expose` (LOW). Public package APIs (`@aihu/agent`, `@aihu/runtime`, `@aihu/arbor`, `@aihu/signals`, `@aihu/agent-readiness`); AC-6 forbids changes, only `registerAgentMetadata` payload **shape** may reshape. For everything not enumerated in-scope, **v1 spec remains authoritative.**

---

## §2 — The collection-form grammar

### §2.1 — Outer shape

Every changing macro takes:

```
$<macro>: { <name>: <entry-value>, <name>: <entry-value>, ... }
```

`<macro>` ∈ { `$prop`, `$computed`, `$action`, `$effect`, `$resource`, `$lifecycle` }. The macro keyword appears **at most once per `@state` block** (Architect §4.4 "each macro-keyword appears at most once"; Director-3 §1.3 (I.2) — collection-keyed shape is locked, the dryrun's per-line `$computed visible { value: ... }` form is **superseded**). The body is a JS object literal; trailing comma permitted; single-entry collections permitted; empty collections permitted but parser-warned.

### §2.2 — Bare/wrapped entry-value duality

Each `<entry-value>` is either:

- **Bare** — a function expression. Implicit semantics: the function IS the entry's running code (handler / value-thunk / callback). Used when no metadata is present.
- **Wrapped** — a JS object literal with metadata keys (`describe`, `expose`, `default`, `value`, `handler`, `on`, optional `type`). Used when metadata coexists with the running code.

**Emergent rule** (lifted verbatim from canonical example header lines 20–22 + Director-3 §1.1):

> The value-side is the running code; metadata wraps when present. Bare entry-value-is-function = implicit handler/value/callback; wrap in object literal with explicit `handler:` / `value:` key when metadata coexists.

### §2.3 — The closed list of always-bare-when-anonymous macros

Side-effect callbacks at framework hook points share one rule: **bare function-as-value when anonymous OR when named-without-metadata; object-keyed wrapped form when named-with-metadata** (e.g., `on:` deps list, `describe:`, `expose:`).

The closed list of `always-bare-when-anonymous` macros (per Director-3 §1.1 and dryrun PC-1.1.A) is:

- `$lifecycle.mount`
- `$lifecycle.dispose`
- `$beforeNavigate` (out of v2 redesign scope; cited so codemod has a closed pattern-match set)
- `$afterNavigate` (likewise)
- `$effect` (anonymous form per §2.5)

### §2.4 — Bare/wrapped duality table

| Macro | Bare allowed? | Wrapped allowed? | Carve-out |
|---|---|---|---|
| `$prop` | **No** — always wrapped (no running code to imply). | Yes (always). | Resolves dryrun PC-1.1.B / PC-1.3.A path (a). |
| `$computed` | Yes (bare = value-thunk). | Yes (when metadata present). | D.5: explicit thunk ALWAYS — bare form is `name: () => expr`, never `name: expr`. |
| `$action` | Yes (bare = handler). | Yes (when metadata present). | D.2. |
| `$effect` | Yes (bare named OR anonymous via §2.5). | Yes (when `on:` / metadata present). | D.4 + Q.B-1 (a). |
| `$resource` | Yes (bare = fetcher value-thunk). | Yes (when metadata present). | Same shape as `$computed`. |
| `$lifecycle` | **Always bare** (per entry). | **Forbidden.** | D.3. |

### §2.5 — Anonymous `$effect`

Anonymous `$effect` is expressed as the macro keyword taking a single function expression directly (Q.B-1 (a)):

```
$effect: () => { /* body */ }
```

This is structurally distinct from `$effect: { ... }` (the named-entries collection).

**Multiplicity (NORMATIVE):** A `@state` block MAY contain at most ONE `$effect: () => { ... }` anonymous-form line AND at most ONE `$effect: { ... }` named-collection line. They MAY coexist as separate top-level statements within `@state`. For multiple anonymous effects, authors SHALL use the named-collection form with one entry per effect. Two `$effect: () => {...}` lines in the same `@state` block is a parse error (B6.3 to assign code; recommend distinct from C440).

---

## §3 — Per-macro grammar

### §3.1 — `$prop`

**Shape.** `$prop: { <name>: { <prop-key>, ... }, ... }`. Bare form **forbidden**. Valid keys: `describe?`, `expose?`, `default?`, `type?`. Required: at least ONE of `default` or `type` MUST be present. Forbidden: `value`, `handler`, `on`.

**Type inference (D.1).** TS infers from `default:`. The `type:` key is the opt-in fallback. Inference is **insufficient** (and `type:` REQUIRED) when: `default` absent; `default: null` (would infer `null`, not `T | null`); `default: undefined`; `default: []` (infers `never[]` — use `type: T[]`); `default: {}`; or when narrowed-union desired but default is single-literal that would widen. Codemod heuristic per dryrun PC-1.2.J: when uncertain, **emit `type:` to preserve original annotation**.

**Lowering (byte-identical to v1 per AC-6).** `let <name> = <default>; defineExpose({ <name>, set <name>(v) { <name> = v } })` when `expose.write`; `defineExpose({ <name> })` when `expose.read` only; no `defineExpose` when `expose` absent. `registerAgentMetadata` payload reshape per Q.B-2 (a).

**Canonical example** (`examples/_shared/macro-test.aihu` lines 29–33):

```aihu
$prop: {
  hue: { default: 215, describe: 'Hue channel (0-360)', expose: { read: true, write: true } },
  // ... saturation, lightness ...
}
```

### §3.2 — `$computed`

**Shape.** `$computed: { <name>: <bare-thunk> | <wrapped>, ... }`. Bare: `name: () => expr`. Wrapped: `{ value: <thunk>, describe?, expose? }` — `value` REQUIRED; forbidden: `default`, `handler`, `on`, `type`.

**Type inference.** TS infers from the `value:` thunk's return expression. Insufficient when body returns `null`/`undefined`/empty literal — annotate the thunk return type inline (`value: (): T[] => []`). The `type:` key is **NOT** valid for `$computed` (use inline thunk return-type annotation instead — D.1 escape lives TS-side for value-bearing macros).

**Lowering.** `const <name> = computed(() => <expr>)`; `defineExpose({ <name> })` when exposed.

**Canonical example** (lines 35–45, mixed bare + wrapped):

```aihu
$computed: {
  primary: { describe: '...', expose: { read: true }, value: () => `hsl(${hue} ${saturation}% ${lightness}%)` },
  onPrimary: () => lightness < 60 ? '#ffffff' : '#111111',
  surface:   () => `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`,
}
```

### §3.3 — `$action`

**Shape.** `$action: { <name>: <bare-handler> | <wrapped>, ... }`. Bare: `name: (args) => { body }`. Wrapped: `{ handler: <fn>, describe?, expose? }` — `handler` REQUIRED.

**Type inference.** TS infers parameter and return types from the handler signature. Authors SHOULD annotate parameters explicitly (canonical example line 51: `handler: (h: number) => ...`); return type inferred unless `async` body returns multi-shape branches.

**Lowering.** `function <name>(<args>) { <body> }`; `defineExpose({ <name> })` when exposed.

**Canonical example** (lines 47–72):

```aihu
$action: {
  setPreset: { describe: '...', expose: { read: true, write: true }, handler: (h: number) => { hue = h; saturation = 70; lightness = 55 } },
  // ... setHue, setSaturation, setLightness ...
}
```

### §3.4 — `$effect`

**Shape (named collection).** `$effect: { <name>: <bare-callback> | <wrapped>, ... }`. Bare: `name: () => { body }` — auto-tracks deps. Wrapped: `{ value: <thunk>, on?: <deps-array>, describe?, expose? }` — `value` REQUIRED.

**Shape (anonymous).** `$effect: () => { body }` per §2.5. Macro keyword takes a single function directly; not a collection.

**Type inference.** Effects produce `void`; runtime ignores return value. `on:` deps array entries are signal references; TS infers from imported signal symbols.

**Lowering.** `effect(() => { <body> })` — bare or wrapped, deps auto-tracked or explicit per `on:`.

**Canonical example** (lines 86–94, commented stretch — substance authoritative):

```aihu
$effect: {
  logData: () => { console.log(data()) },           // bare named — auto-tracks
  updateList: { on: [data], value: () => { updateList(data()) } },   // wrapped
}
$effect: () => { persist(state) }                    // anonymous (parallel to $lifecycle)
```

### §3.5 — `$resource`

**Shape.** `$resource: { <name>: <bare-thunk> | <wrapped>, ... }`. Bare: `name: () => fetcher`. Wrapped: `{ value: <fetcher-thunk>, describe?, expose? }` — `value` REQUIRED.

**Type inference.** TS infers from fetcher return. `Promise<T>` resolves to `T | undefined` until ready. Annotate inline if `T` unrecoverable.

**Lowering.** `const <name> = createResource(() => <fetcher>)`; `defineExpose({ <name> })` when exposed.

**Canonical example** (lines 78–84, commented stretch):

```aihu
$resource: {
  data: () => fetchUsers(),                         // bare
  user: { describe: 'Current user', expose: { read: true }, value: () => fetchUser(userId) },
}
```

### §3.6 — `$lifecycle`

**Shape.** `$lifecycle: { mount?: <bare-fn>, dispose?: <bare-fn> }`. ONLY `mount` and `dispose` keys are valid. Each value is **always** a bare function expression. **Wrapped form forbidden** (D.3). Forbidden keys on entries: `describe`, `expose`, `value`, `handler`, `on`, `default`, `type`.

**Type inference.** Callbacks return `void`; no annotation required.

**Lowering.** `lifecycle.mount(() => { <body> })` and `lifecycle.dispose(() => { <body> })` — byte-identical to v1.

**Canonical example** (lines 96–99, commented stretch):

```aihu
$lifecycle: {
  mount:   () => initializeWidget(),
  dispose: () => cleanup(),
}
```

---

## §4 — The `@agent` block

`@agent` survives as a **vestigial cross-cutting block**. All per-name metadata lives inside `@state`'s collection-form macros. `@agent` holds only what cannot be attached to a single declaration.

**Grammar (preserved from v1).**

```
@agent {
  $scope <string-literal>
  $rate-limit <integer-literal>
}
```

`$scope` — single quoted string. `$rate-limit` — positive integer (req/min). Each MAY appear at most once. Both optional; the entire block MAY be omitted.

**Removed from v1 (now C440 errors).**

| v1 form | v2 disposition |
|---|---|
| `$expose <name>, ...` | C440. Replace with per-name `expose: { read: true }` on the `@state` entry. |
| `$expose.write <name>, ...` | C440. Replace with `expose: { read: true, write: true }`. |
| `$action <bareName>` | C440. Replace with `expose: { read: true, write: true }` on the `$action` entry. |
| `$describe <name> "<text>"` | C440. Replace with per-name `describe: '<text>'` on the `@state` entry. |

**Lowering (Q.B-2 (a) reshape).** `registerAgentMetadata({...})` payload **shape** MAY shift from a flat list-of-records (`[{kind:'expose', name:'foo'}, {kind:'describe', name:'foo', text:'...'}]`) to a per-name keyed object (`{ foo: { describe: '...', expose: { read: true } } }`), provided every name + every metadata field present in BEFORE is present in AFTER (no synthesis, no drop). `$scope` and `$rate-limit` lowering is **byte-identical** to v1.

---

## §5 — Pattern-E reconciliation

Per Architect §4.8, **path (a) — supersede both spec and examples**:

- The v2 spec is the source of truth.
- The parser (B6.3) jumps directly from v1 strict-form to v2 collection-form. No interim "fix the parser to accept v1 aspirational form first" step.
- The example corpus and bench fixtures are migrated via the codemod (B6.2 + B6.4). No file in the repo retains v1 syntax post-B6.4.
- Spec → parser → examples directionality: spec authoritative; parser conforms to spec; examples conform to parser via codemod.

---

## §6 — Migration and grandfathering (HARD-CUT)

Per Director-3 §2.3:

- The v2 parser **rejects** v1 syntax with error code **C440 — old-spec macro form rejected; run `packages/compiler/codemods/macro-simplification/migrate.ts` to upgrade.**
- The migration codemod is delivered as B6.2; B6.4 sweeps the codemod against every `.aihu` in the repo BEFORE the parser change merges. CI never sees a v1-syntax file against a v2-only parser (B6.3 + B6.4 land together).
- **No v1 fallback** in the v2 parser. **No deprecation period.** aihu pre-v1.0; clean break is in-bounds.

---

## §7 — Acceptance criteria

Verbatim from `director-note-001.md` §3, with AC-6 reworded per Director-3 §1.2 (Q.B-2 (a)).

**AC-1 — DRY identifier rule.** Each `$prop`/`$computed`/`$action`/`$expose`/`$describe` target identifier appears in source exactly **once** unless overriding default behavior. *Test:* `grep -c '\bsetHue\b' file.aihu` MUST equal 1 for every named entity in `examples/_shared/macro-test.aihu`. *Target:* 1 occurrence per name as a declaration site.

**AC-2 — Cold-read intelligibility.** A reader with no aihu framework knowledge can guess the role of any single macro line correctly, given only the line and its surrounding block label. *Test:* per-macro `§3.X` canonical examples cold-readable as plain JS object idioms; no new positional/punctuation conventions beyond "the outer macro takes a collection."

**AC-3 — `color-theme.aihu` LOC reduction.** The `@agent` block in `examples/color-theme/color-theme.aihu` shrinks from 17 lines to **5 lines or fewer.** *Test:* `awk '/^@agent/,/^}/' file.aihu | wc -l` ≤ 5. *Target:* 60% reduction (hard); 70%+ (soft).

**AC-4 — Macro-name count.** Total distinct macro-name count across the four blocks does not grow above 39, ideally drops below 35. *Test:* count unique names. *Target:* 39 → **36** (3 removed: agent-`$expose`, agent-`$expose.write`/-action-bare, `$describe`) per Architect §4.6.

**AC-5 — Codemod-expressibility.** Deterministic AST transform from old to new syntax in **≤ 300 LOC**, no human judgement except where old syntax was ambiguous. *Test:* `wc -l < packages/compiler/codemods/macro-simplification/src/migrate.ts` ≤ 200 (Architect §4.4 estimate ~150; 50-line buffer).

**AC-6 (revised, post Q.B-2 → a).** **Byte-identical** for `@state`-side lowering — the JS calls emitted for `defineExpose`, `effect`, `computed`, and `lifecycle` (mount/dispose) are byte-equivalent to today's compiler output. **Semantically equivalent** (per-name reshape allowed) for `@agent` metadata payload — the runtime `registerAgentMetadata` call shape may shift from a flat list-of-records (`[{kind:'expose'}, {kind:'describe'}]`) to a per-name keyed object (`[{kind:'expose', describe:'...'}]`), provided every name + every metadata field present in the BEFORE source is present in the AFTER payload. *Test:* per-file diff of lowered JS BEFORE-vs-AFTER MUST be byte-identical for `@state`-side calls; `registerAgentMetadata` payload MAY differ in record-shape but MUST contain every name + every field from BEFORE.

---

## §8 — Resolutions of MECHANICAL and JUDGMENT paper-cuts

Each row resolves a paper-cut from `codemod-dryrun.md` §2 at the spec level. Codemod (B6.2) and parser (B6.3) MUST conform.

### §8.1 — MECHANICAL (codemod-internal)

| ID | Spec resolution |
|---|---|
| **PC-1.1.C** (line-width math) | **DEFAULT:** Codemod computes line width AFTER current indent; falls back to multi-line on overflow. Always tries inline first per D.7 (≤3 keys + ≤100 chars post-indent). |
| **PC-1.1.D** (`$route` bare passthrough) | `$route` is OUT OF SCOPE for v2 (§1.2). Codemod MUST leave bare `$route` untouched. |
| **PC-1.2.G** (`$expose name { describe }` 1-key inline math) | **DEFAULT:** Same as PC-1.1.C — inline. |
| **PC-1.2.H** (comment attribution) | **DEFAULT:** Codemod MUST preserve trailing comment-block attachments to next-decl. AST-aware implementation required; line-based string manipulation insufficient. |
| **PC-1.2.J** (TS-widening-aware `type:` drop) | **DEFAULT:** Codemod MUST err on preserving the original annotation. Drop only when default unambiguously carries the same TS type per §3.1 enumerated cases. |
| **PC-1.4.A** (multi-line type literal flatten-then-rewrap) | **DEFAULT:** Codemod MUST flatten multi-line type literals first; THEN apply D.7. Order mandatory. |
| **PC-1.4.B** (76-char inline form) | **DEFAULT:** Same as PC-1.2.G — inline. |

### §8.2 — JUDGMENT (multiple valid choices; spec picks default)

| ID | Spec resolution |
|---|---|
| **PC-1.1.A** (`$afterNavigate` shape vs `$lifecycle`) | **DEFAULT:** Closed list of always-bare-when-anonymous per §2.3; codemod leaves untouched (out of v2 redesign scope per §1.2). |
| **PC-1.1.B** (`$prop` always-wrapped vs colon-form sugar) | **DEFAULT:** Always-wrapped (path (a)). §2.4 + §3.1 lock this — bare form FORBIDDEN for `$prop`. |
| **PC-1.1.E** (block comments attachment) | Same as PC-1.2.H — AST-level attachment. |
| **PC-1.2.A** (D.5 thunk-wrap density loss) | **DEFAULT:** Thunk-wrap is mandatory. Codemod does not relitigate; spec accepts the density cost. Bare form `name: () => expr` is the canonical short form (§3.2). |
| **PC-1.2.B** (was BLOCKER: anon `$effect` synthesis) | **RESOLVED via Q.B-1 (a) + §2.5.** Anonymous form is `$effect: () => { body }` — macro-keyword takes single function. No name synthesis. |
| **PC-1.2.F** (`$effect` vs `$lifecycle` asymmetry) | **RESOLVED via Q.B-1 (a) + §2.3.** Both in always-bare-when-anonymous closed list. Carve-out healed. |
| **PC-1.2.I** (`$computed` thunk references another `$computed`) | **DEFAULT:** Identifier resolution unchanged from v1. The thunk wraps the EXPRESSION; name lookup is v1's (no `()` insertion synthesized). |
| **PC-1.3.A** | Same as PC-1.1.B — always-wrapped. |
| **PC-1.3.B** (85-char `$computed` inline fit) | **DEFAULT:** Same as PC-1.2.G — inline. |
| **PC-1.4.C** (`@agent` merge naive-reader benefit) | **CONFIRMED.** Per AC-2; merged form is the canonical AFTER. Note: in v2 the `@agent`-side `$expose`/`$describe` are eliminated entirely (C440 path); the merge target is the `@state` entry's per-name `describe:` / `expose:`. |

### §8.3 — PARSE-FAIL (pre-existing v1 drift; codemod incidentally resolves)

| ID | Spec resolution |
|---|---|
| **PC-1.2.C** (`$expose name1, name2`) | C440. Codemod transforms BEFORE parser sees these forms (B6.4 ordering). |
| **PC-1.2.D** (`$action <bareName>` agent) | C440. Same path. |
| **PC-1.2.E** (`$describe name "text"`) | C440. Same path. |

---

## §9 — Open issues / known gaps

One ambiguity surfaced and resolved in-spec; one design-constraint disposition surfaced for downstream awareness. **No new BLOCKER discovered.** Round 006 build can proceed.

**§9.1 — Resolved-in-spec (was potentially BLOCKER): anonymous `$effect` multiplicity.** JS object-literal syntax forbids duplicate keys, so `$effect: () => {}` and `$effect: { ... }` cannot share a single line. **Resolution:** the two forms are separate top-level statements within `@state` (§2.5); multiple anonymous effects MUST use the named-collection form. Codemod (B6.2) and parser (B6.3) MUST handle BOTH forms appearing in the same `@state` block (one anonymous + one named-collection are both legal); a `@state` block with TWO anonymous `$effect:` lines is a parse error (B6.3 to assign code; recommend a code distinct from C440).

**§9.2 — Design constraint surfaced (NOT a BLOCKER): `expose:` value form locked.** Canonical `examples/_shared/macro-test.aihu` uses object form `{ read: true, write: true }` (D.6). Architect §4.2.4 / §4.9 Q-EXPOSE discussed an alternative `'rw'` string-discriminant form; canonical example LOCKED the object form. Codemod B6.2 MUST emit the object form, never the string form. Parser B6.3 MUST accept ONLY the object form.

---

*End of v2 spec.*
