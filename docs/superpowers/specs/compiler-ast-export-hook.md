# Compiler AST-Export Hook — Co-Design Note

> **Co-design note for bridge plan-item `v1.0.10a-compiler-ast-export`** (lands in `aihu-v1-framework`, HIGH). This is the contract the `aihu-css-core` AST scanner (`css-2-ast-scanner`) consumes. Authored to unblock CSS-engine Plan 2 per Architect R7.1 Risk #4 ("Plan 2's AST consumption depends on a compiler API that does not exist yet").
>
> **Status:** preparatory design. No implementation code. Grounded in the real compiler source at `packages/compiler/src/` (verified against `types.rs`, `parser/directives.rs`, `parser/sfc.rs`, `lib.rs`, `bin/main.rs`, `js/index.ts`).
>
> **Source spec:** Architect R7.1 CSS-engine spec `22d3a66e-e7fe-4fce-a191-1c003abb70fa` (§3 edge #1, edge #5; §6 open question #4).

---

## 1. Problem statement

The CSS engine's scanner (`css-2-ast-scanner`) must walk an `.aihu` SFC's template tree and extract:

1. **Every static class string** so it can compile the referenced utilities to CSS.
2. **Every reactive class binding** so it can statically discover the utility literals inside (and flag the ones it cannot resolve).
3. **Every macro class toggle** (`$class:name={cond}`) so it can compile the toggled class.
4. **The `@style` block** (scope + content) so it can fold authored CSS into the same scoped output and parse `@theme` directives.

The compiler **already produces all of this** internally — but it only exposes `transform(source, id): { code, map }` (TS, via the Rust `aihu-compile` binary) which emits final TypeScript. There is no way to get the *structured AST* out. The scanner cannot re-parse `.aihu` source with regex (Risk #4 is explicit: "scanner reads AST directly, not regex"), and re-implementing the SFC parser in `aihu-css-core` would fork the grammar and immediately drift.

**Therefore:** add a single new public-API export that returns the parsed AST in a stable, serializable shape.

---

## 2. What already exists in the compiler (verified)

The Rust crate `aihu-compiler` already parses everything we need. The relevant types live in `packages/compiler/src/types.rs`:

| Type | Location | Role |
|---|---|---|
| `AihuSource<'a>` | `types.rs:34-45` | Top-level parse result: `script`, `template`, `style`, `meta`, `agent`, `route`, `stream`. Borrows `&'a str` slices of the source. |
| `StyleBlock<'a>` | `types.rs:28-32` | `{ content: &'a str, scope: StyleScope }` |
| `StyleScope` | `types.rs:22-26` | `Scoped \| Global` |
| `ScriptMeta` | `types.rs:47-50` | `{ name: Option<String> }` |
| `TemplateNode` | `types.rs:52-85` | Element / MacroElement / Text / Interpolation / IfBlock / EachBlock / HtmlBlock |
| `Attr` | `types.rs:98-104` | **`Static` \| `Binding` \| `Macro`** — the three variants the scanner keys on |
| `MacroValue` | `types.rs:88-96` | `Quoted(String) \| Curly(String) \| Boolean` |

Entry points already public (`lib.rs:22-57`):

- `pub fn compile(source: &str) -> Result<AihuSource<'_>, CompileError>` — parses blocks, returns `AihuSource` (template still a raw `&str`).
- `pub fn compile_full<'a>(source: &'a AihuSource<'a>) -> Result<CompileUnit<'a>, CompileError>` — runs `parse_template` to produce `CompileUnit { source, template_ast: Option<Vec<TemplateNode>>, target }`.
- `pub fn parse_template(...)` is re-exported (`lib.rs:14`).

So **the AST already exists in memory** as `CompileUnit { source: AihuSource, template_ast: Vec<TemplateNode> }`. The hook is a **serialization + entry-point** task, not a parser task.

---

## 3. The three class-forms the scanner needs — grounded in real `Attr` variants

This is the load-bearing part of the contract. The scanner branches on the `Attr` variant. The compiler's routing is confirmed in `packages/compiler/src/parser/directives.rs` and its test suite.

### Form A — static `class="btn primary"`

- **AST variant:** `Attr::Static { name: "class", value: "btn primary" }`
- **Source of truth:** `directives.rs:178-182` (the `strip_quotes` → `Attr::Static` path). Test `bare_value_rejected_c300` (line 609) confirms bare values are rejected; quoted is the only static form.
- **Scanner action:** split `value` on whitespace, treat each token as a utility class literal. Fully resolvable at compile time.

### Form B — reactive `$class={expr}` (and array `$class={[a, b]}`)

- **AST variant:** `Attr::Binding { name: "class", expr: "<inner>" }`
- **Source of truth:** `directives.rs:32-35` + `277-282`. The `parse_macro_attr` curly path checks `is_reserved_macro_name(&name)`; **bare `class` is NOT in `RESERVED_MACRO_NAMES`** (`["if","each","key","show","once","memo","html","raw","ref"]`, line 32-35), so it routes to `Attr::Binding`, NOT `Attr::Macro`. Confirmed by tests `dollar_prefix_plain_attr_routes_to_binding` (line 702, `$class={dynamic}` → `Attr::Binding`) and `dollar_prefix_class_array_routes_to_binding` (line 753, `$class={[a, b]}` → `Attr::Binding { expr: "[a, b]" }`).
- **The prior pass's claim is VERIFIED:** "`$class={expr}` is expected to route to a binding variant because bare `class` is not a reserved macro name." Correct — `directives.rs:32` comment block states this verbatim: *"bare `class` is NOT reserved — `$class={x}` (scalar) and `$class={[a, b]}` (array) both route to `Attr::Binding`."*
- **Scanner action:** the `expr` is arbitrary JS. Two sub-cases:
  - **Array literal** (`expr.trim_start().starts_with('[')`, the same detection emit.rs:3608 uses for `__aihu_cls` wrapping): walk the array elements; string literals (`'active'`, `"btn"`) are extractable utility classes; non-literal elements (`active && 'on'`) yield the string-literal sub-expressions that *are* present.
  - **Scalar expression** (`cn(...)`, a bare identifier, a ternary): the scanner extracts any string literals it can find but **cannot** statically prove the full class set. This is the §3 edge #5 "LOW surface concern": dynamic `cn()` results may ship unused utilities. Mitigation per spec §9.3: recipe authors keep static utility strings in compile-time `@apply`/template position; `cn()` is for runtime merging of consumer overrides only.

### Form C — macro toggle `$class:active={cond}`

- **AST variant:** `Attr::Macro { name: "class:active", value: MacroValue::Curly("cond") }`
- **Source of truth:** `directives.rs:37-40` — `class:` is in `RESERVED_MACRO_PREFIXES` (`["on:","bind:","class:","emit:"]`), so `is_reserved_macro_name` returns true and the curly path returns `Attr::Macro`. Confirmed by test `b3_class_colon_namespaced_unchanged` (line 902, `$class:active={cond}` → `Attr::Macro { name: "class:active", value: Curly("cond") }`).
- **Note on the name shape:** the macro name is the **full** `"class:active"` (prefix + the toggled class name after the colon). The scanner parses `name.strip_prefix("class:")` to get the class literal (`"active"`) — that literal IS a statically-known utility class, always resolvable. The `value` (`Curly("cond")`) is the gating condition and is irrelevant to utility discovery.
- **The prior pass's claim is VERIFIED:** "`$class:name` uses the reserved `class:` prefix and routes to a macro variant." Correct.

### Summary table

| Form | Surface syntax | `Attr` variant | Class literals statically known? | directives.rs anchor |
|---|---|---|---|---|
| **A** | `class="btn primary"` | `Attr::Static { name, value }` | Yes — split `value` on whitespace | 178-182 |
| **B-array** | `$class={[a, 'on']}` | `Attr::Binding { name, expr }` | Partial — string-literal elements only | 277-282, test 753 |
| **B-scalar** | `$class={cn(x)}` | `Attr::Binding { name, expr }` | Partial — embedded string literals only | 277-282, test 702 |
| **C** | `$class:active={cond}` | `Attr::Macro { name: "class:active", value: Curly }` | Yes — `name` after `class:` is the class | 37-40, test 902 |

> **Why this matters for the contract:** the scanner's correctness depends entirely on `Attr` keeping these three variants distinct in the serialized AST. If a future compiler refactor collapsed `Binding` into `Macro` (or vice versa), the scanner's class-extraction logic silently breaks. The AST export therefore **freezes the `Attr` three-variant distinction as part of the v1.0 stability contract** (spec §3 edge #1: "AST shape becomes part of the v1.0 stability contract — once shipped, breaking it is a major version bump").

---

## 4. The typed `compileToAst(source): SfcAst` contract

### 4.1 TypeScript surface (consumed by `aihu-css-core`'s TS layer / the CLI bridge)

```typescript
/** Top-level AST export — one per .aihu SFC. */
export interface SfcAst {
  /** Resolved custom-element tag name (meta.name → route.name → file stem). */
  tag: string
  /** The @style block, if the SFC declared one. */
  style: SfcStyleBlock | null
  /** Parsed template tree. null when the SFC has no @template block. */
  template: SfcNode[] | null
  /** SFC-level metadata. */
  meta: SfcMeta
  /** AST schema version — bumped on any breaking shape change (semver-tied). */
  astVersion: 1
}

export interface SfcStyleBlock {
  /** Verbatim CSS body of the @style block (braces stripped, $global token removed). */
  content: string
  /** 'scoped' (default) or 'global' (@style { $global ... }). */
  scope: 'scoped' | 'global'
}

export interface SfcMeta {
  /** From @meta { name } / @route { name } / file stem — never null after resolution. */
  name: string
}

/** Discriminated union mirroring Rust `TemplateNode`. */
export type SfcNode =
  | { kind: 'element'; tag: string; attrs: SfcAttr[]; children: SfcNode[] }
  | { kind: 'macroElement'; name: string; attrs: SfcAttr[]; children: SfcNode[] }
  | { kind: 'text'; value: string }
  | { kind: 'interpolation'; expr: string }
  | { kind: 'ifBlock'; branches: Array<{ cond: string; body: SfcNode[] }> }
  | { kind: 'eachBlock'; list: string; item: string; idx: string | null; key: string | null; body: SfcNode[]; emptyBody: SfcNode[] | null }
  | { kind: 'htmlBlock'; expr: string }

/** Discriminated union mirroring Rust `Attr` — the three class-forms key on `kind`. */
export type SfcAttr =
  | { kind: 'static'; name: string; value: string }                                  // Form A
  | { kind: 'binding'; name: string; expr: string }                                  // Form B
  | { kind: 'macro'; name: string; value: SfcMacroValue }                            // Form C (and on:/bind:/emit:/if/each/…)

export type SfcMacroValue =
  | { form: 'quoted'; value: string }
  | { form: 'curly'; expr: string }
  | { form: 'boolean' }

/**
 * Parse a .aihu source string to its structured AST.
 * Throws CompileError (code + message + range) on parse failure — same error
 * shape as `--machine-errors` emits today (bin/main.rs:7-45).
 */
export function compileToAst(source: string, id?: string): SfcAst
```

The TS function is a thin wrapper over the Rust binary (mirroring `transform()` in `js/index.ts:378-396`): spawn `aihu-compile --stdin --tag <stem> --ast-json`, feed `source` on stdin, `JSON.parse` stdout. `id` is optional and only used to derive the tag stem + the `--path` arg for `@route` C500 checks, identical to `transform()`.

### 4.2 Rust surface (the in-crate API)

```rust
// lib.rs — new public entry
pub fn compile_to_ast(source: &str, file_path: Option<&str>) -> Result<SfcAstOwned, CompileError>;
```

`SfcAstOwned` is an **owned** (`String`-backed) serde-`Serialize` mirror of `CompileUnit`. It is built from the existing `compile_with_path` → `compile_full` pipeline (no new parsing), then the borrowed `&'a str` fields are copied into owned `String`s so the struct can outlive the source buffer and serialize cleanly. See §6 open question on lifetimes.

### 4.3 Wire format — the `--ast-json` flag

A new flag on the existing `aihu-compile` binary (`bin/main.rs`). It short-circuits **before** codegen (`emit`), so no TS is produced:

```
aihu-compile --stdin --tag Button --ast-json          # reads stdin, prints SfcAst JSON to stdout
aihu-compile path/to/Button.aihu --ast-json           # file mode
```

- On success: a single JSON object (`SfcAst` shape from §4.1) printed to stdout, exit 0.
- On parse failure: respects the existing `--machine-errors` / `AIHU_MACHINE_ERRORS=1` path (`bin/main.rs:51-52`) — emits the `{ code, message, from, to, range }` diagnostic JSON to stderr, exit 1.
- The flag is parsed in the same `args.iter().position(...)` style as `--out`, `--target`, `--tag` (`bin/main.rs:56-92`).

Example output for `@template { <button $class={cn('btn', variant)} class="base" $class:loading={busy}>Go</button> }`:

```json
{
  "tag": "Button",
  "astVersion": 1,
  "style": null,
  "meta": { "name": "Button" },
  "template": [
    {
      "kind": "element",
      "tag": "button",
      "attrs": [
        { "kind": "binding", "name": "class", "expr": "cn('btn', variant)" },
        { "kind": "static",  "name": "class", "value": "base" },
        { "kind": "macro",   "name": "class:loading", "value": { "form": "curly", "expr": "busy" } }
      ],
      "children": [ { "kind": "text", "value": "Go" } ]
    }
  ]
}
```

The scanner reads `attrs[]`, branches on `kind`, and extracts: `"base"` (Form A), `'btn'` (Form B string-literal inside the `cn(...)` expr — and flags `variant` as unresolvable), and `"loading"` (Form C, from `name.strip_prefix("class:")`).

---

## 5. Edge-case table

| # | Case | Input | Expected AST behavior | Scanner consequence |
|---|---|---|---|---|
| E1 | Two `class` attrs (static + binding) on one element | `class="base" $class={x}` | Two separate `attrs[]` entries: one `static`, one `binding` | Scanner unions both; emit.rs already merges these at runtime via `__aihu_cls` |
| E2 | Array class binding | `$class={['a', cond && 'b']}` | `binding { expr: "['a', cond && 'b']" }` | Detect `expr.trim_start().starts_with('[')`; extract `'a'`, `'b'`; `cond` ignored |
| E3 | `cn()` scalar binding | `$class={cn('btn', size)}` | `binding { expr: "cn('btn', size)" }` | Extract embedded string literals (`'btn'`); cannot resolve `size`. Spec §3 edge #5 LOW concern |
| E4 | Multiple `class:` toggles | `$class:a={x} $class:b={y}` | Two `macro` entries `class:a`, `class:b` | Both `a` and `b` resolvable from names |
| E5 | No `@template` block | `@state { ... }` only | `template: null` | Scanner emits empty utility set; no error |
| E6 | `@style { $global ... }` | global style block | `style: { content, scope: "global" }` | Scanner does NOT scope this CSS to `:host`; passes through as global (sfc.rs:660-673 already strips `$global` + braces) |
| E7 | Bracketed arbitrary value in static class | `class="bg-[#1a1d24] w-[34ch]"` | `static { value: "bg-[#1a1d24] w-[34ch]" }` | Scanner tokenizes; `css-2-full-tailwind-utility-table` handles arbitrary-value syntax |
| E8 | Reserved macro that is NOT class | `$if={cond}`, `$on.click={fn}` | `macro { name: "if" / "on:click" }` | Scanner ignores (no `class`/`class:` prefix); never a utility source |
| E9 | Interpolation inside class text | `class="btn {dynamic}"` | `static { value: "btn {dynamic}" }` (compiler stores verbatim) | Scanner extracts `btn`; `{dynamic}` is not a literal — flagged unresolvable |
| E10 | Component vs HTML element class | `<UserCard class="x" />` | `static` on a `macroElement`/component node | Scanner SHOULD skip component nodes for scoped emission — components own their own shadow scope (spec §6.3) |
| E11 | Colon-form (`$on:click`) | `$on:click={fn}` | **Parse error C500** before AST is produced (directives.rs:233-245) | Never reaches scanner; surfaces as `--machine-errors` diagnostic |
| E12 | Empty class string | `class=""` | `static { value: "" }` | Scanner yields empty token set; no-op |

---

## 6. Open questions for Director review

1. **Serde lifetime handling for the borrowed `AihuSource<'a>`.** `AihuSource`, `StyleBlock`, and the `&'a str` template slices all borrow the source buffer. The cleanest serialization path is an **owned mirror struct** (`SfcAstOwned` with `String` fields) built once via a `From<&CompileUnit<'a>>` conversion, then `#[derive(Serialize)]` on the owned struct only — leaving the borrowed types untouched. The alternative (deriving `Serialize` directly on `AihuSource<'a>` with `#[serde(borrow)]`) avoids a copy but couples the public AST shape to the internal parser representation, which we explicitly do NOT want (the AST export is a stability contract; the internal types must stay free to evolve). **Recommendation: owned mirror.** Confirm before Plan 2's `css-2-ast-scanner` starts. The crate already depends on `serde` + `serde_json` (the bootstrap `aihu-css-core/Cargo.toml` in Plan 1 lists them), but **`aihu-compiler`'s own `Cargo.toml` does not yet pull serde** — adding it is part of this item's scope and warrants a `@aihu/compiler` changeset (per the round-7 lesson "compiler grammar changes need a changeset").

2. **Where does the owned mirror live?** Option (a): in `aihu-compiler` itself (new `src/ast_export.rs` module). Option (b): in a tiny shared crate. **Recommendation: (a)** — keeps the contract co-located with the parser it mirrors; `aihu-css-core` consumes the JSON, not the Rust type, so no crate-level coupling is created.

3. **`astVersion` evolution policy.** The note pins `astVersion: 1`. Confirm the policy: additive fields (new `SfcNode.kind`, new optional fields) keep `astVersion: 1`; any field removal / variant collapse / rename bumps to `2` and is a major-version event for `@aihu/compiler`. This mirrors the spec §3 edge #1 stability stance.

4. **Should `compileToAst` also surface `@route` / `@agent` / `@stream` blocks?** The scanner needs only `template` + `style` + `meta`. Including the others bloats the wire format but future-proofs (e.g. a docs-generator consumer). **Recommendation: include `style`/`template`/`meta` only for v1; gate the rest behind a `--ast-json-full` flag if a consumer needs them.** Keeps the v1 contract minimal.

5. **Does the scanner need byte spans / source positions?** For v1 the scanner only needs the class *literals*, not their positions. But Chromatic-style "which line shipped this unused utility" diagnostics (Plan 6 `aihu css doctor`) would want spans. **Recommendation: defer spans to a later `astVersion` additive field; do not block Plan 2.**

6. **Component-node skip rule (E10) — confirm.** The scanner must skip `class` attrs on component / `macroElement` nodes (capitalized tags + `<$...>`), since those elements own their own shadow scope and the parent must not compile their classes into the parent's scoped sheet. Confirm this is the intended boundary (spec §6.3 implies it). Plan 2 `css-2-ast-scanner` acceptance should assert it.

---

## 7. What this note does NOT do

- Does not implement `compileToAst` / the `--ast-json` flag (that is the `v1.0.10a-compiler-ast-export` Builder item).
- Does not modify any `packages/*` source.
- Does not change the existing `transform()` / `compile()` / `compile_full()` surfaces — the hook is purely additive.
- Does not decide the serde lifetime approach unilaterally — §6 Q1 is flagged for Director ratification.

---

*Co-design note for `v1.0.10a-compiler-ast-export`. Grounded in `packages/compiler/src/{types,parser/directives,parser/sfc,lib}.rs` + `bin/main.rs` + `js/index.ts`. Source spec: Architect R7.1 `22d3a66e-e7fe-4fce-a191-1c003abb70fa`.*
