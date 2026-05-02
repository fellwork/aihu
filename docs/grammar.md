# Scribe `<agent>` Block Grammar

> **Status:** Phase 1 — STABLE except where noted (see *Reserved for v2* at the end).
>
> This document describes the agent-block mini-language parsed by the Rust SFC compiler
> (`packages/compiler/src/parser/agent.rs`) and the corresponding `agent-manifest.json`
> emission (`packages/compiler/src/codegen/emit.rs`). It is the source of truth for the
> developer-facing grammar; if the parser and this document disagree, file a bug —
> the parser is authoritative.

---

## 1. Overview

A `.scribe` SFC may begin with an optional `<agent>` block. The block declares:

- **Inputs** — typed attributes of the resulting custom element. Each `input` becomes
  one entry in `observedAttributes` and one inputs key in the MCP manifest.
- **State** — internal reactive cells. Documented for the reader and for codegen
  awareness, but **not exposed to MCP** and **not written into the manifest**.
- **Actions** — exported functions with optionally typed return shapes. Each
  `action` becomes one tool action in the MCP manifest.

The block is line-based, whitespace-tolerant, and uses `#` for comments.

A complete worked example: `examples/airtime-quote/airtime-quote.scribe`.
A second, slightly larger example: `examples/scripture-reference/scripture-reference.scribe`.

---

## 2. BNF Grammar

```
agent_block     ::= { line }
line            ::= [ statement ] [ comment ] NEWLINE
                  | comment NEWLINE
                  | NEWLINE                       # blank line (allowed anywhere)

statement       ::= input_decl
                  | state_decl
                  | action_decl

comment         ::= "#" { any-char-except-newline }

input_decl      ::= "input" SP IDENT ":" SP type [ SP "=" SP default_literal ]
state_decl     ::= "state" SP IDENT ":" SP type
action_decl     ::= "action" SP IDENT "()" [ SP "->" SP returns_block ]

returns_block   ::= "{" returns_fields "}"
returns_fields  ::= returns_field { "," returns_field }
returns_field   ::= IDENT ":" SP type

type            ::= "string"
                  | "number"
                  | "boolean"
                  | enum_type

enum_type       ::= "enum(" enum_variants ")"
enum_variants   ::= IDENT { "," SP IDENT }        # at least one variant required

IDENT           ::= /[A-Za-z_][A-Za-z0-9_]*/      # underscore allowed; convention is snake_case
default_literal ::= /[^#\n]+/                     # raw text up to '#' or end-of-line, trimmed
SP              ::= one or more spaces/tabs (single SP shown for readability)
NEWLINE         ::= "\n"
```

### Parsing rules

1. **Line discipline.** Each statement occupies exactly one line. There are no
   line-continuations and no multi-line statements. A `returns_block` MUST appear
   on the same line as its `action` declaration.
2. **Inline comments.** A `#` outside of an enum body strips to end-of-line. A
   line that is solely a comment is ignored.
3. **Identifiers.** No reserved-word check beyond the three keywords (`input`,
   `state`, `action`). `IDENT` is matched lexically; the compiler does not enforce
   snake_case but the runtime + manifest preserve whatever case was written.
4. **Defaults.** `default_literal` is captured verbatim (after trim). It is *not*
   parsed as JSON; it flows through to the manifest's `"default"` field as a string,
   and (for non-string types) is coerced by the runtime — see §4.
5. **Duplicate inputs are an error** (C007). Duplicate `state` names and duplicate
   `action` names are *not* currently rejected by the parser; downstream codegen
   may misbehave — treat as undefined.

---

## 3. Worked examples

### `airtime-quote`

```
<agent>
input plan: enum(daily, weekly, monthly) = daily
input amount: number = 100
state total: number   # Final quoted total shown to the user
action quote() -> { plan: string, amount: number, fee: number, total: number }
</agent>
```

Compiles to a manifest with `name: "airtime_quote"`, `tag: "airtime-quote"`, two
inputs, and one action whose `returns` is a four-field record.

