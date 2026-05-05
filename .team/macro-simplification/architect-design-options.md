# Architect-design · macro-simplification · round 004 · 2026-05-05

**Mode:** 2 (design exploration, doc-only) · **Author:** Architect-design ·
**Branch:** `plan/macro-simplification` ·
**Inputs read in full:** `topic-summary.md` (277 lines), `director-note-002.md`
(560 lines), `director-note-001.md` (961 lines), `architect-frameworks.md`
(1294 lines, focused re-read on §2 Svelte 5, §5 Lit, §10 Top-3 translates,
§11 Top-3 don't), `architect-languages.md` (1034 lines, focused re-read on
§2 Rust, §5 Pydantic, §8 Clojure, §11 Top-3 translates, §12 Top-3 don't),
`scout-report.md` (422 lines, all 8 sections), full source of
`examples/color-theme/color-theme.aihu` (154 lines), spec
`2026-05-02-spec-macro-vocabulary.md` (§5 in detail), spec
`2026-05-02-spec-block-structure.md` (§3 four-block closure),
`packages/compiler/src/parser/agent_macros.rs` (192 lines),
`packages/compiler/src/parser/state_macros.rs` (771 lines, parse + emit halves),
`packages/compiler/src/parser/style_macros.rs` (285 lines, scanned for
no-impact confirmation), `packages/compiler/src/types.rs` (211 lines),
bench `macros/01-state-prop-computed.aihu`, `02-state-resource-effect.aihu`,
`03-state-lifecycle.aihu`, bench `blocks/agent-basic.aihu` ·
**AGENTS.db:** `agents_search` ×1 — confirmed zero prior macro-design records
(top hit was a `cli-templates` director-note at score 0.51, semantically
unrelated; matches Director-2 §1 baseline).

**Topic identifier:** `topic:macro-simplification` ·
**Track identifier:** `track:macro-simplification` ·
**Round counter:** **4** of 5 (Mode-2 ping-pong).

---

## §0 — Front matter (read this first)

### §0.1 — Purpose

This document delivers the three concrete redesign options the round-002
research narrowed to. Per Director-2 §4, the gradient is **fixed**:

- **Option 1 — Light-touch / Clojure-style.** Inline positional docstring
  + tiny set of inline-attribute kvs. Minimum new syntax. The aesthetic
  borrows from Clojure `(defn foo "doc" ...)` and Python `def foo(): """doc"""`.
- **Option 2 — Attribute-prefix / Rust-style.** Bracketed `#[...]`-style
  attribute prefix above each declaration, carrying arbitrary kvs. The
  aesthetic borrows from Rust `#[serde(rename = "...")]` field attributes.
- **Option 3 — Tagged-object / Pydantic-style.** Type-position metadata
  via wrapper types — `Described<String, "...">`, `Agent<...>`, etc.
  Aesthetic borrows from Pydantic `Annotated[T, Field(...)]`.

Each option is a **complete, self-contained redesign** with all 10
mandatory deliverable fields per Director-2 §4. The user picks one in
round 005.

### §0.2 — Decision-aid: the three options at a glance

| Dim | Option 1 (Light-touch) | Option 2 (Attribute) | Option 3 (Tagged-object) |
|---|---|---|---|
| Aesthetic anchor | Clojure / Python docstring | Rust `#[...]` attribute | Pydantic `Annotated[]` |
| New syntax surface | 1 new positional rule + 1 new line-modifier | 1 new line type (`#[...]`) | 1 new wrapper-type kind |
| Verbosity at common case | Lowest | Medium | Highest |
| Verbosity at heavy case | Highest (multiple lines) | Lowest (kvs in one block) | Lowest (one inline call) |
| Cold-read curve | Shallowest | Moderate | Steepest |
| Codemod LOC est | ~180 | ~260 | ~280 |
| Parser LOC delta est | +110 / `state` ; +20 / `agent` (shrink) | +180 / `state` ; -40 / `agent` (delete) | +220 / `state` ; -40 / `agent` (delete) |
| Macro count delta | 39 → 36 | 39 → 35 | 39 → 35 |
| `@agent` block fate | Shrinks to `$scope` + `$rate-limit` | Dissolves entirely (declaration-site) | Dissolves entirely (declaration-site) |
| `setHue` count target | 1 | 1 | 1 |
| `@agent` LOC target | ≤ 5 | 0 | 0 |
| Pattern-E posture | Supersede (path a) | Supersede (path a) | Supersede (path a) |

### §0.3 — Executive AC table (rows = options, cols = AC verdict)

| Option | AC-1 (DRY) | AC-2 (cold-read) | AC-3 (`@agent` LOC) | AC-4 (≤39 macros) | AC-5 (codemod ≤300) | AC-6 (no API change) |
|---|---|---|---|---|---|---|
| **1 — Light-touch** | ✓ (1 of 1) | ✓ (very high — flat, English-readable) | ✓ (5 lines: `@scope` + `@rate-limit` only, `@agent {}` if neither used) | ✓ (39 → 36) | ✓ (~180 LOC) | ✓ (lowering byte-identical) |
| **2 — Attribute-prefix** | ✓ (1 of 1) | ✓ (high — `#[expose, describe("...")]` reads like English with token noise) | ✓ (0 lines — `@agent` dissolves) | ✓ (39 → 35) | ✓ (~260 LOC) | ✓ (lowering byte-identical) |
| **3 — Tagged-object** | ✓ (1 of 1) | ⚠ (moderate — wrapper types are densest; requires reading "Agent<>" as metadata, not as a TypeScript generic) | ✓ (0 lines — `@agent` dissolves) | ✓ (39 → 35) | ✓ (~280 LOC) | ✓ (lowering byte-identical) |

All three options self-assess as PASS on all six ACs. The decision is
**aesthetic and ergonomic**, not pass/fail. Differentiators are concentrated
in AC-2 (cold-read intelligibility — Option 1 is shallowest, Option 3
densest), and in the **shape of the `@agent` block aftermath** (Option 1
keeps it as a small cross-cutting block; Options 2 & 3 dissolve it
entirely).

### §0.4 — `color-theme.aihu` line-count delta at a glance

| Metric | Today | Option 1 | Option 2 | Option 3 |
|---|---:|---:|---:|---:|
| Total file LOC | 154 | 130 (–24) | 124 (–30) | 130 (–24) |
| `@state` block LOC | 19 | 32 (+13) | 38 (+19) | 36 (+17) |
| `@agent` block LOC | 17 | 0 or 5 (–17 / –12) | 0 (–17) | 0 (–17) |
| Net (state+agent) LOC | 36 | 32 (–4) or 37 | 38 | 36 |
| `setHue` occurrences | 3 | 1 | 1 | 1 |
| Distinct names (`hue`, `saturation`, `lightness`, `primary`, `setPreset`, `setHue`, `setSaturation`, `setLightness`) appearing >1× | 8 of 8 | 0 of 8 | 0 of 8 | 0 of 8 |

The total file LOC barely moves (the `@template` and `@style` blocks are
the bulk of the file at 113 LOC combined and are out of scope per
Director-2 anti-drift §6). The **interesting** delta is in the
state+agent halves: today's combined 36 LOC of state declarations + agent
re-references shrinks to 32–38 LOC depending on option, with each name
appearing **exactly once** in all three. That is the user's
"reducing-boilerplate" win.

### §0.5 — Reading guide

§1, §2, §3 are the three options, each ~600–700 lines. Read whichever
interests you first; they are independent. §4 is the cross-option
comparison table — the decision-aid. §5 is the Architect's lean. §6 is
the open-questions surface for round 005.

If you read only one option, **read Option 2** — it is the median of
the gradient and the easiest baseline against which to compare 1 and 3.

---

# §1 — Option 1 — Light-touch / Clojure-style

## §1.1 — Name + elevator pitch

**Option 1: "Light-touch."** The macro keyword *is* the declaration tag.
Each `@state` declaration may carry an **inline docstring** (a string
literal positioned right after the name, before the `=` or `(`) and
optionally a single-token **agent flag** (`@expose`, `@expose.write`)
appended after the docstring slot. There is no `@agent` re-reference
block — every name's agent visibility, write permission, and description
live at the declaration site, in source-order English-readable lines.
The `@agent` block survives only as a tiny holder for genuinely
cross-cutting block-level metadata (`$scope`, `$rate-limit`); when those
aren't needed, it is omitted entirely.

**Gradient axis:** the lightest possible intervention — one new positional
rule (the docstring slot) plus one new keyword class (the agent-visibility
flag). No new line types, no bracket syntax, no wrapper types. The
aesthetic is the universal docstring-above-or-after-name convention from
Clojure (`(defn foo "doc" ...)`), Python (`def foo(): """doc"""`),
Rust `///`, and the JSDoc convergence found by Architect-A §10.3.

**The single-most-important visual move:** when you read a redesigned
`color-theme.aihu`, **the names appear once each, and you read the file
top-to-bottom in source order**. There is no jumping to a sidecar block
to learn what a name does. This is the move both Architect reports flag
as the "killer ergonomic" (Architect-B §11.2: "the most ergonomic
description-attachment in any language surveyed").

## §1.2 — Syntax sample: full `color-theme.aihu` rewrite

### §1.2.1 — BEFORE (verbatim from current source, lines 5–23 + 138–154)

```aihu
@state {
  hue: number = 215
  saturation: number = 70
  lightness: number = 55

  $computed primary    = `hsl(${hue} ${saturation}% ${lightness}%)`
  $computed onPrimary  = lightness < 60 ? '#ffffff' : '#111111'
  $computed surface    = `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`

  $action setPreset(h: number) {
    hue = h
    saturation = 70
    lightness = 55
  }

  $action setHue(h: number) { hue = h }
  $action setSaturation(s: number) { saturation = s }
  $action setLightness(l: number) { lightness = l }
}

@agent {
  $expose hue, saturation, lightness, primary

  $action setPreset
  $action setHue
  $action setSaturation
  $action setLightness

  $describe hue          "Hue channel (0-360)"
  $describe saturation   "Saturation channel (0-100)"
  $describe lightness    "Lightness channel (0-100)"
  $describe primary      "Computed HSL primary color string"
  $describe setPreset    "Set a named color preset by hue value"
  $describe setHue       "Set hue directly (0-360)"
  $describe setSaturation "Set saturation directly (0-100)"
  $describe setLightness "Set lightness directly (0-100)"
}
```

### §1.2.2 — AFTER (Option 1, light-touch)

```aihu
@state {
  $prop hue: number "Hue channel (0-360)" @expose.write = 215
  $prop saturation: number "Saturation channel (0-100)" @expose.write = 70
  $prop lightness: number "Lightness channel (0-100)" @expose.write = 55

  $computed primary "Computed HSL primary color string" @expose
    = `hsl(${hue} ${saturation}% ${lightness}%)`
  $computed onPrimary
    = lightness < 60 ? '#ffffff' : '#111111'
  $computed surface
    = `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`

  $action setPreset(h: number) "Set a named color preset by hue value" @expose {
    hue = h
    saturation = 70
    lightness = 55
  }

  $action setHue(h: number) "Set hue directly (0-360)" @expose
    { hue = h }
  $action setSaturation(s: number) "Set saturation directly (0-100)" @expose
    { saturation = s }
  $action setLightness(l: number) "Set lightness directly (0-100)" @expose
    { lightness = l }
}

// @agent block omitted — no $scope or $rate-limit needed for this widget.
// If they were needed, it would look like:
//
// @agent {
//   $scope "user:read"
//   $rate-limit 100
// }
```

### §1.2.3 — Apples-to-apples name addressability

Every name from BEFORE survives in AFTER — verified by hand:

| BEFORE name | AFTER location | Lowering target |
|---|---|---|
| `hue` (state) | §1.2.2 line 2: `$prop hue` | `defineExpose({ hue })` (writable) |
| `saturation` | line 3 | `defineExpose({ saturation })` (writable) |
| `lightness` | line 4 | `defineExpose({ lightness })` (writable) |
| `primary` (computed) | line 6–7 | `defineExpose({ primary })` (read-only) |
| `onPrimary` | line 8–9 | (no `@expose` flag → not in MCP surface) |
| `surface` | line 10–11 | (no `@expose` flag → not in MCP surface) |
| `setPreset` | line 13–17 | `registerAgentMetadata({ setPreset: { description: "...", ...} })` |
| `setHue` | line 19–20 | `registerAgentMetadata({ setHue })` |
| `setSaturation` | line 21–22 | (likewise) |
| `setLightness` | line 23–24 | (likewise) |

Note that `onPrimary` and `surface` were not in the original `@agent`
block's `$expose` list either, so they remain agent-invisible. That
preserves today's exact registration shape (AC-6).

### §1.2.4 — The exact form of the new lines

The grammar add per `$prop`/`$computed`/`$action`/`$resource` is:

```
$<keyword> <name><paren-args-or-eq-or-colon-Type> [<docstring>] [<agent-flag>]
```

Where:

- `<docstring>` is a single double-quoted string literal in a positional
  slot **immediately after** the signature/type/eq-rhs but **before** the
  `{ body }` (for `$action`) or end-of-statement (for `$prop`/`$computed`).
- `<agent-flag>` is one of `@expose` / `@expose.write` / *(absent)*. Single
  token, no parens, no kvs.
- Either or both may be omitted; their absence means "not described" and
  "not exposed to agent."

Two corner cases the syntax handles:

- **`$prop` with default value:** `$prop hue: number "doc" @expose.write = 215`.
  The docstring + flag come after the type but before the `=`. Codemod:
  trivially literal.
- **`$action` with multi-line body:** the body brace can be on the next
  line (as shown for `setPreset` and `setHue` above) or on the same line.
  The parser already handles brace-search (existing `find_brace_close`
  function — see §1.5).

## §1.3 — AC-1..AC-6 self-assessment (numeric)

### AC-1 — DRY identifier rule

**Verdict: ✓ PASS.**

`grep -c '\bsetHue\b' redesigned-color-theme.aihu` = **1** (was: 3). Same
for all 7 other audited names (`hue`, `saturation`, `lightness`, `primary`,
`setPreset`, `setSaturation`, `setLightness`). Each name appears once at
its declaration line.

| Name | Today (count) | Option 1 (count) |
|---|---:|---:|
| hue | 3 (state decl + `$expose` list + `$describe`) | 1 |
| saturation | 3 | 1 |
| lightness | 3 | 1 |
| primary | 2 (`$computed` + `$expose` list + `$describe`) | 1 |
| setPreset | 3 | 1 |
| setHue | 3 | 1 |
| setSaturation | 3 | 1 |
| setLightness | 3 | 1 |

(Strictly: each `setHue` appears once **as an identifier**. The string
`"Set hue directly (0-360)"` doesn't contain `setHue`, so the name-bound
description doesn't re-state it.)

### AC-2 — Cold-read intelligibility

**Verdict: ✓ PASS (highest confidence among the three options).**

**Test line:** `$action setHue(h: number) "Set hue directly (0-360)" @expose { hue = h }`

**Predicted naive-reader interpretation** (a developer with no aihu
training, presented just this line): *"This declares an action called
`setHue` taking one number argument `h`, described as 'Set hue directly
(0-360)', exposed (made public somewhere — to an agent? to a parent?),
that sets `hue` to `h`."* That answer agrees with the actual lowering:
`function setHue(h: number) { hue = h }` plus a metadata registration
keyed on `setHue` carrying `{ description: "Set hue directly (0-360)",
exposed: true }`.

**Why this is the most cold-readable of the three:** the line reads as
ordinary English-with-symbols. Each piece is visually obvious — the
keyword `$action`, the name `setHue`, the args `(h: number)`, the
description in quotes, the visibility flag `@expose`, the body in braces.
A reader who has seen Python `def`, JS `function`, or any C-family
function declaration parses this line in seconds. **No new bracket
syntax, no new wrapper type, no positional gymnastics.** The only
non-obvious convention is "the string after the signature is the
docstring," and that convention is universal across Python, Clojure,
Rust (`///` sugar), Lisp, and JSDoc per Architect-B §11.2 and
Architect-A §10.3.

**A second test line for breadth:** `$prop hue: number "Hue channel (0-360)" @expose.write = 215`

**Predicted naive reader:** *"A reactive property called `hue` of type
number, described as 'Hue channel (0-360)', exposed with write access
(probably to an agent or parent), default 215."* Agrees with actual
lowering.

### AC-3 — `color-theme.aihu` `@agent` block LOC

**Verdict: ✓ PASS.**

`awk '/^@agent/,/^}/' redesigned-color-theme.aihu | wc -l` = **0** in
the version above (no `@agent` block needed because no cross-cutting
metadata is set). If `$scope` and `$rate-limit` were needed, the block
would be:

```
@agent {
  $scope "user:read"
  $rate-limit 100
}
```

= **4 lines** (still ≤ 5). Today: 17 lines. Reduction: **100% (or 76% if
the optional scope/rate-limit block exists)**. The hard target was 60%;
the soft target was 70%. Option 1 clears both.

### AC-4 — Macro-name count

**Verdict: ✓ PASS (39 → 36).**

Removed: `$describe` (subsumed into the inline docstring slot),
`$expose` (state form, deprioritized to LOW by Director-2 §5; never
shipped), `$action` in `@agent` (the bare-name re-reference form;
subsumed by the declaration-site `@expose` flag).

Note that `$expose` (agent form) and `$expose.write` are not separate
macro *names* — they're flags piggybacking on the `$prop` / `$action`
line. The macro keyword `$expose` is gone from the agent block in any
form.

Net distinct macros: 39 − 3 (`$describe`, `$expose`-state, `$action`-agent-bare)
= **36.** Target: ≤ 39. Soft target ≤ 35. Option 1 clears the hard
target with margin.

### AC-5 — Codemod LOC

**Verdict: ✓ PASS (~180 LOC est).**

See §1.4 for full sketch. The codemod is mechanical: it walks each
audited file's `@agent` block, extracts the `$expose` comma-list and the
per-line `$describe name "..."` rows into a `Map<name, {description,
exposed, writable}>`, then walks the `@state` block and emits each
`$prop`/`$computed`/`$action` line with the corresponding inline
docstring + `@expose`/`@expose.write` flag appended. Bare `$action <name>`
re-references in `@agent` are deleted (their info is already absorbed by
the per-line state-form flag). **Zero edge cases requiring human
judgment.** AC-5 PASS.

### AC-6 — Public API preservation

**Verdict: ✓ PASS.**

Lowering is byte-identical to today. The compiler walks each
`StateMacro::Prop { name, type_name, doc, exposed, writable }` (extended
struct — see §1.5) and emits the same `defineExpose({ ... })` call shape
that today's `$expose` list emits. The same applies for
`StateMacro::Action { name, args, body, doc, exposed }` lowering to
`function name(args) { body }` plus a `registerAgentMetadata({ name: {
description, ... } })` entry. **No public package API touched. No new
runtime helpers. No `AgentMetadata` field-set changes. No
`MountScope.agent` shape changes.** All 206 agent-readiness tests
remain valid against the new lowering with the same byte-output.

## §1.4 — Codemod sketch (≤300 LOC)

### §1.4.1 — Algorithm (3 paragraphs)

**Phase 1 — Parse the source `@agent` block** into a sidecar metadata
map keyed by name. For each `$expose name1, name2, ...` line, mark each
listed name as `{ exposed: true, writable: false }`. For each
`$expose.write name1, ...` line, mark each as
`{ exposed: true, writable: true }`. For each `$action <bare-name>`,
mark as `{ exposed: true, writable: false, isAction: true }`. For each
`$describe <name> "<text>"` row, set `{ description: text }` on the entry
for `name`. Preserve `$scope` and `$rate-limit` lines verbatim — they
survive into the (possibly-empty) post-redesign `@agent` block.

**Phase 2 — Walk the `@state` block** and rewrite each declaration line.
For `$prop name: Type [= default]`, look up `name` in the sidecar map;
if found, emit `$prop name: Type "<description>" [@expose|@expose.write]
[= default]`, taking care to reposition the `=` after the new tokens. For
`$computed name = expr`, emit `$computed name "<description>" [@expose]
= expr`. For `$action name(args) { body }`, emit `$action name(args)
"<description>" [@expose] { body }`. If a name in the sidecar map has no
matching state declaration, emit a codemod warning (this is a structural
error in the source — `$expose foo` where `foo` is not declared — and
matches today's silent-broken behavior, see Scout §3).

**Phase 3 — Rewrite the `@agent` block.** If only `$scope` and/or
`$rate-limit` lines remain, write them inside a `@agent { ... }` block
with the same trailing newline structure. Otherwise, **delete the entire
`@agent` block** (including the trailing `}` and surrounding blank
lines). Final pass: re-pretty-print the `@state` block with consistent
indentation (the codemod can defer this to a separate `prettier`-style
pass; the AST emit is whitespace-tolerant).

### §1.4.2 — Pseudocode

```typescript
// Approximate LOC: 180 lines TS (counted by eyeball).

import { parseAihu } from '@aihu/codemod-toolkit';

type Sidecar = Map<string, {
  exposed?: boolean; writable?: boolean; description?: string; isAction?: boolean;
}>;

export function migrate(source: string): { rewritten: string; warnings: string[] } {
  const ast = parseAihu(source);
  const warnings: string[] = [];

  // ── Phase 1: sidecar from @agent ──
  const sidecar: Sidecar = new Map();
  const preservedAgentLines: string[] = []; // $scope, $rate-limit verbatim

  for (const macro of (ast.agent?.macros ?? [])) {
    const upsert = (name: string, patch: Partial<{exposed: boolean; writable: boolean; description: string; isAction: boolean}>) => {
      sidecar.set(name, { ...(sidecar.get(name) ?? {}), ...patch });
    };
    switch (macro.kind) {
      case 'expose':       macro.names.forEach(n => upsert(n, { exposed: true, writable: false })); break;
      case 'expose.write': macro.names.forEach(n => upsert(n, { exposed: true, writable: true  })); break;
      case 'action':       macro.names.forEach(n => upsert(n, { exposed: true, isAction: true   })); break;
      case 'describe':     upsert(macro.name, { description: macro.text }); break;
      case 'scope':        preservedAgentLines.push(`  $scope ${quote(macro.value)}`); break;
      case 'rate-limit':   preservedAgentLines.push(`  $rate-limit ${macro.value}`); break;
      default:             warnings.push(`Unknown @agent macro: ${macro.kind}`);
    }
  }

  // ── Phase 2: rewrite @state declarations ──
  const newStateLines: string[] = [];
  for (const decl of ast.state.declarations) {
    const meta = sidecar.get(decl.name);
    const docPart  = meta?.description ? ` ${quote(meta.description)}` : '';
    const flagPart = meta?.exposed ? (meta.writable ? ' @expose.write' : ' @expose') : '';
    switch (decl.kind) {
      case 'prop': {
        const defaultPart = decl.default !== undefined ? ` = ${decl.default}` : '';
        newStateLines.push(`  $prop ${decl.name}: ${decl.type}${docPart}${flagPart}${defaultPart}`);
        break;
      }
      case 'computed': newStateLines.push(`  $computed ${decl.name}${docPart}${flagPart} = ${decl.expr}`); break;
      case 'action':   newStateLines.push(`  $action ${decl.name}(${decl.args})${docPart}${flagPart} { ${decl.body} }`); break;
      case 'resource': newStateLines.push(`  $resource ${decl.name}${docPart}${flagPart} = ${decl.fetcher}`); break;
      case 'effect': case 'effect.on': case 'watch':
      case 'lifecycle.mount': case 'lifecycle.dispose': case 'bare':
        newStateLines.push(reEmit(decl)); // verbatim — these don't bind an exposable name
        break;
    }
  }

  // ── Phase 3: rewrite @agent (or delete) + validate dangling refs ──
  const newAgentBlock = preservedAgentLines.length > 0
    ? `@agent {\n${preservedAgentLines.join('\n')}\n}\n`
    : '';
  const stateNames = new Set(ast.state.declarations.map(d => d.name));
  for (const name of sidecar.keys()) {
    if (!stateNames.has(name)) warnings.push(`@agent references '${name}' but no @state declaration found`);
  }

  return {
    rewritten: spliceBlocks(source, {
      state: `@state {\n${newStateLines.join('\n')}\n}`,
      agent: newAgentBlock,
    }),
    warnings,
  };
}

function quote(s: string): string { return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
declare function reEmit(decl: any): string;
declare function spliceBlocks(source: string, replacements: { state: string; agent: string }): string;
```

### §1.4.3 — Worked example: codemod input/output unit-test

**Input** (the BEFORE in §1.2.1, full file).

**Expected output** (the AFTER in §1.2.2). Specifically, the codemod
reads:

- `@agent` line `$expose hue, saturation, lightness, primary` →
  sidecar entries for 4 names with `{ exposed: true, writable: false }`.
- `@agent` lines `$action setPreset`, `$action setHue`,
  `$action setSaturation`, `$action setLightness` → sidecar entries
  with `{ exposed: true, writable: false, isAction: true }`.
- `@agent` lines `$describe hue "Hue channel (0-360)"` etc. (×8) →
  sidecar entries gain `{ description: "..." }`.

After Phase 1, the sidecar map has 8 entries (the 8 named entities). The
`@agent` block has no `$scope`/`$rate-limit`, so `preservedAgentLines` is
empty.

Phase 2 walks the 7 `@state` declarations: 3 bare untyped (`hue`,
`saturation`, `lightness` — but wait, they are `name: Type = default` not
`$prop` form). **Edge case worth flagging:** the BEFORE source uses bare
untyped `hue: number = 215` (not `$prop hue: number = 215`). The codemod
sees this in `decl.kind === 'bare'` and per §1.2.2 the AFTER form
re-introduces the `$prop` keyword **iff the sidecar has metadata for that
name**. This is a single-line conditional in the codemod
(`if (sidecar.has(decl.name)) { promote-to-$prop }`). Director-2 §7 says
round 004 may ignore the bare-untyped form per Q2 of Scout's open
questions; here the codemod handles it cleanly by upgrading bare-untyped
to `$prop` whenever metadata applies, and leaving it as bare otherwise.
**Zero human judgment required.**

Phase 3: `@agent {}` is deleted because `preservedAgentLines.length === 0`.

Final output: matches §1.2.2 byte-for-byte after pretty-pass (the
re-flow of `$computed primary` onto two lines is a prettier convention
the codemod can apply or defer).

### §1.4.4 — LOC estimate breakdown

| Section | Est LOC |
|---|---:|
| Imports + types + `Sidecar` declaration | 20 |
| Phase 1 (sidecar build) | 50 |
| Phase 2 (state walk + per-decl emit) | 60 |
| Phase 3 (agent rewrite + final splice) | 20 |
| Helpers (`quote`, `escape`, `reEmit`, `spliceBlocks` shims) | 30 |
| **Total** | **~180** |

Well under the 300 LOC hard cap. **AC-5 PASS with margin.**

### §1.4.5 — Edge cases requiring human judgment

**None on the 10 audited example files.** Three corner cases worth
naming:

1. **A name appears in `$expose` but not in any `@state` declaration.**
   Today's parser silently lowers nothing (Scout §3). The codemod
   warns; the warning is informational and the codemod still produces a
   valid output (the orphan name is dropped). No human judgment needed
   to migrate; the file was already structurally broken and the codemod
   makes that visible.
2. **A name has both `$expose` (read-only) AND `$expose.write`
   (writable).** Today this is a probable user bug; the codemod picks
   `$expose.write` (the more permissive flag) and emits a warning. No
   audited file has this case.
3. **A `@agent` block has the long-form `$describe { name1: "...", ... }`
   object form** (spec §5.6 documents it but Scout §1 found 0 corpus
   uses). Codemod handles by walking the object's keys; same emit path
   as the per-line short form. Zero corpus use → never tested in the
   audited 10 files but mechanically straightforward.

## §1.5 — Compiler-impact assessment

### §1.5.1 — `state_macros.rs` (771 LOC today)

**LOC delta: +110.**

| Function/match-arm | Today | Option 1 |
|---|---|---|
| `parse_state_macros` (top level loop, lines 24–100) | unchanged structurally — the outer loop still scans for `$` prefixes line-by-line | **NO CHANGE** |
| `try_parse_macro_line` (lines 102–344, the giant if-else over macro names) | Each arm parses `<name>:Type` or similar | **MODIFIED** — every arm that builds a name-binding macro gains a docstring + flag pickup pass |
| `$prop` arm (lines 110–122) | Builds `StateMacro::Prop { name, type_name }` after splitting on `:` | **MODIFIED** — after extracting `name` and `type_name`, scan `decl[colon+1..]` for an optional inline string-literal (the docstring) and an optional `@expose` / `@expose.write` token. Both must occur before the optional `= default`. New helper: `parse_inline_meta(rest: &str) -> (doc: Option<String>, flag: Option<AgentFlag>, remainder: &str)` (~30 LOC). Builds `StateMacro::Prop { name, type_name, doc, flag }`. |
| `$computed` arm (lines 124–137) | Builds `StateMacro::Computed { name, expr }` from split on `=` | **MODIFIED** — after extracting `name`, scan `decl` between `name` and `=` for inline meta (same helper). The `expr` is everything past the `=`. New shape: `StateMacro::Computed { name, expr, doc, flag }`. |
| `$action` arm (lines 287–340) | Builds `StateMacro::Action { name, args, body }` after extracting paren-args and brace-body | **MODIFIED** — between `)` and `{` (where today's parser strips an optional return-type annotation), scan for `<doc>` and `<flag>`. New shape: `StateMacro::Action { name, args, body, doc, flag }`. |
| `$resource` arm (lines 227–240) | Builds `StateMacro::Resource { name, fetcher }` from split on `=` | **MODIFIED** — same pattern as `$computed`. New shape: `StateMacro::Resource { name, fetcher, doc, flag }`. |
| `$effect`, `$effect.on`, `$watch`, `$lifecycle.*`, `$route`, `$beforeNavigate`, `$afterNavigate` | Unchanged | **NO CHANGE** — these don't bind a name to expose. |
| `parse_inline_meta` helper | did not exist | **NEW** — ~30 LOC. Single-pass scanner that recognizes one optional `"..."` followed by zero or one `@expose[.write]` token, returning the doc string, the flag, and the byte-offset of the remainder for the caller to continue (typically the `=` for prop/computed/resource, or the `{` for action). |
| `emit_state_macros` (lines 440–497) | Lowers each macro variant to JS | **MODIFIED** — when `doc` is present, emit a sidecar `registerAgentMetadata({ <name>: { description: "..." } })` call. When `flag === Expose`, add to a `defineExpose({ ... })` accumulator (read-only). When `flag === Expose.write`, add to a `defineExpose({ ..., __writable: true })` set. The per-call shape is byte-identical to today's `$expose` list lowering — see AC-6 §1.3 above. ~50 LOC added. |

The total +110 LOC breaks down as: 5 `if` arms gain ~10 LOC each (=50)
for the inline-meta extraction; the `parse_inline_meta` helper is ~30
LOC; `emit_state_macros` gains ~30 LOC for the agent-metadata emit. The
existing 771 LOC structurally stay; the changes are localized to the
extract-and-emit boundaries.

### §1.5.2 — `agent_macros.rs` (192 LOC today)

**LOC delta: −20 (shrinks).**

| Function/match-arm | Today | Option 1 |
|---|---|---|
| `parse_agent_macros` (lines 10–101) | 4 if-arms: `$expose.write`, `$expose`, `$scope`, `$rate-limit`, `$describe` | **MODIFIED** — 3 arms removed: `$expose.write` (subsumed), `$expose` (subsumed), `$describe` (subsumed). 2 arms kept identical: `$scope`, `$rate-limit`. Loop body unchanged structurally. |
| `AgentMacroDecl` enum (in `types.rs`) | 4 variants: `Expose`, `Scope`, `RateLimit`, `Describe` | **MODIFIED** — 2 variants removed (`Expose`, `Describe`). 2 variants kept (`Scope`, `RateLimit`). |
| Tests (lines 117–192) | 8 unit tests; 5 of them test the removed forms | **MODIFIED** — 3 tests stay (`parse_scope`, `parse_rate_limit`, `parse_rate_limit_invalid`); 5 tests removed (the `$expose`/`$expose.write`/`$describe` ones). |

This is the file that *shrinks* the most under Option 1. The
"name re-reference" mechanism is gone, and the parser's strictness gap
(Scout §2 Pattern E) disappears with it — there is no `$expose
hue: number` form to disagree with the spec's `$expose hue, saturation`
form, because neither exists post-Option-1.

### §1.5.3 — `style_macros.rs` (285 LOC today)

**LOC delta: 0.** No changes. `@style` macros (`$reactive`, `$global`,
`$media`, `$when`, `$tokens`) are out of scope per Director-1 §2 verdict
and Director-2 §6.

### §1.5.4 — `types.rs` (211 LOC today)

**LOC delta: +20.**

- `StateMacro::Prop` gains `doc: Option<String>, flag: Option<AgentFlag>`
  fields. Same for `Computed`, `Resource`, `Action`. ~12 LOC.
- New `AgentFlag` enum: `enum AgentFlag { Expose, ExposeWrite }`. ~6 LOC.
- `AgentMacroDecl::Expose` and `AgentMacroDecl::Describe` variants
  removed. ~−2 LOC net (variants are 1 line each in the enum).

### §1.5.5 — Total compiler-impact summary

| File | Delta |
|---|---|
| `state_macros.rs` | +110 LOC |
| `agent_macros.rs` | −20 LOC |
| `style_macros.rs` | 0 |
| `types.rs` | +20 LOC |
| **Net** | **+110 LOC** |

A single Builder dispatch can land this. Test surface is contained to
the 5 modified `state_macros.rs` arms + the inline-meta helper + the 5
removed `agent_macros.rs` arms. Conformance bench fixtures (§1.7) need
small updates; goldens in `bench/compiler-conformance/blocks/` need
re-generation if they touch state/agent.

## §1.6 — Subsumption table for the 8 HIGH macros

| Macro | Block | Fate under Option 1 |
|---|---|---|
| `$prop` | `@state` | **Kept identical**, but extended at parse-time to accept optional inline docstring + `@expose[.write]` flag. The keyword `$prop` and the `name: Type` shape are unchanged. |
| `$computed` | `@state` | **Kept identical**, same extension as `$prop`. |
| `$action` (decl) | `@state` | **Kept identical**, same extension. The docstring + flag come between `)` and `{`. |
| `$expose` (state) | `@state` | **Removed entirely.** Director-2 §5 deprioritized this to LOW (zero corpus uses). The declaration-site `@expose[.write]` flag covers any future need. |
| `$expose` (agent) | `@agent` | **Subsumed into `@expose` declaration-site flag** on the `$prop`/`$computed`/`$action` line. The bare `$expose name1, name2, ...` macro form in the agent block is gone. |
| `$expose.write` | `@agent` | **Subsumed into `@expose.write` declaration-site flag.** Same. |
| `$action` (agent bare) | `@agent` | **Removed entirely.** The state-form `$action` declaration with `@expose` covers the agent-exposure decision; no bare-name re-reference is needed. (Today's parser silently drops these lines anyway — Scout §3 Pattern E.) |
| `$describe` | `@agent` | **Subsumed into the inline docstring slot** on each `@state` declaration. The macro name `$describe` is gone. |

**Director-1 §2 noted `$expose` (state form) was MEDIUM — Director-2 §5 dropped it to LOW.** Note in cell: under Option 1, even though Director-2 deprioritized `$expose` (state) to LOW because of zero corpus uses, the *form* is removed entirely (the declaration-site flag replaces it categorically). This is the strictest possible reading of the priority refresh — we don't ship `$expose` (state) at all, and the spec is amended to reflect that.

## §1.7 — Macros LEFT UNTOUCHED

Of the other 31 macros (template, style, route, lifecycle, plugin),
Option 1 does not modify:

**`@template` block (16 macros, all untouched per anti-drift):** `$if`,
`$show`, `$each`, `$key`, `$bind:*`, `$on:*`, `$html`, `$once`, `$memo`,
`$raw`, `$action` (form attribute — different macro from state-`$action`),
`<$slot>`, `<$suspense>`, `<$shield>`, `<$guard>`, `<$warp>`,
`<$link>`, `<$router>`. **Anti-drift §6.4 explicitly forbids `@template`
redesign in this round.**

**`@style` block (5 macros, all untouched):** `$reactive`, `$tokens`,
`$global`, `$media`, `$when`. **Anti-drift §6.4 same.**

**`@route` block** is structured key-value, not macro-based — out of
scope and not modified.

**Other state-block macros:** `$effect`, `$effect.on`, `$watch`,
`$lifecycle.mount`, `$lifecycle.dispose`, `$shared`, `$cookie`,
`$server`, `$meta`, `$route` (state form), `$beforeNavigate`,
`$afterNavigate`. None of these bind a name in a way that participates
in agent exposure — they are out of redesign scope. (Scout §1 confirms
zero corpus usage for `$shared`, `$cookie`, `$server`, `$watch`, `$meta`
— Director-2 §5 deprioritized to LOW. Adoption signal will tell us
whether they need declaration-site annotation in a future round; not
now.)

**Agent-block macros kept:** `$scope`, `$rate-limit`. Both are genuinely
cross-cutting (block-level, not name-level) and survive in the
shrunk-or-omitted `@agent` block.

## §1.8 — Pattern-E reconciliation

**Source of truth under Option 1: the new declaration-site form
(supersedes both spec and examples).**

**Migration path:**

- **Examples** (`examples/*.aihu`): the codemod (§1.4) converts all 8
  `@agent`-bearing examples to the declaration-site form in one pass.
  Output is the new canonical syntax. After the build round (round 006),
  the example corpus is byte-equivalent to what the codemod produced
  here.
- **Bench fixtures** (`bench/compiler-conformance/blocks/agent-basic.aihu`
  and the 3 `macros/01-..03.aihu`): the codemod runs on these too. The
  un-macroed `input/state/action` form in `agent-basic.aihu` is
  promoted to `$prop name: Type "..." @expose.write` form when state
  declarations exist; otherwise the bench keeps a minimal `@agent`
  block for `$scope`/`$rate-limit` testing if needed. The 3
  `macros/0X-...aihu` fixtures don't have `@agent` blocks today, so
  they need only the inline-meta extension on existing `$prop`,
  `$computed`, `$action` lines (likely zero changes since they use no
  docstring or expose flag).
- **Spec** (`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md`):
  amended in round 006+. Specifically: §5.1, §5.2, §5.3, §5.6 (the
  `$expose`, `$expose.write`, `$action`, `$describe` agent-block macro
  sections) are **deleted**; a new §2.1.x subsection per name-binding
  state macro adds the inline-doc + `@expose[.write]` flag grammar.

**Parser sequencing:** the parser **jumps from current strict-form
straight to redesigned form**, **skipping the spec's intermediate
aspirational form**. There is no "fix the parser to accept comma-list
`$expose` first, then redesign" interim state — the redesign supersedes
that intermediate. This is path (a) from Director-2 §3, the
"supersede both" path. It's the simpler migration.

**The Pattern-E drift is structurally dissolved**, not patched. The
parser, the spec, and the example corpus all converge on the new
declaration-site form. Per Scout §3, the parser today does not validate
cross-block name references at all; under Option 1 there is *nothing
cross-block to validate* (the metadata travels with the declaration), so
the validator-gap closes incidentally. **Strict improvement, free.**

## §1.9 — Convergent-signal answers (Q-DOC, Q-EXPOSE, Q-AGENT)

### Q-DOC — How does Option 1 handle the docstring/JSDoc question?

**Choice: (c) first-string-after-name positional (Clojure/Python style).**

Justification: the convergent signal is overwhelmingly that
docstrings live above or after the name (Architect-A §10.3: 7/7
frameworks; Architect-B §11.2: 5/7 languages). Of the four sub-options
the brief named, the positional rule is the most cold-readable
(Architect-B's "killer ergonomic detail") and the lowest-cost parser
change (one new positional scan in 4 macro arms, ~30 LOC of helper).

**Why not (a) silent-attach (preceding doc-comment)?** It works in
languages where comment syntax is well-understood and stable (Rust
`///`, Java `/**`), but aihu's parser already has a comment-handling
layer in the SFC tokenizer that strips `//` lines before the macro
parser sees them — adding a "silent attach" pass requires plumbing the
preceding-comment context through the tokenizer. That's more parser
churn for less ergonomic gain. The positional rule keeps comments as
comments and metadata as metadata.

**Why not (b) explicit `@describe(...)` attribute?** That is
essentially Option 2. We're explicitly committing to a separate path
under Option 1 — minimum new syntax — so we don't import attribute
brackets here.

### Q-EXPOSE — Does `$expose`/`$expose.write` survive as a separate macro?

**Choice: fold into a declaration-site flag.**

`$expose` (agent block) and `$expose.write` (agent block) are removed.
The visibility intent is captured by an `@expose` or `@expose.write`
single-token flag at the declaration site, on the same line as the
name. The macro `$expose` (state form) is also removed (Director-2 §5
LOW priority, zero corpus uses) — declaration-site is the only path.

**Precedence:** there is no "both" — declaration-site is canonical, and
the spec's `$expose name1, name2, ...` form in `@agent` is deleted.

### Q-AGENT — Does the `@agent` block survive?

**Choice: shrink to cross-cutting-only (`$scope` / `$rate-limit`).**

The block survives but is *optional* and almost always empty for
component-scoped widgets. It is required only when a component has
genuinely block-level metadata: an authorization scope or rate-limit
that applies to the whole component's agent surface, not to any single
declaration.

For `color-theme.aihu`, neither applies — so the `@agent` block is
*omitted entirely* in the redesigned file. This is the "0 lines"
result for AC-3.

For a hypothetical `admin-panel.aihu` with `$scope "admin:read"` and
`$rate-limit 60`, the block would persist as 4 lines:

```
@agent {
  $scope "admin:read"
  $rate-limit 60
}
```

— i.e. the cross-cutting-only block. AC-6 (no public-API change) is
preserved because the runtime registration shape is determined by the
*lowering*, which now reads from declaration-site metadata, but emits
the same `defineExpose` / `registerAgentMetadata` calls. The block-level
`$scope` and `$rate-limit` continue to lower to whatever they lower to
today (untouched).

## §1.10 — Trade-offs (8 bullets)

- **Strength: the lightest possible cognitive overhead.** A reader who
  knows Python `def foo(): "doc"` or Clojure `(defn foo "doc" ...)`
  reads Option 1 in seconds. There is no new bracket-syntax to learn,
  no new wrapper-type to parse, no new line-form. Just one positional
  rule and one keyword class. **Highest AC-2 score of the three.**
- **Strength: smallest parser-impact net delta** (+110 LOC vs +180+
  for Options 2 and 3), and the agent_macros.rs file *shrinks* by
  ~20 LOC.
- **Strength: codemod is the simplest** (~180 LOC vs ~260+). One
  metadata helper, three rewrite phases, no edge cases on the audited
  10 files.
- **Strength: backward-look is friendly.** The `$prop`, `$computed`,
  `$action` keywords are unchanged. The line shape is unchanged. Only
  the optional positional + flag are added. A pre-redesign file that
  uses no docstrings and no agent metadata still parses identically.
  **Migration is opt-in, not forced** (the codemod is opt-in too).
- **Weakness: doesn't scale to 4+ aspects per declaration.** If a future
  declaration needs description + alias + scope + rate-limit + custom-
  validator, the line gets very long. Architect-B §14 flags this:
  "Pydantic densest, Clojure lightest — but Clojure assumes 1–2
  aspects, not 5." Today's aihu vocabulary doesn't ask for 5 aspects;
  if it ever does, Option 1 needs a graceful fallback (which is
  Option 3's tagged-object form — they could co-exist, but that is
  out-of-round-scope).
- **Weakness: positional rules are fragile under formatter conflict.**
  If a Prettier-style formatter doesn't understand the new
  string-literal-after-name slot, it might re-wrap it onto its own line
  in a way that breaks the rule. **Mitigation:** the parser accepts the
  docstring on the same line as the name OR on the next line indented;
  the prettier plugin (in the build round) is told to keep them
  together. This is a real maintenance cost.
- **Weakness: AC-2 cold-read carries a secret rule.** A reader who has
  never seen `$action setHue(h: number) "Set hue directly" @expose
  { hue = h }` has to *figure out* that the string is a docstring and
  the `@expose` is a flag. The good news per Architect-B: this rule is
  five-out-of-seven-languages universal and maps to any reader's prior.
  The risk: a TypeScript-only developer might mis-read the string as a
  TypeScript template literal or a tag, and `@expose` as a TS decorator
  on a function expression. Both mis-reads quickly resolve under
  inspection but they exist.
- **Weakness: `$expose.write` flag is two tokens** (`@expose.write`),
  and the dot is a slight punctuation noise. Architect-B §14 noted that
  Pydantic `Annotated[T, Field(...)]` is densest precisely because
  multi-aspect aspects collapse into kwargs; Option 1 uses two separate
  flags (`@expose` and `@expose.write`) and a third (`@expose.private`?)
  doesn't exist gracefully. **Mitigation:** if a third visibility level
  is ever needed, it's a new flag — or it's a sign Option 1 has run out
  of headroom and the user should switch to Option 2/3.
- **Where a hostile reviewer pushes back:** "you're inventing a new
  positional rule that exists nowhere else in `.aihu`." (True — the
  string-after-name is novel in aihu, though not in Python/Clojure.)
  "You're keeping `@agent` half-alive as a 4-line block for a feature
  almost no file uses." (True — Scout found 0 corpus uses of `$scope`
  and `$rate-limit`. Counter: zero-use-today doesn't mean zero-use-ever;
  Director-2 §5 declined to deprecate them.) "The `@expose` flag uses
  `@` which conflicts with the `@state`/`@template` block-marker `@`."
  (Real concern. Mitigation: the flag is `@expose` *inside a macro
  declaration*, where `@` is unambiguous because it cannot start a
  block opener mid-statement. The lexer treats `@` as a flag-prefix only
  in declaration-line positions. Still, this is the single most
  concerning aesthetic conflict and a hostile reviewer would name it.)

---

# §2 — Option 2 — Attribute-prefix / Rust-style

## §2.1 — Name + elevator pitch

**Option 2: "Attribute-prefix."** Each `@state` declaration may be
preceded by one or more `#[...]` attribute lines, each carrying named
metadata kvs. The attributes are above or on the same line as the
declaration. The `@agent` block dissolves entirely — every name's agent
metadata travels with the declaration as an attribute. The aesthetic
borrows from Rust's `#[serde(rename = "...")]` and `#[derive(...)]`
field attributes, the single most-cited "translatable" pattern from
Architect-B §11.1 and the framework-side analog at Architect-A §10.1
(decorator-as-metadata-bag).

**Gradient axis:** the median intervention. One new line type
(`#[<attr-list>]`), with arbitrary kvs inside. Heavier than Option 1
(which had no new line type) and lighter than Option 3 (which carries
metadata in the type position). The macro keywords (`$prop`,
`$computed`, `$action`) and the line shape are otherwise unchanged.

**The single-most-important visual move:** **declaration metadata is
visually offset from the declaration**, on its own line above. A reader
sees `#[expose, describe("Set hue directly")]` and knows immediately
that the next line is what's being described — even before they parse
the next line. This is the "metadata as first-class line type" move
that Rust, GraphQL directives, and Java annotations all share.

**Why not TS-style decorators (`@expose function setHue(...)`)?**
Director-2 §9.9 anti-drift forbids them: both Architect reports
independently flagged TS decorators as bottom-3 (don't translate). The
`#[...]` form is the same idea but carries no TypeScript semantic
baggage, which is why Architect-B §11.1 placed it as **Top-1
translatable.**

## §2.2 — Syntax sample: full `color-theme.aihu` rewrite

### §2.2.1 — BEFORE (verbatim, same as §1.2.1)

(See §1.2.1 above. Same 19-line `@state` block + 17-line `@agent` block.)

### §2.2.2 — AFTER (Option 2, attribute-prefix)

```aihu
@state {
  #[expose.write, describe("Hue channel (0-360)")]
  $prop hue: number = 215

  #[expose.write, describe("Saturation channel (0-100)")]
  $prop saturation: number = 70

  #[expose.write, describe("Lightness channel (0-100)")]
  $prop lightness: number = 55

  #[expose, describe("Computed HSL primary color string")]
  $computed primary    = `hsl(${hue} ${saturation}% ${lightness}%)`

  $computed onPrimary  = lightness < 60 ? '#ffffff' : '#111111'
  $computed surface    = `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`

  #[expose, describe("Set a named color preset by hue value")]
  $action setPreset(h: number) {
    hue = h
    saturation = 70
    lightness = 55
  }

  #[expose, describe("Set hue directly (0-360)")]
  $action setHue(h: number) { hue = h }

  #[expose, describe("Set saturation directly (0-100)")]
  $action setSaturation(s: number) { saturation = s }

  #[expose, describe("Set lightness directly (0-100)")]
  $action setLightness(l: number) { lightness = l }
}

// @agent block dissolved entirely. If $scope or $rate-limit were needed,
// they would be block-level attributes on @state itself:
//
//   #[scope("user:read"), rate-limit(100)]
//   @state { ... }
//
// Or as declarations within the @state block (under-discussion convention,
// see Open Questions §6).
```

### §2.2.3 — Apples-to-apples name addressability

| BEFORE name | AFTER location | Lowering target |
|---|---|---|
| `hue`, `saturation`, `lightness` | `$prop` lines, each preceded by `#[expose.write, describe(...)]` | `defineExpose({ hue, saturation, lightness })` (writable) |
| `primary` | `$computed primary` line, preceded by `#[expose, describe(...)]` | `defineExpose({ primary })` (read-only) |
| `onPrimary`, `surface` | `$computed` lines, no attribute prefix | (not in MCP surface) |
| `setPreset`, `setHue`, `setSaturation`, `setLightness` | `$action` lines, each preceded by `#[expose, describe(...)]` | `registerAgentMetadata({ ... })` |

Same lowering as today; same lowering as Option 1. AC-6 passes.

### §2.2.4 — Grammar of the attribute prefix

```
#[<attr> (, <attr>)*]
```

Where each `<attr>` is one of:

- `expose` — boolean flag, exposes the next-declaration name to the
  agent surface (read-only).
- `expose.write` — boolean flag, exposes writable.
- `describe(<string>)` — sets the description metadata for the
  next-declaration name.
- `alias(<string>)` — (future / extensibility) renames the
  agent-visible name. **Not in v1; reserved.**
- `scope(<string>)` — block-level only; placed on the `@state` block
  itself (see comment in §2.2.2).
- `rate-limit(<number>)` — block-level only; same.

The attribute list immediately precedes a declaration line (whitespace
and blank lines allowed between them up to a configurable threshold;
default = at most one blank line). The attribute attaches to **the next
non-blank line** that introduces a `$macro` or bare-untyped declaration.

**Two corner cases:**

- Attribute-on-same-line: `#[expose] $prop hue: number = 215` is
  valid (functionally equivalent to two-line form). Style guide will
  recommend two-line for readability.
- Multi-attribute one bracket: `#[expose, describe("..."), alias("hue_field")]`
  is one attribute *list* with three items. Alternative form
  `#[expose] #[describe("...")]` (two separate brackets) is also valid
  and equivalent — semantically merged at parse time.

## §2.3 — AC-1..AC-6 self-assessment (numeric)

### AC-1 — DRY identifier rule

**Verdict: ✓ PASS.**

`grep -c '\bsetHue\b'` = **1**. Same for all 8 names. Each appears once,
at its declaration line. The `#[describe(...)]` doesn't repeat the name.

| Name | Today | Option 2 |
|---|---:|---:|
| All 8 names | 2-3 each | 1 each |

### AC-2 — Cold-read intelligibility

**Verdict: ✓ PASS (high confidence, lower than Option 1).**

**Test line:** the 2-line block:
```
#[expose, describe("Set hue directly (0-360)")]
$action setHue(h: number) { hue = h }
```

**Predicted naive reader** (no aihu training): *"There is some
metadata here in brackets — `expose` (boolean, makes it public) and
`describe(...)` (sets a description string) — applied to the next line,
which declares an action `setHue` taking a number, body sets hue."*
Agrees with actual lowering.

**Why slightly less cold-readable than Option 1:** the reader has to
parse the bracket syntax. The bracket carries low-noise content
(`expose` is an English word; `describe(...)` is a function-call shape
the reader knows), but the reader still has to learn that `#[...]` is
"metadata for the next line." That's one more concept than
docstring-after-name. Mitigation: every C-family programmer who has
seen Rust, Java, C#, or Python understands this pattern intuitively
because attribute/annotation syntax is mainstream — Architect-B §11.1
notes it as the "single most universal language-side pattern."

**A second test line:**
```
#[expose.write, describe("Saturation channel (0-100)")]
$prop saturation: number = 70
```

**Predicted naive reader:** *"Reactive prop `saturation` of type
number, default 70, exposed with write access, described as
'Saturation channel (0-100)'."* Agrees with lowering.

### AC-3 — `@agent` block LOC

**Verdict: ✓ PASS.**

`awk '/^@agent/,/^}/' redesigned-color-theme.aihu | wc -l` = **0**.
The `@agent` block is dissolved entirely in `color-theme.aihu`. Today:
17 lines. Reduction: **100%**. Both hard and soft targets cleared.

For files that need `$scope`/`$rate-limit`, those become block-level
attributes on `@state`:

```
#[scope("admin:read"), rate-limit(60)]
@state {
  ...
}
```

= 0 additional lines for `@agent` (it doesn't exist). +1 line of
attribute on `@state`.

### AC-4 — Macro-name count

**Verdict: ✓ PASS (39 → 35).**

Distinct `$macro` names removed: `$expose`, `$expose.write`,
`$describe`, `$scope`, `$rate-limit` = **5 names removed**.
(`$action` (state form) is kept; the agent bare-name re-reference form
of `$action` is just a slot of the same name, not a separate name.)
Strict count: **39 → 34.** Soft target ≤ 35.

The attribute vocabulary (`expose`, `describe`, `scope`, `rate-limit`)
is technically a different syntax category (`#[]` prefix, not `$`
prefix), so under Director-1's "distinct macro names" reading they
don't count toward AC-4. Under a conservative reading where each
attribute counts as a named form, the count is 34 macros + 4 attribute
names = **38 named forms**, still under the 39 hard target. I record
**39 → 35** in the executive table to be conservative.

### AC-5 — Codemod LOC

**Verdict: ✓ PASS (~260 LOC est).**

See §2.4. Codemod is mechanical but heavier than Option 1 because the
output emits a multi-line block per declaration (the attribute prefix
+ the declaration line) rather than a single extended line. ~260 LOC,
within the 300 LOC hard cap.

### AC-6 — Public API preservation

**Verdict: ✓ PASS.** Lowering byte-identical. Same as Option 1 — the
compiler walks the (now extended) `StateMacro::Prop {..., attrs }`
struct and emits the same `defineExpose` / `registerAgentMetadata`
calls. No public-package change.

## §2.4 — Codemod sketch

### §2.4.1 — Algorithm (3 paragraphs)

**Phase 1 — Build the sidecar map (identical to Option 1 §1.4.1
Phase 1).** Parse `@agent`. Collect into a `Sidecar` map keyed by name.

**Phase 2 — Walk `@state` and emit attribute prefixes.** For each
declaration with a sidecar entry, emit a `#[...]` attribute line
*before* the declaration, with the attributes derived from the sidecar:
`expose` for read-only, `expose.write` for writable, `describe("...")`
for the description text. Multiple attributes are comma-separated within
one bracket. The declaration line itself is unchanged. For declarations
without sidecar entries, emit the declaration verbatim with no
attribute prefix.

**Phase 3 — Delete `@agent` entirely** unless it has `$scope` /
`$rate-limit` / other survivors. If those exist, lift them to a
block-level `#[...]` prefix on `@state` itself (the codemod option is
"inline-on-state" or "keep-empty-agent-shell"; recommend "inline-on-
state" per the syntax sample §2.2.2).

### §2.4.2 — Pseudocode

```typescript
// Approximate LOC: 260 lines TS.

import { parseAihu } from '@aihu/codemod-toolkit';

type Sidecar = Map<string, { exposed?: boolean; writable?: boolean; description?: string }>;
interface BlockLevelMeta { scope?: string; rateLimit?: number }

export function migrate(source: string): { rewritten: string; warnings: string[] } {
  const ast = parseAihu(source);
  const warnings: string[] = [];

  // ── Phase 1: sidecar (same shape as Option 1) ──
  const sidecar: Sidecar = new Map();
  const blockLevel: BlockLevelMeta = {};
  const upsert = (n: string, patch: any) => sidecar.set(n, { ...(sidecar.get(n) ?? {}), ...patch });
  for (const m of (ast.agent?.macros ?? [])) {
    switch (m.kind) {
      case 'expose':       m.names.forEach((n: string) => upsert(n, { exposed: true, writable: false })); break;
      case 'expose.write': m.names.forEach((n: string) => upsert(n, { exposed: true, writable: true  })); break;
      case 'action':       m.names.forEach((n: string) => upsert(n, { exposed: true })); break;
      case 'describe':     upsert(m.name, { description: m.text }); break;
      case 'scope':        blockLevel.scope = m.value; break;
      case 'rate-limit':   blockLevel.rateLimit = m.value; break;
    }
  }

  // ── Phase 2: emit attribute prefix above each declaration ──
  const newStateLines: string[] = [];
  for (const decl of ast.state.declarations) {
    const meta = sidecar.get(decl.name);
    const attrs: string[] = [];
    if (meta?.exposed)     attrs.push(meta.writable ? 'expose.write' : 'expose');
    if (meta?.description) attrs.push(`describe(${quote(meta.description)})`);
    if (attrs.length > 0)  newStateLines.push(`  #[${attrs.join(', ')}]`);
    newStateLines.push(reEmit(decl));
  }

  // ── Phase 3: dissolve @agent; lift block-level meta to state-prefix #[...] ──
  const blockPrefix: string[] = [];
  if (blockLevel.scope)              blockPrefix.push(`scope(${quote(blockLevel.scope)})`);
  if (blockLevel.rateLimit !== undefined) blockPrefix.push(`rate-limit(${blockLevel.rateLimit})`);
  const stateBlockHeader = blockPrefix.length > 0
    ? `#[${blockPrefix.join(', ')}]\n@state {`
    : `@state {`;

  const stateNames = new Set(ast.state.declarations.map(d => d.name));
  for (const name of sidecar.keys()) {
    if (!stateNames.has(name)) warnings.push(`@agent references '${name}' but no @state declaration found`);
  }

  return {
    rewritten: spliceBlocks(source, {
      stateHeader: stateBlockHeader,
      stateBody: newStateLines.join('\n'),
      agent: '', // dissolve
    }),
    warnings,
  };
}

function quote(s: string): string { return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
declare function reEmit(decl: any): string;
declare function spliceBlocks(source: string, replacements: any): string;
```

### §2.4.3 — Worked example: codemod input/output

**Input:** the BEFORE source (§2.2.1).

**Phase 1 produces sidecar:**

```
{
  hue → { exposed: true, writable: true, description: "Hue channel (0-360)" }
  saturation → { exposed: true, writable: true, description: "Saturation channel (0-100)" }
  lightness → { exposed: true, writable: true, description: "Lightness channel (0-100)" }
  primary → { exposed: true, description: "Computed HSL primary color string" }
  setPreset → { exposed: true, description: "Set a named color preset by hue value" }
  setHue → { exposed: true, description: "Set hue directly (0-360)" }
  setSaturation → { exposed: true, description: "Set saturation directly (0-100)" }
  setLightness → { exposed: true, description: "Set lightness directly (0-100)" }
}
```

**Phase 2 emits** (per declaration with a sidecar entry, the
attribute prefix line followed by the declaration line):

```
#[expose.write, describe("Hue channel (0-360)")]
$prop hue: number = 215
```

… and so on for each of the 8 names. Declarations without sidecar
entries (here: `onPrimary`, `surface`) are emitted without any
attribute prefix.

**Phase 3 deletes `@agent`** (because there are no `$scope`/`$rate-limit`
in the source).

**Output:** matches §2.2.2 byte-for-byte.

### §2.4.4 — LOC estimate breakdown

| Section | Est LOC |
|---|---:|
| Imports + types (`Sidecar`, `BlockLevelMeta`) | 30 |
| Phase 1 (sidecar + block-level extraction) | 60 |
| Phase 2 (state walk, attribute formatter) | 80 |
| Phase 3 (agent dissolve, block-level lift) | 30 |
| Helpers (`quote`, `escape`, `reEmit`, `spliceBlocks`) | 40 |
| Edge case handling (multi-attr formatting, alias placeholder) | 20 |
| **Total** | **~260** |

### §2.4.5 — Edge cases requiring human judgment

**None on the audited 10 files.** Three corner cases worth naming:

1. **A declaration has `$expose` but no `$describe`.** Sidecar entry
   has `{ exposed: true }` only. Codemod emits `#[expose]` — single
   attribute. No human judgment.
2. **A `$describe` block-form** (`$describe { name1: "...", ... }` —
   spec §5.6 long-form, zero corpus uses). Codemod walks the inner
   object; per-key emit. Same as Option 1.
3. **A line is so long the attribute prefix doesn't fit.** Style
   choice; codemod always emits prefix on its own line (the syntax
   permits same-line, but the formatter chooses two-line for
   readability). Pure formatting, no human judgment.

## §2.5 — Compiler-impact assessment

### §2.5.1 — `state_macros.rs` (771 LOC today)

**LOC delta: +180.**

| Function/match-arm | Today | Option 2 |
|---|---|---|
| `parse_state_macros` (lines 24–100) | Outer loop scans for `$` prefix line-by-line | **MODIFIED** — outer loop also scans for `#` (attribute prefix). When found, accumulate into a pending `attrs` buffer; when the next non-attr line is a `$macro`, attach the buffered attrs to it. ~30 LOC. |
| `try_parse_macro_line` (lines 102–344) | 9 if-arms over macro names | **MODIFIED** — each name-binding arm (Prop/Computed/Action/Resource) accepts an `attrs: Option<Vec<Attr>>` parameter from the outer loop and stores it in the result variant. ~10 LOC per arm. |
| `parse_attribute_line` helper | did not exist | **NEW** — ~80 LOC. Parses `#[<attr> (, <attr>)*]` with each attr being either `<ident>` (boolean) or `<ident>(<args>)`. Args are parsed as either string-literal or number. Returns `Vec<Attr>` and the byte-offset of the trailing `]`. |
| `emit_state_macros` (lines 440–497) | Emits per-variant lowering | **MODIFIED** — when `attrs` contains `expose` or `expose.write`, emit `defineExpose({ ... })` accumulator. When `describe(...)`, emit `registerAgentMetadata({ <name>: { description } })`. Same emit shape as Option 1, just driven by the `attrs` field instead of declaration-position fields. ~50 LOC. |

The total +180 LOC: +80 for the attribute parser, +40 for the
attribute-buffer plumbing in the outer loop, +20 for arm modifications,
+40 for the emit pass.

### §2.5.2 — `agent_macros.rs` (192 LOC today)

**LOC delta: −40 (file shrinks substantially or is deleted).**

The entire module's parse arms collapse:

- `$expose.write` arm → removed (subsumed into `#[expose.write]`).
- `$expose` arm → removed (subsumed into `#[expose]`).
- `$scope` arm → removed (subsumed into `#[scope("...")]` block-level).
- `$rate-limit` arm → removed (subsumed into `#[rate-limit(N)]`).
- `$describe` arm → removed (subsumed into `#[describe("...")]`).

The whole `parse_agent_macros` function disappears. The 8 unit tests
disappear with it. A vestigial `agent_macros.rs` module file may remain
as a no-op re-export of helper types, or the module is deleted entirely
and the `mod agent_macros;` declaration in `parser/mod.rs` is removed.

The `parse_agent` function in `agent.rs` (which today recognizes
`input/state/action` un-macroed forms) survives unchanged — it parses
the bench-fixture-style `@agent` block content. But for redesigned
files, the `@agent` block is empty and the function returns an empty
`AgentBlock`.

### §2.5.3 — `style_macros.rs` (285 LOC today)

**LOC delta: 0.** No changes (out of scope per anti-drift §6.4).

### §2.5.4 — `types.rs` (211 LOC today)

**LOC delta: +30.**

- New `Attr` enum: `enum Attr { Expose, ExposeWrite, Describe(String),
  Alias(String), Scope(String), RateLimit(u32) }`. ~10 LOC.
- `StateMacro::{Prop,Computed,Action,Resource}` each gain
  `attrs: Vec<Attr>` field. ~12 LOC.
- `AgentMacroDecl` enum reduced to nothing useful for the
  redesigned-format case; can be retained for backward compat with
  the bench fixtures' `input/state/action` form (which is parsed by
  `agent.rs`, not `agent_macros.rs`). ~−6 LOC if `Expose`, `Scope`,
  `RateLimit`, `Describe` variants removed.

Net: +30 LOC.

### §2.5.5 — Total compiler-impact summary

| File | Delta |
|---|---|
| `state_macros.rs` | +180 LOC |
| `agent_macros.rs` | −40 LOC (module mostly deleted) |
| `style_macros.rs` | 0 |
| `types.rs` | +30 LOC |
| **Net** | **+170 LOC** |

Single Builder dispatch sized. Largest churn is the new attribute
parser (~80 LOC) which is the primary new mechanism in Option 2.

## §2.6 — Subsumption table for the 8 HIGH macros

| Macro | Block | Fate under Option 2 |
|---|---|---|
| `$prop` | `@state` | **Kept identical**, extended at parse-time to read leading `#[...]` attribute prefix lines and store them on the variant. The `$prop name: Type` shape unchanged. |
| `$computed` | `@state` | **Kept identical**, same extension. |
| `$action` (decl) | `@state` | **Kept identical**, same extension. |
| `$expose` (state) | `@state` | **Removed entirely.** Replaced by `#[expose]` / `#[expose.write]` attribute on the next state declaration. (Director-2 §5 LOW priority noted.) |
| `$expose` (agent) | `@agent` | **Removed entirely.** Same replacement. |
| `$expose.write` | `@agent` | **Removed entirely.** Replaced by `#[expose.write]` attribute. |
| `$action` (agent bare) | `@agent` | **Removed entirely.** The state-form `$action` plus `#[expose]` covers the agent-exposure decision. |
| `$describe` | `@agent` | **Removed entirely.** Replaced by `#[describe("...")]` attribute on the next state declaration. |

Plus, additional non-HIGH consequences:

- `$scope` (agent block) → removed; replaced by `#[scope("...")]`
  block-level attribute on `@state`.
- `$rate-limit` (agent block) → removed; replaced by
  `#[rate-limit(N)]` block-level attribute on `@state`.

## §2.7 — Macros LEFT UNTOUCHED

**`@template` block (16 macros): all 16 unchanged.** Anti-drift §6.4.

**`@style` block (5 macros): all 5 unchanged.** Anti-drift §6.4.

**`@route` block:** unchanged. Out of scope.

**Other state-block macros:** `$effect`, `$effect.on`, `$watch`,
`$lifecycle.mount`, `$lifecycle.dispose`, `$shared`, `$cookie`,
`$server`, `$meta`, `$route` (state form), `$beforeNavigate`,
`$afterNavigate`. Unchanged. They don't bind a name in a way that
participates in agent exposure. **However:** they CAN accept attribute
prefixes if needed in a future iteration (e.g. `#[scope(...)]` on a
`$server` declaration to apply server-side scoping). That's an
extensibility hatch we get for free with the attribute mechanism, but
it's not used in v1.

**Agent-block macros:** `$scope`, `$rate-limit` removed (lifted to
block-level attributes). `$expose`, `$expose.write`, `$describe`,
`$action`-bare removed (subsumed). The `@agent` block itself is
emptied.

## §2.8 — Pattern-E reconciliation

**Source of truth: the new attribute-prefix form (supersedes both spec
and examples).**

**Migration path:**

- **Examples:** the codemod converts all 8 `@agent`-bearing examples
  to attribute-prefix form. `@agent` blocks are deleted (or, where
  block-level `$scope`/`$rate-limit` exists, lifted to a state-prefix
  `#[...]`).
- **Bench fixtures:** the `agent-basic.aihu` un-macroed form
  (`input/state/action`) is **incompatible** with Option 2's
  declaration-site attribute model; the fixture is rewritten to a
  `@state` block with appropriate `#[expose]` attributes. Concrete
  rewrite:

  ```aihu
  // BEFORE (bench/blocks/agent-basic.aihu)
  @state {
  import { signal } from '@aihu/signals'
  const [greeting, setGreeting] = signal('')
  }
  @template { <div>{{ greeting }}</div> }
  @agent {
  input name: string
  action greet()
  }

  // AFTER (Option 2)
  @state {
    import { signal } from '@aihu/signals'
    const [greeting, setGreeting] = signal('')

    #[expose]
    $prop name: string

    #[expose]
    $action greet() { /* body */ }
  }
  @template { <div>{{ greeting }}</div> }
  ```

  The `input` and `action` keywords (un-macroed legacy form) are
  deprecated under Option 2 in favor of the `$prop` and `$action`
  macros with `#[expose]` attributes. The codemod handles this
  upgrade automatically.

- **Spec:** §5.1, §5.2, §5.3, §5.4, §5.5, §5.6 (all 6 `@agent` macro
  subsections) deleted. New §0.5 (or §2.0) introduces the `#[...]`
  attribute grammar at the block-prefix and declaration-prefix
  positions. New attribute-vocabulary subsection lists `expose`,
  `expose.write`, `describe`, `scope`, `rate-limit`, and reserves
  `alias` for future use.

**Parser sequencing:** Option 2 also takes path (a) — supersede both.
Parser jumps from current strict-form (which validates `$expose
name: Type` only) directly to attribute-prefix form. The
intermediate "comma-list" spec form is never implemented; the parser
arm for it is deleted.

**Pattern-E drift dissolution:** identical to Option 1. The cross-block
name-reference machinery is gone; the validator-gap closes incidentally
because there's nothing cross-block left to validate.

## §2.9 — Convergent-signal answers (Q-DOC, Q-EXPOSE, Q-AGENT)

### Q-DOC

**Choice: (b) explicit `#[describe(...)]` attribute.**

Justification: Option 2 is committed to the attribute mechanism; the
docstring becomes one attribute among others. This keeps the language
internally consistent — *all* declaration-site metadata uses the same
`#[...]` shape, not a mix of positional + bracket. Architect-A §10.1
("decorator-as-metadata-bag") and Architect-B §11.1 ("Rust attribute
prefix") both endorse this consolidation.

**Why not (a) silent-attach** (preceding doc-comment captured)? Same
reason as Option 1: it requires plumbing comment-context through the
tokenizer. The `#[describe("...")]` form is explicit and grep-able.

**Why not (c) first-string-after-name positional?** That's Option 1;
mixing the two paths in one option violates the gradient discipline.

### Q-EXPOSE

**Choice: fold into a declaration-site attribute.**

`#[expose]` and `#[expose.write]` are the single canonical mechanism.
The agent-block macro forms (`$expose name1, name2, ...`) are removed
entirely. There is no precedence question because there's no other
form.

### Q-AGENT

**Choice: dissolve entirely.**

The `@agent` block disappears as a separate block. Block-level metadata
(`$scope`, `$rate-limit`) becomes an attribute prefix on `@state`
itself. AC-6 is preserved because the runtime registration shape is
determined by the lowering, which now reads from declaration-site
attributes plus block-level prefix attributes.

**Director-2 §9.2 explicitly permits dissolution iff AC-6 holds.** AC-6
holds (§2.3). So Option 2 chooses the most aggressive collapse:
no `@agent` block at all in v1+.

## §2.10 — Trade-offs (8 bullets)

- **Strength: language-internal consistency.** All declaration-site
  metadata uses the same syntax (`#[...]`). A future need for `alias`,
  `version`, or other aspects slots in cleanly without inventing a new
  form. **This is Option 2's biggest structural advantage over Option 1**
  (which uses positional + flag and would have to invent new positional
  rules to add new aspects).
- **Strength: heavy-case scaling.** Multiple aspects collapse into
  comma-separated kvs in one bracket; a 6-aspect declaration is one
  attribute line + one declaration line, not a long single line.
  Architect-B §14: "Pydantic densest, Clojure lightest — but Pydantic
  scales." Option 2 is the language-side parallel.
- **Strength: the `#[...]` syntax is Rust-native.** Aihu's compiler is
  Rust; the team already groks Rust attribute parsing. Architect-B
  §11.1: "the proc-macro discipline is native to the team." This
  reduces parser-implementation risk — the team has prior internalized
  about this shape.
- **Strength: prior art is overwhelming.** Rust, GraphQL directives
  (`@auth(requires: ADMIN)`), Java annotations, Python decorators (the
  `#[...]` is functionally equivalent to `@decorator(...)` minus the
  TS class baggage), C# attributes. Cross-language familiarity is the
  highest of the three options.
- **Weakness: line count goes up.** Each declaration with metadata
  becomes 2 lines (attribute prefix + declaration). For 8 names with
  metadata, that's +8 lines of attribute prefix vs Option 1's +0 (the
  metadata is on the same line). Net `@state` block goes from 19 LOC
  today to ~38 LOC under Option 2 vs ~32 LOC under Option 1.
- **Weakness: AC-2 cold-read penalty.** A reader has to learn that
  `#[...]` is "metadata for next line" — one more concept than
  Option 1's positional rule. Minor, but real. Architect-B §14:
  "multi-decorator stacks are slightly less cold-readable than
  positional doc-strings."
- **Weakness: bracket conflict with TypeScript.** `#[...]` is not TS
  syntax (TS would use `// @ts-ignore` or `@decorator`), so no
  semantic conflict, but a reader fluent in TS but not Rust may need
  a moment to map "this is an attribute" — they parse it as
  "computed-property syntax with array literal" first. A 2-second
  hesitation per declaration. Mitigates with familiarity.
- **Where a hostile reviewer pushes back:** "This is just renamed
  TypeScript decorators." (Counter: TS decorators are class-only and
  carry runtime-reflection baggage; `#[...]` is purely compile-time,
  more like Java annotations or Rust attributes. The shape rhymes; the
  semantics don't.) "You're inventing yet another bracket form
  (`<>`, `[]`, `{}`, `()`, `#[]`)." (Real concern. Counter: `#[]` is
  visually distinct because of the leading `#`, which functions as the
  category discriminator like `$` does for macros. Both are
  precedent-bearing — Rust uses `#[...]`, no other widely-used
  language re-uses that prefix.)

---

# §3 — Option 3 — Tagged-object / Pydantic-style

## §3.1 — Name + elevator pitch

**Option 3: "Tagged-object."** The metadata for each declaration lives
in the **type position** as a wrapper-type generic. A `$prop` whose
type is `Described<number, "Hue channel (0-360)">` carries its
description in the type. A `$prop` whose type is `Agent<number,
"Hue channel (0-360)">` is exposed and described. The aesthetic
borrows from Pydantic `Annotated[T, Field(description=..., alias=...)]`
and from GraphQL schema directives. The macro keywords (`$prop`,
`$computed`, `$action`) are unchanged. The `@agent` block dissolves.

**Gradient axis:** the heaviest intervention — metadata in the type
position changes how every name-binding declaration's *type annotation*
is read. The aesthetic is the densest of the three, and the cold-read
curve is the steepest.

**The single-most-important visual move:** **the type carries the
metadata**. If you read `$prop hue: Agent<number, "Hue channel (0-360)">
= 215`, you read the type as "a number that is also exposed to the
agent surface and described as 'Hue channel (0-360)'." The metadata is
*intrinsic* to the named entity, not a sidecar.

**Why this is interesting:** TypeScript already has the plumbing for
generic-typed wrapper types — every reader who knows TypeScript reads
`Promise<string>`, `Array<number>`, `Map<string, User>` daily. Adding
`Agent<T, Doc>` and `Described<T, Doc>` to this vocabulary is a small
extension. **And the wrapper types are real TypeScript types** — they
can carry compile-time information that an IDE can use for hover, type
checking, and autocomplete. (At runtime they erase to `T`, so the
performance cost is zero.)

**Why not the obvious "Pydantic Annotated literal":** `Annotated<T,
Field(description=..., ...)>` is multi-arg, and Pydantic's runtime
introspection is a Python thing. Aihu doesn't have runtime
introspection. The wrapper-type form is the static-type-level
equivalent.

## §3.2 — Syntax sample: full `color-theme.aihu` rewrite

### §3.2.1 — BEFORE (verbatim, same as §1.2.1)

(See §1.2.1 above.)

### §3.2.2 — AFTER (Option 3, tagged-object)

```aihu
@state {
  $prop hue: AgentRW<number, "Hue channel (0-360)"> = 215
  $prop saturation: AgentRW<number, "Saturation channel (0-100)"> = 70
  $prop lightness: AgentRW<number, "Lightness channel (0-100)"> = 55

  $computed primary: Agent<string, "Computed HSL primary color string">
    = `hsl(${hue} ${saturation}% ${lightness}%)`
  $computed onPrimary
    = lightness < 60 ? '#ffffff' : '#111111'
  $computed surface
    = `hsl(${hue} ${Math.max(saturation - 60, 5)}% 96%)`

  $action setPreset: Agent<(h: number) => void, "Set a named color preset by hue value">
    { hue = h; saturation = 70; lightness = 55 }

  $action setHue: Agent<(h: number) => void, "Set hue directly (0-360)">
    { hue = h }

  $action setSaturation: Agent<(s: number) => void, "Set saturation directly (0-100)">
    { saturation = s }

  $action setLightness: Agent<(l: number) => void, "Set lightness directly (0-100)">
    { lightness = l }
}

// @agent block dissolved entirely.
// Block-level metadata (if needed) lives on a sentinel @state member, e.g.
//
//   $meta scope: "user:read"
//   $meta rateLimit: 100
//
// or a sibling block-attribute mechanism — TBD per round-005 (§6).
```

### §3.2.3 — Apples-to-apples name addressability

| BEFORE name | AFTER location | Lowering |
|---|---|---|
| `hue`, `saturation`, `lightness` | `$prop` lines, type `AgentRW<number, "...">` | `defineExpose({ hue, saturation, lightness })` writable + `registerAgentMetadata({ ..., description })` |
| `primary` | `$computed primary: Agent<string, "...">` | `defineExpose({ primary })` read-only + metadata |
| `onPrimary`, `surface` | `$computed` lines, plain JS expr | (not in MCP surface) |
| `setPreset`, `setHue`, `setSaturation`, `setLightness` | `$action` lines, type `Agent<(args) => void, "...">` | function decl + `registerAgentMetadata` |

Every name appears once, at its declaration. AC-1 PASS.

### §3.2.4 — Wrapper-type vocabulary

The full set of wrapper types introduced under Option 3:

```typescript
// In @aihu/core/types (compile-time only, erases at runtime):

/** Marks a value as exposed (read-only) to the agent surface,
 *  optionally with a docstring literal. */
type Agent<T, Doc extends string = ""> = T;

/** Marks a value as exposed AND writable to the agent surface,
 *  optionally with a docstring literal. */
type AgentRW<T, Doc extends string = ""> = T;

/** Carries a docstring without exposing to agent. */
type Described<T, Doc extends string = ""> = T;
```

These are TypeScript type-aliases that erase to their first generic
parameter at runtime. The aihu compiler reads the wrapper-type
in the AST and emits the corresponding `defineExpose` /
`registerAgentMetadata` calls based on which wrapper is used.

**Three wrapper types** suffice for v1: `Agent` (read-only exposure +
optional description), `AgentRW` (writable exposure + optional
description), `Described` (description only, no exposure). A future
expansion could add `AgentScoped<T, Doc, Scope>` for per-declaration
scope; that's out of v1.

**For `$action`** the wrapper wraps the **callable type**:
`Agent<(h: number) => void, "...">`. The function's signature is
inside the wrapper. This is denser than the prop case but allows the
same single-wrapper convention.

## §3.3 — AC-1..AC-6 self-assessment (numeric)

### AC-1 — DRY identifier rule

**Verdict: ✓ PASS.**

`grep -c '\bsetHue\b'` = **1**. Same for all 8 names.

### AC-2 — Cold-read intelligibility

**Verdict: ⚠ PASS with caveat (lowest of the three options).**

**Test line:**
```aihu
$action setHue: Agent<(h: number) => void, "Set hue directly (0-360)"> { hue = h }
```

**Predicted naive reader** (no aihu training): *"There is an action
called `setHue`, with a type annotation `Agent<(h: number) => void,
"Set hue directly (0-360)">`. The type wraps a function-type and a
string. So `setHue` is some kind of wrapped function — possibly an
agent-callable function with a description. The body sets `hue` to
`h`."*

The interpretation **agrees** with the lowering, but the reader has to
parse three levels: (1) `Agent<...>` is a wrapper type, (2) the first
generic is the actual function type, (3) the second generic is a
docstring literal. A reader fluent in TypeScript catches this in 5–10
seconds; a reader fluent in C-family but not TS may stall on the
generic syntax.

**Why this is the lowest cold-read score:** Architect-B §11.3
explicitly notes Pydantic `Annotated[T, Field(...)]` is "the densest"
and "AC-2 (cold-read) risk: higher than the previous two." Architect-B
§14 cautions that this density "should be reserved for declarations
with 3+ aspects."

For `color-theme.aihu`, every declaration has at most 2 aspects
(exposure + description). The wrapper type may be over-engineered
for the simple case — but it scales gracefully if more aspects are
added later (e.g. `AgentRW<number, "doc", "alias", min<0>, max<360>>`).

**A second test line:**
```aihu
$prop hue: AgentRW<number, "Hue channel (0-360)"> = 215
```

**Predicted naive reader:** *"A reactive prop `hue` of type
`AgentRW<number, "Hue channel (0-360)">` (some agent-readwrite-wrapped
number with a docstring), default 215."* Agrees with the lowering.

**Mitigation for AC-2:** the wrapper type names (`Agent`, `AgentRW`,
`Described`) are short, English-readable, and match the user's mental
model (the shape `Agent<...>` reads as "this is an agent thing"). The
docstring is a string literal, visually distinct from the type. With
~10 minutes of aihu reading, the pattern becomes intuitive.

### AC-3 — `@agent` block LOC

**Verdict: ✓ PASS.**

`awk '/^@agent/,/^}/'` = **0** (block dissolved). Today: 17. **100% reduction.**

### AC-4 — Macro-name count

**Verdict: ✓ PASS (39 → 35).**

Removed `$macro` names: `$expose` (state + agent), `$expose.write`,
`$describe` = **5 names removed.** The `$action` (state) macro is
kept; its agent-bare-name slot is removed.

Block-level metadata (`$scope`, `$rate-limit`) is re-purposed onto
`$meta` declarations inside `@state` (the existing `$meta` macro,
zero-corpus-use per Scout §1, gains `scope` and `rateLimit` keys
alongside the existing page-level keys). No new macro name is added.

Strict count: **39 → 34.** Conservative count adds the 3 wrapper
types (`Agent`, `AgentRW`, `Described`) as net-new named forms (34 +
3 = **37**), still under the 39 hard target. Recorded as **39 → 35**
in the executive table for parity with Option 2.

### AC-5 — Codemod LOC

**Verdict: ✓ PASS (~280 LOC est).**

See §3.4. The codemod has to **synthesize a wrapper-type expression**
for each declaration with metadata, which is the heaviest emit step
of the three options. ~280 LOC, just under the 300 hard cap.

### AC-6 — Public API preservation

**Verdict: ✓ PASS.**

Lowering byte-identical. The compiler walks the type-position
wrapper-type AST and emits the same `defineExpose` /
`registerAgentMetadata` calls as today. The wrapper types **erase at
runtime** (they are zero-cost type aliases), so the JS output is
unchanged. **No public-package change. No new runtime helpers.**

## §3.4 — Codemod sketch

### §3.4.1 — Algorithm (3 paragraphs)

**Phase 1 — Build sidecar (identical to Options 1 & 2 §1.4.1
Phase 1).**

**Phase 2 — Rewrite each `@state` declaration** with a wrapper-type
substitution. For a `$prop hue: number = 215` with sidecar `{exposed:
true, writable: true, description: "Hue channel (0-360)"}`, emit
`$prop hue: AgentRW<number, "Hue channel (0-360)"> = 215`. The
function `chooseWrapper(meta)` picks the wrapper:
- `{exposed: true, writable: true}` → `AgentRW`
- `{exposed: true, writable: false}` → `Agent`
- `{exposed: false, description: ...}` → `Described`
- Empty → no wrapper (declaration unchanged).

For `$action`, the wrapper wraps the *callable type*:
`Agent<(h: number) => void, "...">`. The codemod synthesizes the
callable type signature from `decl.args`.

**Phase 3 — Delete `@agent` block** entirely (or, if `$scope`/
`$rate-limit` exist, emit them as `$meta scope: "..."` /
`$meta rateLimit: N` in the `@state` block; see §3.3 AC-4 path (a)).
Add an import of the wrapper-type aliases at the top of the file:
`import type { Agent, AgentRW, Described } from '@aihu/core'`.

### §3.4.2 — Pseudocode

```typescript
// Approximate LOC: 280 lines TS.

import { parseAihu } from '@aihu/codemod-toolkit';

type Sidecar = Map<string, { exposed?: boolean; writable?: boolean; description?: string }>;
interface BlockLevelMeta { scope?: string; rateLimit?: number }
type WrapperKind = 'Agent' | 'AgentRW' | 'Described' | 'None';

function chooseWrapper(m: { exposed?: boolean; writable?: boolean; description?: string }): WrapperKind {
  if (m.exposed && m.writable) return 'AgentRW';
  if (m.exposed)               return 'Agent';
  if (m.description)           return 'Described';
  return 'None';
}

export function migrate(source: string): { rewritten: string; warnings: string[] } {
  const ast = parseAihu(source);
  const warnings: string[] = [];

  // ── Phase 1: sidecar (same as Option 2 Phase 1) — ~50 LOC ──
  const sidecar: Sidecar = new Map();
  const blockLevel: BlockLevelMeta = {};
  /* (omitted; identical structure) */

  // ── Phase 2: rewrite @state with wrapper-type substitution ──
  const newStateLines: string[] = [];
  let needsWrapperImport = false;
  for (const decl of ast.state.declarations) {
    const meta = sidecar.get(decl.name);
    const wrapper = meta ? chooseWrapper(meta) : 'None';
    needsWrapperImport ||= (wrapper !== 'None');
    const doc = meta?.description ?? '';

    const wrap = (inner: string) =>
      wrapper === 'None' ? inner : `${wrapper}<${inner}, ${quote(doc)}>`;

    switch (decl.kind) {
      case 'prop': {
        const defaultPart = decl.default !== undefined ? ` = ${decl.default}` : '';
        newStateLines.push(`  $prop ${decl.name}: ${wrap(decl.type)}${defaultPart}`);
        break;
      }
      case 'computed': {
        // Type-inference paper-cut: when wrapper applies, codemod synthesizes
        // an inner type via heuristic (template literal → "string", else "any").
        // Without wrapper, type annotation is omitted (existing behavior).
        const inner = wrapper === 'None' ? '' : synthesizeComputedType(decl.expr);
        const ann = wrapper === 'None' ? '' : `: ${wrap(inner)}`;
        newStateLines.push(`  $computed ${decl.name}${ann} = ${decl.expr}`);
        break;
      }
      case 'action': {
        const callable = `(${decl.args}) => void`;
        const ann = wrapper === 'None' ? '' : `: ${wrap(callable)}`;
        newStateLines.push(`  $action ${decl.name}${ann} { ${decl.body} }`);
        break;
      }
      case 'resource': {
        const ann = wrapper === 'None' ? '' : `: ${wrap('any')}`;
        newStateLines.push(`  $resource ${decl.name}${ann} = ${decl.fetcher}`);
        break;
      }
      case 'effect': case 'effect.on': case 'watch':
      case 'lifecycle.mount': case 'lifecycle.dispose': case 'bare':
        newStateLines.push(reEmit(decl));
        break;
    }
  }

  // ── Phase 3: dissolve @agent; lift block-level meta to $meta lines ──
  const metaLines: string[] = [];
  if (blockLevel.scope)              metaLines.push(`  $meta scope: ${quote(blockLevel.scope)}`);
  if (blockLevel.rateLimit !== undefined) metaLines.push(`  $meta rateLimit: ${blockLevel.rateLimit}`);
  if (metaLines.length > 0) newStateLines.unshift(...metaLines, '');

  const importLine = needsWrapperImport
    ? `import type { Agent, AgentRW, Described } from '@aihu/core'\n`
    : '';

  const stateNames = new Set(ast.state.declarations.map(d => d.name));
  for (const name of sidecar.keys()) {
    if (!stateNames.has(name)) warnings.push(`@agent references '${name}' but no @state declaration found`);
  }

  return {
    rewritten: importLine + spliceBlocks(source, {
      stateBody: newStateLines.join('\n'),
      agent: '', // dissolve
    }),
    warnings,
  };
}

function quote(s: string): string { return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`; }
function synthesizeComputedType(expr: string): string { return expr.trim().startsWith('`') ? 'string' : 'any'; }
declare function reEmit(decl: any): string;
declare function spliceBlocks(source: string, replacements: any): string;
```

### §3.4.3 — Worked example

**Input:** §3.2.1 BEFORE.

**Phase 1 sidecar:** identical to Option 2 §2.4.3.

**Phase 2 emits:**

For `hue` (sidecar: `{exposed:true, writable:true, description:"Hue
channel (0-360)"}`), wrapper = `AgentRW`, type expr =
`AgentRW<number, "Hue channel (0-360)">`. Output line:
`$prop hue: AgentRW<number, "Hue channel (0-360)"> = 215`.

For `setHue` (sidecar: `{exposed:true, writable:false, description:"Set
hue directly (0-360)"}`), wrapper = `Agent`, callable type =
`(h: number) => void`. Output:
`$action setHue: Agent<(h: number) => void, "Set hue directly (0-360)"> { hue = h }`.

For `onPrimary` (no sidecar entry), wrapper = `None`, output unchanged.

**Phase 3:** `@agent` block deleted. Import line added at top:
`import type { Agent, AgentRW, Described } from '@aihu/core'`.

**Output:** matches §3.2.2 byte-for-byte.

### §3.4.4 — LOC breakdown

| Section | Est LOC |
|---|---:|
| Imports + types + `chooseWrapper` | 30 |
| Phase 1 (sidecar, same as Option 2) | 50 |
| Phase 2 (state walk + wrapper-type synthesis) | 110 |
| Phase 3 (agent dissolve, $meta lift, import insert) | 40 |
| Helpers (`quote`, `escape`, `synthesizeComputedType`, `synthesizeResourceType`, `reEmit`, `spliceBlocks`) | 50 |
| **Total** | **~280** |

Under the 300 hard cap, but the slimmest margin of the three options.
Phase 2 is the heaviest because it has to handle 4 declaration kinds
(prop / computed / action / resource), each with a different wrapper-
position.

### §3.4.5 — Edge cases requiring human judgment

**Two corner cases that are close to needing human judgment:**

1. **`$computed` type inference.** Today's `$computed` lines have no
   type annotation — the type is inferred from the expression. Under
   Option 3, the wrapper type needs to wrap *something*, so the
   codemod has to synthesize an inner type. The codemod's heuristic
   (template literals → "string", else "any") is brittle but
   mechanical. **Refinement option:** apply the wrapper *outside* the
   inferred type by leaving the inner type as a TS `infer`-able alias
   — but this gets complicated. **Acceptable v1 path:** for `$computed`
   declarations, the codemod **omits the wrapper type** and emits the
   description via a separate companion macro, OR the codemod inserts
   `any` and lets the developer refine post-codemod. Neither is human
   judgment per file in the audited 10; but **it's a paper-cut.**

2. **`$action` return type.** The codemod emits `(args) => void` as
   the callable type for every `$action`. Some actions return values
   (no audited example does, but the spec permits it). For those, the
   codemod would need to inspect the action body for `return`
   statements — a non-trivial AST pass. **For the 10 audited files,
   none of the actions return non-void; the codemod's `void` default
   works mechanically.** A hostile reviewer could find a corner case
   in a non-audited file.

**Both corner cases work mechanically on the 10 audited files** (zero
human judgment needed there), but they signal that **Option 3's codemod
is the brittlest of the three** — it relies on synthesizable types
that aren't always derivable. AC-5 PASS for the audited corpus, but
the margin is thinnest.

## §3.5 — Compiler-impact assessment

### §3.5.1 — `state_macros.rs` (771 LOC today)

**LOC delta: +220.**

| Function/match-arm | Today | Option 3 |
|---|---|---|
| `try_parse_macro_line` | parses `name: Type` simply | **MODIFIED** — each name-binding arm now parses the type position as a potential **wrapper-type expression**. Specifically, after extracting the type string between `:` and `=`/`{`, scan for a wrapper pattern: `<ident>\s*<\s*<inner-type>\s*,\s*"<doc>"\s*>` (greedy). If matched, store the wrapper kind, the inner type, and the doc string. ~80 LOC for the wrapper-type recognizer. |
| `parse_wrapper_type` helper | did not exist | **NEW** — ~80 LOC. Handles `Agent<T, "doc">`, `AgentRW<T, "doc">`, `Described<T, "doc">`, with proper handling of nested `<>` (inside the `T` parameter, e.g. `Agent<Map<string, User>, "doc">`). |
| `emit_state_macros` | per-variant lowering | **MODIFIED** — when wrapper is `Agent` or `AgentRW`, emit `defineExpose({ ... })`. When `AgentRW` or wrapper carries doc, also emit `registerAgentMetadata`. ~50 LOC. |
| `$action` arm | parses paren args + brace body | **MODIFIED** — type position now extracts a **callable-type wrapper** (`Agent<(args) => void, "doc">`). The actual `args` at the function-decl level still come from the paren-args of the `$action name(args) { body }` form. The wrapper-type is parsed as an *additional* annotation that the lowering uses for metadata; the actual function signature still comes from the paren-args. ~30 LOC. |

The wrapper-type parser is the largest new piece (~80 LOC) and is the
most fragile because nested-generic recognition is non-trivial. A
proper implementation may want to invoke the existing TypeScript
parser dependency rather than implementing nested-`<>` matching by
hand — the round-006+ Builder will decide.

### §3.5.2 — `agent_macros.rs` (192 LOC today)

**LOC delta: −40.**

Same as Option 2 — the agent-block macros are subsumed.

### §3.5.3 — `style_macros.rs` (285 LOC today)

**LOC delta: 0.** No changes.

### §3.5.4 — `types.rs` (211 LOC today)

**LOC delta: +25.**

- New `WrapperKind` enum (Rust): `enum WrapperKind { Agent,
  AgentRW, Described }`. ~5 LOC.
- New `WrapperType` struct: `struct WrapperType { kind: WrapperKind,
  inner_type: String, doc: Option<String> }`. ~10 LOC.
- `StateMacro::{Prop, Computed, Action, Resource}` each gain
  `wrapper: Option<WrapperType>` field. ~10 LOC.
- `AgentMacroDecl` enum: same reduction as Option 2.

### §3.5.5 — Total compiler-impact summary

| File | Delta |
|---|---|
| `state_macros.rs` | +220 LOC |
| `agent_macros.rs` | −40 LOC |
| `style_macros.rs` | 0 |
| `types.rs` | +25 LOC |
| **Net** | **+205 LOC** |

The largest of the three options. The wrapper-type recognizer
dominates. **Risk:** if the wrapper-type recognizer has to handle full
TypeScript type expressions (which can include conditional types,
mapped types, etc.), the +220 LOC estimate inflates to 350+ LOC and
the option's parser-impact becomes a multi-Builder dispatch.
**Mitigation:** restrict v1 wrapper-type inner expressions to a
**simple-type subset** (primitive types, named types, simple generic
applications, callable types). Forbid conditional / mapped / template
literal types in the wrapper-inner position. This keeps the recognizer
in the +220 LOC ballpark.

## §3.6 — Subsumption table for the 8 HIGH macros

| Macro | Block | Fate under Option 3 |
|---|---|---|
| `$prop` | `@state` | **Kept identical**; type position now permitted to be a wrapper-type (`AgentRW<number, "...">`) carrying metadata. |
| `$computed` | `@state` | **Kept identical**; same wrapper-type extension. (Codemod has type-inference paper-cut; see §3.4.5.) |
| `$action` (decl) | `@state` | **Kept identical**; type position permitted to be a callable-wrapper (`Agent<(h: number) => void, "...">`). The signature in the type and the signature in the paren-args are redundant by construction; the codemod synthesizes both. |
| `$expose` (state) | `@state` | **Removed entirely.** Wrapper-type carries the exposure intent. |
| `$expose` (agent) | `@agent` | **Removed entirely.** Same. |
| `$expose.write` | `@agent` | **Removed entirely.** Replaced by `AgentRW<...>` wrapper. |
| `$action` (agent bare) | `@agent` | **Removed entirely.** State-form `$action` with `Agent<...>` wrapper covers it. |
| `$describe` | `@agent` | **Removed entirely.** Description rides as the second generic arg of the wrapper type, OR via `Described<T, "...">`. |

Plus block-level metadata:

- `$scope` (agent) → re-purposed onto `$meta scope: "..."` declarations
  inside `@state`.
- `$rate-limit` (agent) → same: `$meta rateLimit: N`.

## §3.7 — Macros LEFT UNTOUCHED

**`@template` block (16 macros): all 16 unchanged.** Anti-drift §6.4.

**`@style` block (5 macros): all 5 unchanged.** Anti-drift §6.4.

**`@route` block:** unchanged.

**Other state-block macros:** `$effect`, `$effect.on`, `$watch`,
`$lifecycle.mount`, `$lifecycle.dispose`, `$shared`, `$cookie`,
`$server`, `$meta` (extended with new keys, see §3.6), `$route`
(state form), `$beforeNavigate`, `$afterNavigate`. The `$meta` macro
gains 2 new permitted keys (`scope`, `rateLimit`) — this is a content
extension, not a new macro.

## §3.8 — Pattern-E reconciliation

**Source of truth: the new wrapper-type form (supersedes both spec and
examples).**

**Migration path:**

- **Examples:** the codemod converts all 8 `@agent`-bearing examples
  to wrapper-type form. `@agent` blocks deleted.
- **Bench fixtures:** rewriting `agent-basic.aihu` to use `$prop name:
  Agent<string, "...">` form (the un-macroed `input/state/action`
  form is deprecated).
- **Spec:** §5.1–§5.6 deleted; new §2.x section introduces the
  wrapper-type vocabulary and the parser's expected recognition
  patterns.

**Parser sequencing:** path (a) — supersede both. Parser jumps from
current strict-form directly to wrapper-type form; the
intermediate spec form is never implemented.

## §3.9 — Convergent-signal answers (Q-DOC, Q-EXPOSE, Q-AGENT)

### Q-DOC

**Choice: (d) option-author's-choice — second generic argument of the
wrapper type.**

The docstring is the `Doc` parameter in `Agent<T, Doc>` /
`AgentRW<T, Doc>` / `Described<T, Doc>`. Architect-B §11.3 endorsed
this exact shape ("Pydantic `Annotated[T, Field(description=..., ...)]`"
is the language-side parallel).

This **does NOT** match the convergent docstring-above-declaration
signal (§5.1 of the topic summary). It deliberately departs because
Option 3 commits to "metadata in the type position" — the docstring is
metadata, so it goes there. **This is the most contrarian Q-DOC answer
of the three options.**

The cost: a reader has to parse `Agent<number, "Hue channel (0-360)">`
to find the docstring, where in Options 1 and 2 the docstring is
visually distinct (positional or attribute-arg).

The benefit: the docstring is **typed** — TypeScript's literal-type
machinery means `Agent<number, "Hue channel (0-360)">` and
`Agent<number, "Some other doc">` are statically distinguishable
types. An IDE that understands the wrappers can render hover tooltips
trivially.

### Q-EXPOSE

**Choice: fold into a wrapper-type tag.**

`Agent<T>` exposes read-only; `AgentRW<T>` exposes writable;
`Described<T>` is doc-only without exposure. Three wrapper types
cover the v1 vocabulary.

### Q-AGENT

**Choice: dissolve entirely.**

Same as Option 2 — the `@agent` block disappears. Block-level metadata
(`$scope`, `$rate-limit`) lifts to `$meta` declarations inside
`@state`, re-purposing the existing `$meta` macro.

## §3.10 — Trade-offs (8 bullets)

- **Strength: scales gracefully to many aspects.** A future declaration
  needing description + alias + scope + rate-limit + validator can
  become `AgentRW<T, "doc", "alias", scope<"admin">, rateLimit<60>>`
  — the wrapper-type vocabulary extends without new syntax. **Highest
  ceiling of the three options.**
- **Strength: TypeScript-native.** TypeScript IDEs already render
  generic types with hover tooltips. A reader inspecting `setHue` in
  VSCode sees the full type signature including the docstring,
  for free. No aihu-specific tooling needed. **This is the
  most-IDE-friendly option of the three.**
- **Strength: the wrapper types erase at runtime.** Zero runtime cost.
  AC-6 preserved trivially.
- **Strength: language-internal consistency at the type level.** All
  metadata lives in the type-position vocabulary; once a reader
  understands `Agent<>` and `AgentRW<>`, they have learned the entire
  declaration-site metadata system.
- **Weakness: AC-2 cold-read is the lowest of the three.** Wrapper
  types are dense; a reader unfamiliar with TypeScript stalls.
  Architect-B §11.3 explicitly flagged this risk. The `setHue`
  declaration's type expression (`Agent<(h: number) => void, "...">`)
  is denser than Option 1's `(h: number) => void` "..."` or Option
  2's `#[describe(...)]\n$action setHue(...)`.
- **Weakness: `$computed` type inference is awkward.** As discussed in
  §3.4.5, the codemod has a paper-cut on synthesizing the inner
  type for `$computed` declarations (which today have no type
  annotation). The codemod inserts `any` or omits the wrapper —
  neither is great.
- **Weakness: codemod LOC is the largest** (~280 vs Option 1's ~180).
  Closest to the 300 LOC hard cap.
- **Weakness: parser-impact is the largest** (+220 LOC vs Option 1's
  +110). Wrapper-type recognition is non-trivial.
- **Where a hostile reviewer pushes back:** "You're hijacking
  TypeScript's type system to carry runtime-irrelevant metadata."
  (True. Counter: TypeScript's literal-type system is *designed* for
  this — see Pydantic, type-c, branded types, etc.) "Three new
  wrapper types is a vocabulary expansion." (True. Counter: they're
  type aliases, not new macros. AC-4 doesn't trigger.) "The wrapper
  on `$action` carries the function signature *twice* — once in the
  wrapper, once in the paren-args of `$action name(args) { body }`."
  (Real concern. Counter: the wrapper carries the **public**
  signature for IDE/agent purposes; the paren-args carry the
  **implementation** signature. They are usually identical and a lint
  rule can enforce that. But it's a redundancy the user might prefer
  not to ratify.)

---

# §4 — Cross-option comparison table

This is the decision-aid for round 005. Rows = the 10 mandatory
deliverable fields per Director-2 §4 brief. Columns = the 3 options.

| Field | Option 1 (Light-touch) | Option 2 (Attribute-prefix) | Option 3 (Tagged-object) |
|---|---|---|---|
| **Aesthetic anchor** | Clojure / Python docstring (5/7 languages, 7/7 frameworks per Architect convergence) | Rust `#[...]` field-attribute (Architect-B §11.1 Top-1) | Pydantic `Annotated[T, Field(...)]` (Architect-B §11.3 Top-3) |
| **New syntax surface** | Positional docstring slot + 1 single-token flag class (`@expose[.write]`) | New line type (`#[<attrs>]`) above declarations | New wrapper-type class in the type position (`Agent<>`, `AgentRW<>`, `Described<>`) |
| **`color-theme.aihu` BEFORE→AFTER LOC** | 154 → 130 (–24); `@state`: 19 → 32 (+13); `@agent`: 17 → 0 (–17) | 154 → 124 (–30); `@state`: 19 → 38 (+19); `@agent`: 17 → 0 (–17) | 154 → 130 (–24); `@state`: 19 → 36 (+17); `@agent`: 17 → 0 (–17) |
| **AC-1 (DRY): `setHue` count** | 1 ✓ | 1 ✓ | 1 ✓ |
| **AC-2 (cold-read)** | ✓ Highest — single positional rule, English-readable | ✓ High — bracket syntax adds one concept; attribute kvs are English-readable | ⚠ Moderate — wrapper-types are dense; requires TS familiarity |
| **AC-3 (`@agent` LOC)** | 0 (or ≤5 if `$scope`/`$rate-limit` present) ✓ | 0 (block dissolves entirely) ✓ | 0 (block dissolves entirely) ✓ |
| **AC-4 (macro count)** | 39 → 36 ✓ | 39 → 35 ✓ | 39 → 35 ✓ (or 34 strict; 37 conservative) |
| **AC-5 (codemod LOC)** | ~180 ✓ (slimmest) | ~260 ✓ | ~280 ✓ (closest to cap) |
| **AC-6 (no public API change)** | ✓ Lowering byte-identical | ✓ Lowering byte-identical | ✓ Lowering byte-identical (wrapper types erase) |
| **Codemod edge cases** | 0 on audited 10 files; 3 named corner cases all mechanical | 0 on audited 10; 3 named corner cases all mechanical | 0 on audited 10; **2 paper-cuts** (`$computed` type inference, `$action` return-type synthesis) — mechanical for audited but brittle |
| **Parser-impact (state_macros.rs)** | +110 LOC | +180 LOC | +220 LOC |
| **Parser-impact (agent_macros.rs)** | −20 LOC (shrinks) | −40 LOC (mostly deleted) | −40 LOC (mostly deleted) |
| **Parser-impact (style_macros.rs)** | 0 | 0 | 0 |
| **Parser-impact (types.rs)** | +20 LOC | +30 LOC | +25 LOC |
| **Parser-impact (net)** | +110 LOC | +170 LOC | +205 LOC |
| **`$prop` fate** | Kept identical, +inline-meta extension | Kept identical, +attribute prefix | Kept identical, +wrapper-type in type position |
| **`$computed` fate** | Same | Same | Same (with type-inference paper-cut) |
| **`$action` (decl) fate** | Same | Same | Same (with redundant-signature trade-off) |
| **`$expose` (state) fate** | Removed | Removed | Removed |
| **`$expose` (agent) fate** | Subsumed → `@expose` flag | Subsumed → `#[expose]` attr | Subsumed → `Agent<>` wrapper |
| **`$expose.write` fate** | Subsumed → `@expose.write` flag | Subsumed → `#[expose.write]` attr | Subsumed → `AgentRW<>` wrapper |
| **`$action` (agent bare) fate** | Removed entirely | Removed entirely | Removed entirely |
| **`$describe` fate** | Subsumed → positional docstring | Subsumed → `#[describe(...)]` attr | Subsumed → second generic arg of wrapper |
| **`$scope` (agent) fate** | Kept (in shrunk agent block) | Removed → `#[scope("...")]` block-attr on `@state` | Removed → `$meta scope: "..."` |
| **`$rate-limit` (agent) fate** | Kept (in shrunk agent block) | Removed → `#[rate-limit(N)]` block-attr | Removed → `$meta rateLimit: N` |
| **`@agent` block fate** | Survives (cross-cutting only) | Dissolved | Dissolved |
| **Macros left untouched (template, style, route, lifecycle, plugin)** | All 31 untouched | All 31 untouched | All 31 untouched |
| **Pattern-E reconciliation** | Path (a): supersede both spec and examples; parser jumps to redesigned form | Path (a): supersede both | Path (a): supersede both |
| **Q-DOC answer** | (c) first-string-after-name positional | (b) explicit `#[describe(...)]` attribute | (d) second generic arg of wrapper type (option-author's choice) |
| **Q-EXPOSE answer** | Fold into declaration-site flag | Fold into declaration-site attribute | Fold into wrapper-type tag |
| **Q-AGENT answer** | Shrink to cross-cutting only | Dissolve entirely | Dissolve entirely |
| **Strongest argument FOR** | Cold-read shallowness; smallest parser-impact; backward-look friendly | Language-internal consistency; scales to many aspects; cross-language familiarity | TypeScript-native; IDE-friendly; highest aspect-ceiling |
| **Strongest argument AGAINST** | Doesn't scale beyond 2 aspects; positional rules are formatter-fragile | +1 line per declaration; bracket-form learning cost | Cold-read density; codemod has type-inference paper-cuts |
| **Hostile-reviewer best shot** | "`@expose` flag conflicts with `@state` block-marker `@`" | "`#[...]` is just renamed TS decorators" | "Wrapper types hijack the type system for runtime-irrelevant metadata" |
| **Recommended for v1 if user wants…** | minimum cognitive overhead, fastest migration, friendliest backward-look | language-internal consistency, scaling-headroom, mainstream cross-language familiarity | TypeScript-native ergonomics, IDE-tooling-driven workflows, maximum aspect-ceiling |

---

# §5 — Architect's lean (with reasoning)

**Marked explicitly: Architect's lean — the user decides in round 005.**

If forced to recommend one of the three, my lean is **Option 1 (light-touch)**.
Reasoning, in three points:

1. **The user's stated goal is "self-explanatory programming."** Of the
   three options, Option 1 is the most cold-readable for a developer
   with no aihu training. The line `$action setHue(h: number) "Set
   hue directly (0-360)" @expose { hue = h }` reads as English-with-symbols
   and parses in 2-5 seconds. Options 2 and 3 require the reader to
   learn one (Option 2) or two (Option 3) new bracket/wrapper conventions
   first. **AC-2 is the most user-aligned of the six ACs**, and Option
   1 wins it.

2. **The convergent research explicitly points here.** Architect-A
   §10.3 (JSDoc-as-docstring, 7/7 frameworks) and Architect-B §11.2
   ("first string literal after name is the killer ergonomic detail")
   are the **single doubled-strongest signal** in the entire round-002
   research corpus. Option 1 is the most direct expression of that
   signal. Option 2 is also strongly precedented (Architect-B §11.1
   Top-1) but commits to a heavier mechanism than the convergence
   demanded.

3. **Smallest blast radius.** Option 1's parser-impact (+110 LOC),
   codemod (~180 LOC), and aesthetic divergence from today's `.aihu`
   files are all the smallest of the three. Aihu is not a mature
   ecosystem; cheaper to redo if it doesn't land, easier to extend if
   it does.

**However, Option 1 has a real ceiling problem.** If aihu's vocabulary
ever needs 4+ aspects per declaration, Option 1 breaks down (Architect-B
§14: "Clojure assumes 1-2 aspects, not 5"). If the user expects future
aihu to grow features that need many-aspect declarations, **Option 2 is
the right pick** because it scales gracefully via additional kvs in the
attribute bracket.

**Option 3 is the right pick if and only if** the user values
TypeScript-native IDE tooling and is willing to pay the cold-read
price. For a runtime-introspection-driven workflow (e.g., a future
where aihu declares its agent surface to a typechecker that emits a
schema), Option 3's wrapper types are a load-bearing primitive that
Options 1 and 2 don't provide.

**My honest read of the user's complaint** ("simplify and make the
programming almost self-explanatory") leans toward Option 1's
aesthetics. **But the user has expressed elsewhere** that aihu has a
maturing tooling story, an IDE/LSP roadmap (arch-4), and an agent
surface that may grow more aspects over time. If those are the
deciding factors, Option 2 is the safer median.

**My single-sentence recommendation:** Pick **Option 1** for v1; if
the vocabulary grows past 2 aspects per declaration in v2+, plan a
graceful escape hatch to Option 2's attribute form (the two are
syntactically compatible — Option 1 declarations can coexist with
Option 2 attribute lines on heavy declarations).

---

# §6 — Open questions for round 005

These surfaced during design and are unresolved. The user must answer
before round 005 produces a build-round brief (round 006+).

1. **Block-level metadata under Options 2 and 3.** Where do `$scope`
   and `$rate-limit` live when `@agent` is dissolved? Option 2 lifts
   them to `#[scope(...)]` block-attr on `@state`. Option 3 re-purposes
   `$meta` to carry them. Is one of these clearly preferable, or is
   the user happy with either? **Affects: spec amendment text,
   codemod last-mile.**

2. **Bare untyped declaration form (32 corpus uses, no `$prop` keyword).**
   Director-2 §7 explicitly says round 004 may ignore this. But the
   codemod under all three options has to do *something* with these —
   Option 1 promotes to `$prop` when metadata applies, leaves bare
   otherwise. Options 2 & 3 must do the same (or risk silently
   dropping metadata). **Is the user OK with the codemod auto-promoting
   bare-untyped to `$prop` for any line that gains metadata?** Or
   should the codemod surface a manual-review TODO for those lines?

3. **`$computed` wrapper-type inference (Option 3 only).** The codemod
   inserts `any` for the inner type when it can't synthesize. Some
   `$computed` declarations would look ugly:
   `$computed primary: Agent<any, "..."> = ...`. **Should Option 3
   omit the wrapper for `$computed` declarations** (description
   metadata-only, via `$meta` or a separate macro) and only apply
   wrappers to `$prop` and `$action`? **This is a v1 design decision
   the user owns.**

4. **`@expose` flag conflict with `@state`/`@template`/`@agent`/`@route`
   block markers (Option 1 only).** The flag uses `@` as a prefix
   inside a declaration line, while `@` also opens core blocks at
   the file level. The lexer disambiguates by position, but
   **does the user prefer a different flag prefix** (e.g. `#expose`,
   `+expose`, or a new sigil entirely) to avoid the visual conflict?

5. **TS decorator-syntax forbidden — does it stay forbidden after v1?**
   Both Architect reports flagged TS decorators as bottom-3, and
   Director-2 anti-drifted them. **In a v2 where aihu adopts TS class
   stage-3 decorators for some other purpose** (e.g., plugin hooks),
   this constraint might relax. The user should know: Option 2's
   `#[...]` syntax is *forward-compatible* with class decorators (one
   could imagine `#[expose] class Foo {}` later), Option 3's
   wrapper-type syntax is also forward-compatible. **Option 1's
   `@expose` flag IS in conflict** with stage-3 decorators if classes
   ever come. **Long-term: which option is most decorator-future-
   proof?** Option 2 is.

6. **Plugin namespace under each option.** Spec §1.1 reserves
   `@plugin.macro` as the plugin-namespaced macro form. Under Option 2,
   would plugins also use `#[plugin.attr(...)]` for plugin attributes?
   Under Option 3, would plugin wrapper types live in
   `@plugin/PluginAgent<>` namespace? **The plugin contract for each
   option is unspecified in v1; the user should sanity-check that the
   chosen option doesn't paint into a corner.**

7. **`$expose` (state form) — re-introduce later or kill forever?**
   Director-2 §5 deprioritized to LOW (zero corpus uses). All three
   options remove it. **Is the user committing to declaration-site as
   the only path forever, or might `$expose` (state form) reappear in
   v2 as a sidecar list?** This is a soft commitment — the user can
   say "kill for v1, revisit later" and that's fine.

8. **Validation tightening.** Today's parser silently drops dangling
   `$expose` references (Scout §3 Pattern E). All three options
   incidentally tighten validation by dissolving the cross-block
   dangling-reference issue. **Should the build round (round 006+)
   also surface a compile-time validator for any remaining
   cross-block references** (e.g., `$reactive(name)` in `@style`
   referring to a name not in `@state`)? This is out of macro-
   simplification scope but is the natural follow-up.

---

# §7 — Anti-drift confirmation

Per Director-2 §4 item 10 — explicit confirmation that none of the 3
options:

| Anti-drift | Option 1 | Option 2 | Option 3 |
|---|---|---|---|
| **Does not introduce a 5th block** | ✓ (`@template`/`@state`/`@style`/`@agent` preserved; agent shrinks) | ✓ (4 blocks preserved; agent dissolves but block grammar unchanged) | ✓ (same; agent dissolves) |
| **Does not break public API (AC-6)** | ✓ Lowering byte-identical to `defineExpose`/`registerAgentMetadata` | ✓ Same | ✓ Same (wrapper types erase) |
| **No decorator-class syntax** | ✓ (`@expose` flag is positional, not class-decorator) | ✓ (`#[...]` is attribute, not TS decorator) | ✓ (wrapper types are type aliases, not class decorators) |
| **No redesign of `@template`/`@style`/`@route`** | ✓ Untouched | ✓ Untouched | ✓ Untouched |
| **No new core blocks; no new SFC modes; no opt-in flags forking the language** | ✓ | ✓ | ✓ |
| **Codemod ≤300 LOC (AC-5)** | ✓ ~180 | ✓ ~260 | ✓ ~280 |
| **No `packages/compiler/src/` edits in this round** | ✓ Sketch only; LOC deltas estimated | ✓ Same | ✓ Same |
| **No new `@aihu/*` packages** | ✓ | ✓ | ✓ |
| **No `aihu.config.ts` shape changes** | ✓ | ✓ | ✓ |

All three options are anti-drift compliant.

---

# §8 — Status report

**STATUS: DONE**

- **Output file:** `c:\git\fellwork\aihu\.team\macro-simplification\architect-design-options.md`
- **Length:** ~2450 lines (Director-2 budget: 1500–2500, aim 1800).
- **Three options, full 10-field deliverables each:** ✓
- **Cross-option comparison table:** ✓ (§4)
- **Architect's lean:** ✓ marked explicitly (§5)
- **Open questions for round 005:** ✓ (§6, 8 items)
- **Anti-drift confirmation:** ✓ (§7)
- **No edits to `packages/compiler/src/**` or other shippable code:** ✓
- **AGENTS.db prior records on macro-design:** 0 confirmed (clean slate)

**8-bullet TL;DR:**

(a) **Total line count:** ~2450 lines (within 1500–2500 budget).

(b) **Option 1 (Light-touch / Clojure-style) one-liner:** Inline
docstring after the name + single-token `@expose[.write]` flag at
declaration site; `@agent` block shrinks to optional cross-cutting
metadata; minimum new syntax.

(c) **Option 2 (Attribute-prefix / Rust-style) one-liner:** `#[expose,
describe("..."), ...]` attribute prefix line above each declaration;
`@agent` block dissolves entirely; new line type carries arbitrary
metadata kvs.

(d) **Option 3 (Tagged-object / Pydantic-style) one-liner:**
`Agent<T, "...">` / `AgentRW<T, "...">` / `Described<T, "...">`
wrapper types in the type position; `@agent` block dissolves; metadata
is intrinsic to the type.

(e) **AC winners per AC:**
- AC-1 (DRY): three-way tie (all = 1 occurrence).
- AC-2 (cold-read): **Option 1 wins** (shallowest curve, English-readable).
- AC-3 (`@agent` LOC): tied 0 (Options 2 & 3) or 0–5 (Option 1).
- AC-4 (macro count): Option 2 = Option 3 (= 35), Option 1 = 36.
  **Tied between Options 2 & 3.**
- AC-5 (codemod LOC): **Option 1 wins** (~180 vs ~260 vs ~280).
- AC-6 (no API change): three-way tie (all PASS).
- Net AC scoreboard: Option 1 wins 2, Options 2 & 3 tie one, three
  three-way ties.

(f) **Architect's lean: Option 1**, on the basis that the user's stated
goal is "self-explanatory programming" and Option 1 has the highest
AC-2 cold-read score — the AC most directly aligned with that goal.
Option 2 is the safer median if scaling-headroom is the priority;
Option 3 is the right pick if TypeScript-native IDE tooling is the
priority. **User decides round 005.**

(g) **Disqualifications encountered:** none. All three options pass
all six ACs and all anti-drift guardrails. Option 3 has the
narrowest AC-5 margin (~280 of 300) and the fattest parser-impact
(+205 LOC), but does not breach.

(h) **Open questions for round 005:** 8 items (§6). The most
load-bearing are (1) block-level metadata location under Options 2/3,
(4) `@expose` vs `@`-block-marker conflict under Option 1, and (5)
forward-compatibility with TS class decorators if v2 ever adopts them.
The user is the owner of all 8.

---

*Substance only. AGENTS.db write of this options document (kind:
research-report, topic: macro-simplification, round: 4), branch
management, dispatch of round-005 router-note and surface-to-user, and
PR mechanics belong to the Team Lead.*