### `scripture-reference`

```
<agent>
input book: string = Genesis
input chapter: number = 1
input verse: number = 1
state text: string   # The verse text after lookup
action look_up() -> { book: string, chapter: number, verse: number, text: string }
</agent>
```

Compiles to a manifest with `name: "scripture_reference"`, `tag: "scripture-reference"`,
three inputs, and one `look_up` action.

---

## 4. Null / missing behaviour

This table is what the RC-3 + RC-4 review settled. It documents **what the runtime
produces when an attribute is absent** and **how the runtime coerces an attribute
string at read-time**.

| Type            | No default declared | Coercion at runtime                                                                 |
|-----------------|---------------------|-------------------------------------------------------------------------------------|
| `string`        | `''` (empty string) | none — pass-through (`ctx.attrs.<name>[0]()`)                                       |
| `number`        | `0` (from `Number('')`) | `Number(attr)` wrapped in a `computed()`                                        |
| `boolean`       | `false`             | `attr === 'true'` wrapped in a `computed()` (any other string is `false`)           |
| `enum(a,b,c)`   | first variant `a`   | `Set.has` check in a `computed()`; falls back to the first variant if attr not in set |

Notes:

- `string` inputs do **not** wrap in `computed()` — they expose the raw signal
  `[get]` from `ctx.attrs.<name>` directly.
- The first-variant fallback for enums means a bad attribute value never throws;
  it silently returns the first declared variant. This is the same behaviour the
  manifest implies (the first variant is the "default default").
- Defaults declared in the agent block are emitted into `agent-manifest.json` as
  strings under `"default"`, regardless of type. Numeric/boolean coercion happens
  on the consumer side at runtime, not at manifest-build time.

---

## 5. Error codes

Error codes are stable and emitted by `packages/compiler/src/parser/agent.rs`.
A compile error always carries a `line` number (1-based) and one of these codes.

| Code   | Meaning                                                   | Trigger example                                          |
|--------|-----------------------------------------------------------|----------------------------------------------------------|
| C001   | Unknown keyword (not `input`, `state`, or `action`)       | `inputs plan: string` (typo)                             |
| C002   | Unknown type token                                        | `input plan: uuid`                                       |
| C003   | Malformed `input` or `state` line — missing `:`           | `input plan string`                                      |
| C004   | Malformed `action` declaration                            | `action quote` (missing `()`) or text after `()` w/o `->`|
| C005   | Malformed returns block                                   | `action q() -> plan: string` (no braces) or field w/o `:`|
| C006   | Malformed enum                                            | `input p: enum`, `input p: enum()`, `input p: enum(,,)`  |
| C007   | Duplicate input name                                      | two `input plan: …` lines                                |

The parser stops at the first error; multi-error reporting is not in scope for v1.

---

## 6. Manifest emission

The `<agent>` AST is mapped into `agent-manifest.json` by `emit_manifest()` in
`packages/compiler/src/codegen/emit.rs`. The mapping is:

| Construct          | Manifest target                                                              |
|--------------------|------------------------------------------------------------------------------|
| `input <n>: <t>`   | `tools[0].inputs[<n>] = { "type": <t>, [... "values" if enum], [... "default"] }` |
| `input <n>: enum(…)` | adds `"values": [...]` listing the variants in declaration order           |
| `input <n>: <t> = <d>` | adds `"default": "<d>"` (always serialised as a string)                  |
| `action <n>()`     | `tools[0].actions[<n>] = { "returns": {} }`                                  |
| `action <n>() -> { … }` | `tools[0].actions[<n>] = { "returns": { <field>: { "type": <t> }, ... } }` |
| `state <n>: <t>`   | **NOT in manifest** — internal-only declaration                              |
| (tag name)         | `tools[0].tag = <kebab>`; `tools[0].name = <snake_from_kebab>`               |

Tag-name source: the `name="…"` attribute on `<script setup>` if present, else
the file stem (passed through the CLI as `--tag` or derived from the input path).
Replacing `-` with `_` produces the snake-case `name` field; no other transformation
is applied (i.e. `plan-airtime-quote` becomes `plan_airtime_quote`).

If the agent block has zero inputs **and** zero actions, no manifest is written —
the emitter returns an empty string and the CLI skips writing
`agent-manifest.json`. An agent block with only `state` declarations therefore
produces no manifest, by design.

---

## 7. Runtime binding shape (informational)

For implementers consuming the emitted `.ts`: each `input` produces one `attrs`
entry in the options form. The bindings the compiler injects at the top of
`setup(ctx)` are:

```ts
// string  — direct signal handle
const [name] = ctx.attrs.name

// number  — coerced via computed()
const amount = computed(() => Number(ctx.attrs.amount[0]()))

// boolean — coerced via computed()
const active = computed(() => ctx.attrs.active[0]() === 'true')

// enum    — Set.has + fallback to first variant
const _plan_V = new Set(['daily', 'weekly', 'monthly'])
const plan = computed(() =>
  _plan_V.has(ctx.attrs.plan[0]()) ? ctx.attrs.plan[0]() : 'daily'
)
```

User script code therefore calls `name()`, `amount()`, `active()`, `plan()` —
the signal call form — to read the latest value reactively.

---

## 8. `<style>` block

A `.scribe` SFC may contain an optional `<style>` block. The block is CSS text
that the compiler converts to a constructable `CSSStyleSheet` and wires into the
component's shadow root (scoped) or the document (global).

### Syntax

```html
<!-- scoped (default): injected into shadow root adoptedStyleSheets -->
<style>
  span { color: red; }
</style>

<!-- explicit scoped -->
<style scoped>
  span { color: red; }
</style>

<!-- global: injected into document.adoptedStyleSheets -->
<style global>
  :root { --brand: #0f172a; }
</style>
```

### Codegen contract

| Block form | Emitted JS (module level) | Emitted JS (inside setup) |
|---|---|---|
| `<style>` or `<style scoped>` | `const __style__ = new CSSStyleSheet();` / `__style__.replaceSync(\`…\`);` | `(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];` |
| `<style global>` | same `const __style__` declaration | `document.adoptedStyleSheets = [...document.adoptedStyleSheets, __style__];` |
| (no style block) | (omitted) | (omitted) |

Rules:

- Exactly one `<style>` block is allowed per SFC. A second block is a parse error.
- The CSS text is inserted verbatim (as a template literal); no pre-processing
  (minification, nesting flattening, vendor prefixes) is applied by the compiler.
- The module-level `const __style__` declaration is hoisted **before** the
  `defineElement(…)` call, so the stylesheet is constructed once at module evaluation
  time, not once per component instance.
- When a scoped style block is present, the setup function parameter is renamed
  from `_ctx` to `ctx` so that `ctx.host` is accessible inside the setup body.

### Supported environments

`CSSStyleSheet.replaceSync` and `adoptedStyleSheets` are part of the Constructable
Stylesheets spec (Baseline 2023). Both are supported in all evergreen browsers.
Server-side rendering (via `@scribe/server`) renders a `<style>` element instead,
matching the CSS text exactly.

---

## 9. Reserved for v2

The following are intentionally **not** part of the Phase 1 grammar and are
captured in `TODOS.md` (TODO-003) for the v2 cycle:

- **`string!` (and friends) — required inputs.** A trailing `!` on the type is
  reserved to mean "the attribute MUST be set; absent attribute is an error".
  Phase 1 has no required-input concept — every input is optional with a
  defaulted/coerced fallback per §4.
- **Multi-line returns blocks.** A `returns_block` will remain single-line
  through Phase 1; multi-line shape is a v2 ergonomics question.
- **Object/array types.** Only the four primitive types in §2 are recognised.
  Composite types are deferred.
- **Custom validators.** No `pattern:` / `min:` / `max:` annotations in v1.

If you need any of the above today, file an issue and we will weigh it against
the v2 backlog — but do **not** rely on speculative syntax in shipped components.
