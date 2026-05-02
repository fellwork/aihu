# Block Structure — `@scribe/compiler`

**Status:** Ratified 2026-05-02 (v1 reconciliation session)
**Spec version:** 0.1.1-draft (Amendment 02 applied inline; Option B path convention locked)
**Phase:** N+M (assigned at scoping pass)
**Author:** Architect
**Depends on:** `@scribe/compiler` (parser infrastructure)
**Consumes:** Template Attribute Syntax Spec, Macro Vocabulary Spec, Plugin Contract Spec
**Related specs:** Compiler Error Reference, File Format Reference

> **Ratification note:** Migrated from `docs/spec-block-structure.md` to `docs/superpowers/specs/` on 2026-05-02. Amendment 02 (split-bundle compilation, §11.5) applied inline with **Option B path convention** (`/server/_actions/`, `/server/_form-actions/`, `/server/_mcp/` — Nuxt-style) per user adjudication. Original amendment doc preserved at `docs/superpowers/specs/applied-amendments/2026-05-02-AMD-02-applied.md`.

---

## 0. Posture

This spec defines the file format for `.scribe` SFC files at the structural level: which blocks exist, how they're delimited, how they parse, and how they compose. It is the binding contract between SFC source code and the compiler's top-level parser, before the block-internal parsers (template, macros, etc.) take over.

The four-block model is closed in v1: `@template`, `@state`, `@style`, `@agent`. Adding new core blocks requires an RFC and language version bump. Plugins MAY contribute namespaced blocks per §6.

---

## 1. File Anatomy

### 1.1 File extension

`.scribe` files are the canonical SFC format. The compiler treats files with this extension as scribe SFCs. Other extensions are not recognized.

```
src/pages/users/[id].scribe              ← page component
src/components/UserCard.scribe           ← reusable component
src/layouts/AppLayout.scribe             ← layout component
```

### 1.2 Encoding

Files MUST be UTF-8 encoded. Files with BOM are accepted; the compiler strips the BOM before parsing. Other encodings are rejected with a clear error.

### 1.3 Line endings

LF and CRLF are both accepted. The compiler normalizes to LF internally. Source maps preserve original line offsets regardless of line ending style.

### 1.4 Top-level structure

A `.scribe` file consists of:

1. **Optional leading comment** (single-line `//` or block `/* */`)
2. **Optional file-level frontmatter** (reserved for v2; rejected in v1)
3. **One or more block declarations** in any order
4. **Optional trailing whitespace**

No other top-level content is permitted. Specifically: imports, top-level statements, and bare HTML/CSS outside blocks are all errors in v1.

```
// Optional leading comment

@state {
  // ... contents
}

@template {
  <!-- ... contents -->
}

@style {
  /* ... contents */
}

@agent {
  // ... contents
}
```

---

## 2. Block Declaration Syntax

### 2.1 Block opener

A block is opened by:
- The `@` sigil
- A block name (one of the four core names, or a namespaced plugin name)
- An opening brace `{`

```
@blockname {
```

The opener MUST appear at the start of a line (after optional leading whitespace). The opening brace MUST be on the same line as the block name. Whitespace between `@blockname` and `{` is permitted.

### 2.2 Block body

The body extends from the line after the opener to the line containing the matching closing brace. The body's interior is parsed by a block-specific parser (defined in the per-block specs).

### 2.3 Block closer

A block is closed by `}` on its own line (after optional leading whitespace). No content may appear on the same line as the closing brace.

```
@state {
  count: number = 0
}                  ← closer on its own line
```

### 2.4 Brace matching

The parser maintains brace depth across block bodies. The closing `}` of a block matches its opening `{` only if all interior braces (inside expressions, object literals, JSX, etc.) are balanced.

```
@state {
  config: object = { theme: 'dark' }    ← interior braces don't close the block
}                                        ← this closes the block
```

### 2.5 Whitespace and indentation

Block bodies use consistent indentation (recommended 2 spaces, configurable per project). The compiler does NOT use indentation as a parsing signal — braces alone delimit blocks. Indentation is purely cosmetic.

---

## 3. Block Names and Validity

### 3.1 Core block names

| Name | Required? | Multiplicity | Purpose |
|---|---|---|---|
| `@state` | No | 0 or 1 | Component logic, signals, actions |
| `@template` | Yes (in renderable components) | 0 or 1 | Markup |
| `@style` | No | 0 or 1 | Component styles |
| `@agent` | No | 0 or 1 | Agent surface declarations |

Each block name MAY appear at most once per file. Multiple instances of the same block name MUST be rejected with a clear error citing both source locations.

### 3.2 Renderable vs. non-renderable components

A renderable component MUST have a `@template` block. Files without `@template` are valid but are treated as logic-only modules (e.g. shared composables, utility components).

The compiler infers renderable status from the file's role (page vs. component vs. composable) per file-system conventions. See §7.

### 3.3 Block ordering

Blocks may appear in any order. The compiler does not require a canonical order. However, **the recommended order for tooling and formatter output is**:

```
@state          ← logic first
@template       ← markup second
@style          ← styles third
@agent          ← agent surface last
```

The default formatter rewrites files to this order on save. Project config MAY override the canonical order (`scribe.config.ts` `formatter.blockOrder`).

### 3.4 Empty blocks

Empty blocks are valid:

```
@state {
}

@template {
  <h1>Hello</h1>
}
```

The compiler treats empty blocks as no-ops. Some IDE warnings ("empty block could be removed") may apply, but the compiler does not error.

---

## 4. Block-Internal Parsing

Each block's body is parsed by a dedicated parser. Block boundaries are the handoff points.

### 4.1 Parser handoff

```
@state {                          ← top-level parser passes to state parser
  count: number = 0               ← state parser handles TypeScript-like syntax
  $effect(() => { ... })          ← state parser recognizes macros
}                                 ← top-level parser resumes
@template {                       ← passes to template parser
  <h1 $if="isVisible">...</h1>    ← template parser handles JSX-like syntax
}                                 ← top-level parser resumes
```

### 4.2 Parser responsibility per block

| Block | Parser handles | Specs that govern |
|---|---|---|
| `@state` | TypeScript declarations, statements, `$`-prefixed macros | Macro Vocabulary Spec §2 |
| `@template` | JSX-like markup, attributes, structural elements | Template Attribute Syntax Spec, Macro Vocabulary Spec §3 |
| `@style` | CSS-like rules, `$`-prefixed macros | Macro Vocabulary Spec §4 |
| `@agent` | Statement-style declarations, `$`-prefixed macros | Macro Vocabulary Spec §5 |

### 4.3 Cross-block references

A name declared in `@state` is referenceable from `@template`, `@style`, and `@agent`. The compiler emits a unified symbol table per SFC; all block parsers query this table during resolution.

Cross-block reference rules:

- `@state` → declares names; references nothing from other blocks
- `@template` → references names from `@state`; cannot reference `@style` or `@agent`
- `@style` → references signal names from `@state` (via `$reactive`, `$when`); cannot reference template elements
- `@agent` → references action and state names from `@state`; cannot reference templates

References to undeclared names MUST cause compile errors with source locations.

### 4.4 Block isolation

Blocks do not share local scopes. A `let x = 5` in `@state` is not accessible from inside another `@state` block (this is moot since each block appears once, but the principle holds). Each block is parsed in its own scope, with the unified symbol table providing cross-block resolution.

---

## 5. Comment Syntax

### 5.1 Top-level comments

Single-line and block comments using JavaScript syntax are permitted at the top level (between blocks):

```
// File-level comment

@state { ... }

/* Block comment between blocks */

@template { ... }
```

### 5.2 In-block comments

Comment syntax inside blocks follows the block's parser:

| Block | Comment syntax |
|---|---|
| `@state` | `//` and `/* */` (TypeScript) |
| `@template` | `<!-- -->` (HTML) |
| `@style` | `/* */` (CSS) |
| `@agent` | `//` and `/* */` (TypeScript-style) |

Comments are stripped during compilation and do not appear in the output.

### 5.3 Doc comments

JSDoc-style block comments `/** */` in `@state` and `@agent` blocks are preserved by the compiler and emitted in the generated TypeScript output. They are valid sources of type hints and IDE tooltips.

```
@state {
  /** The user's display name */
  $prop name: string
  
  /** Toggles between view and edit mode */
  $action toggleEdit() {
    isEditing = !isEditing
  }
}
```

---

## 6. Plugin Block Contributions

Plugins MAY contribute additional blocks via the namespaced form:

```
@plugin-name.block-name {
  // ... contents
}
```

### 6.1 Namespacing requirement

Plugin blocks MUST use the dot-separated form. The dot is the discriminator: bare `@formname` is reserved for the core language; `@forms.field` is plugin contribution.

```
✓ @forms.field { ... }              ← plugin block
✗ @field { ... }                    ← compile error: unknown core block
```

### 6.2 Plugin block validity

Plugin blocks are valid only if:

1. The plugin is registered in `scribe.config.ts`
2. The plugin's manifest declares the block name
3. The block content matches the plugin's declared parser/schema

Per the Plugin Contract Spec.

### 6.3 Multiple plugin blocks

Unlike core blocks (which appear at most once per file), plugin blocks MAY have any multiplicity declared by the plugin. A plugin offering `@forms.field` could permit multiple instances per file.

### 6.4 Plugin block ordering

Plugin blocks integrate with core block ordering. The recommended order extends the core order:

```
@state           ← core
@template        ← core
@style           ← core
@agent           ← core
@plugin1.block   ← plugins
@plugin2.block
```

Plugin blocks appear after core blocks by convention. Formatter respects this when reformatting.

---

## 7. File-System Conventions

The block structure interacts with file-system conventions for routing, components, and layouts.

### 7.1 File path → component role

| Path pattern | Component role | Required blocks |
|---|---|---|
| `src/pages/**/*.scribe` | Page (route handler) | `@template` |
| `src/components/**/*.scribe` | Reusable component | `@template` |
| `src/layouts/**/*.scribe` | Layout component | `@template` |
| `src/composables/**/*.scribe` | Logic-only module | None required |

The compiler infers the role from the path. Configurable via `scribe.config.ts` (`paths` section).

### 7.2 Routing inference for pages

Pages under `src/pages/` are auto-routed based on file path. The route is derived from the file path with conventions:

- `src/pages/index.scribe` → `/`
- `src/pages/about.scribe` → `/about`
- `src/pages/users/[id].scribe` → `/users/:id`
- `src/pages/users/[id]/posts.scribe` → `/users/:id/posts`
- `src/pages/[...catchAll].scribe` → `/:catchAll*`

Pages MAY override their auto-derived route with a `@route` block declaration (see §7.3).

### 7.3 Optional `@route` for route overrides

For pages that need explicit routing (server-only routes, named routes, computed paths), a `@route` block MAY be added:

```
@route {
  path: '/users/[id]/edit'
  name: 'user-edit'
  middleware: ['auth']
  ssr: true
}
```

`@route` is a fifth core block, but only valid in files under `src/pages/`. It is omitted from the four-block summary because most pages don't need it. Adding to the summary table:

| Name | Required? | Multiplicity | Purpose | Valid in |
|---|---|---|---|---|
| `@route` | No | 0 or 1 | Route override | Pages only |

The block contains structured data (path, name, middleware, etc.) parsed as a TypeScript object literal.

### 7.4 Component name derivation

Component names are derived from file paths:

- `src/components/UserCard.scribe` → `UserCard`
- `src/components/forms/Input.scribe` → `Input` (within `forms` namespace)
- `src/components/ui/buttons/PrimaryButton.scribe` → `PrimaryButton`

Components are auto-registered in the project's component glob (per `scribe.config.ts`). Other components reference them by bare name in `@template`:

```
@template {
  <UserCard user="currentUser" />
}
```

Path-based namespacing prevents name collisions:

- `src/components/forms/Input.scribe` → `<Input>` is `forms.Input`
- `src/components/admin/Input.scribe` → `<Input>` is `admin.Input`
- The compiler resolves based on import context; explicit imports override

### 7.5 Layout association

Layouts in `src/layouts/` are applied to pages based on `scribe.config.ts` configuration:

```typescript
// scribe.config.ts
export default defineConfig({
  layouts: {
    default: './layouts/AppLayout.scribe',
    auth: './layouts/AuthLayout.scribe',
    routes: {
      '/auth/*': 'auth',
      '/admin/*': 'admin',
    },
  },
})
```

Pages MAY override their layout with a `@layout` declaration in `@route`:

```
@route {
  path: '/admin'
  layout: 'admin'
}
```

Or per-page directly:

```
@layout 'admin'
```

(The `@layout` form without a block is shorthand for the route-level setting.)

---

## 8. File-Level Reserved Syntax

### 8.1 v1 reserved tokens

The following are reserved for future versions and MUST be rejected if encountered at the top level:

- `---` (frontmatter delimiter, reserved for v2)
- `import` statements at top level (reserved; use `@state` or plugin imports)
- `export` statements at top level (reserved; default export is implicit)
- `;` as statement terminator at top level

```
---                            ← reserved, error in v1
title: 'My Page'
---

import x from 'y'              ← reserved, error in v1
```

### 8.2 Migration markers

Files migrated from other frameworks (Vue, Svelte, etc.) MAY include a header comment indicating origin:

```
// migrated from: src/pages/users.vue
// migration tool: @scribe/migrate-vue v0.4.2
// migration date: 2026-04-15

@state { ... }
```

This is purely informational. The compiler ignores migration headers.

---

## 9. Error Cases

### 9.1 Block-level errors

| Error | Trigger | Message template |
|---|---|---|
| Unknown block name | `@unknown { }` | "unknown block '@unknown'. Valid: @state, @template, @style, @agent, @route, or namespaced plugin block" |
| Duplicate block | Two `@state {}` | "duplicate @state block. Each core block may appear at most once" |
| Missing closing brace | `@state {` with no `}` | "unclosed @state block opened at line N" |
| Closer without opener | `}` at top level | "unexpected '}' at top level. Did you mean to close a block?" |
| Block on same line as closer | `@state { count: 0 }` | "block body must span multiple lines" |
| Top-level statement | `const x = 5` outside block | "top-level statements not permitted. Wrap in @state block" |
| Top-level HTML | `<h1>` outside block | "top-level markup not permitted. Wrap in @template block" |

### 9.2 Reserved syntax errors

| Error | Trigger | Message template |
|---|---|---|
| Frontmatter | `---` at top of file | "frontmatter syntax reserved for v2; use @state for component data" |
| Top-level import | `import x from 'y'` | "top-level imports reserved; use plugin contributions or @state imports" |
| Top-level export | `export default ...` | "top-level exports reserved; default export is implicit" |

### 9.3 Cross-block reference errors

| Error | Trigger | Message template |
|---|---|---|
| Undefined name in @template | `<h1>{undefinedName}</h1>` | "undefined identifier 'undefinedName' referenced in @template. Declared names in @state: ..." |
| Undefined name in @style | `$reactive(undefinedSignal)` | "undefined signal 'undefinedSignal' referenced in @style. Available signals: ..." |
| Undefined name in @agent | `$expose undefinedName` | "undefined identifier 'undefinedName' referenced in @agent. Declared names in @state: ..." |
| Forbidden cross-reference | `@state` referencing `@template` | "cross-block references from @state to @template are not permitted" |

### 9.4 Plugin block errors

| Error | Trigger | Message template |
|---|---|---|
| Bare plugin name | `@field { }` | "bare block name '@field' is not a core block. Plugin blocks require namespaced form: '@plugin.field'" |
| Unregistered plugin | `@unknown-plugin.block { }` | "unknown plugin 'unknown-plugin'. Register in scribe.config.ts plugins array" |
| Plugin block exceeds multiplicity | Multiple `@plugin.field` when plugin allows 1 | "plugin '@plugin.field' may appear at most once per file (per plugin manifest)" |

---

## 10. Examples

### 10.1 Minimal page component

```
@template {
  <h1>Hello, world!</h1>
}
```

A page with no logic, no styles, no agent surface. Compiles to a static component.

### 10.2 Standard component with all four blocks

```
@state {
  $prop title: string
  count: number = 0
  
  $action increment() { count++ }
}

@template {
  <div>
    <h1>{title}</h1>
    <button $on:click="increment">Count: {count}</button>
  </div>
}

@style {
  div { padding: 1rem }
  h1 { font-size: 1.5rem }
  button { 
    color: $reactive(count > 10 ? 'red' : 'black')
  }
}

@agent {
  $expose count, title
  $action increment
  $describe increment "Increment the counter by 1"
}
```

### 10.3 Page with routing override

```
@route {
  path: '/admin/users/[id]/edit'
  middleware: ['auth', 'admin']
  ssr: true
  layout: 'admin'
}

@state {
  $prop route: Route
  $resource user = data.user.query({ id: route.params.id })
  
  $action async save(formData: FormData) {
    await data.user.update({ ...Object.fromEntries(formData) })
  }
}

@template {
  <$shield>
    <$suspense fallback="Skeleton">
      <form $action="save">
        <input name="name" $bind:value="user.data.name" />
        <button type="submit">Save</button>
      </form>
    </$suspense>
    <$slot name="fallback">
      <ErrorPage error="shield.error" />
    </$slot>
  </$shield>
}

@agent {
  $expose user
  $action save
  $scope admin
  $describe save "Save changes to the user's profile (admin only)"
}
```

### 10.4 Logic-only composable

```
// src/composables/useCounter.scribe

@state {
  count: number = 0
  
  $action increment() { count++ }
  $action reset() { count = 0 }
  
  $expose count, increment, reset
}
```

No `@template` — this is a logic module, imported by other components for shared state.

### 10.5 Component with plugin block

```
@state {
  $prop email: string
}

@template {
  <form>
    <Input name="email" />
    <button type="submit">Submit</button>
  </form>
}

@forms.fields {
  email: {
    type: 'email'
    required: true
    validate: (v) => /^[^@]+@[^@]+$/.test(v)
  }
}
```

The `@forms.fields` block is contributed by a hypothetical forms plugin. Its parser and lowering are defined in the plugin's spec.

---

## 11. Compiler Contract

### 11.1 Top-level parser interface

The compiler's top-level parser MUST:

1. Tokenize the file into block boundaries
2. Validate block names (core or registered plugin)
3. Validate block multiplicity (per §3.1, §6.3)
4. Hand off block bodies to block-specific parsers
5. Build a unified symbol table from all block declarations
6. Run cross-block reference resolution
7. Emit a complete component definition

### 11.2 Block parser interface

Each block parser MUST:

1. Accept the block body as input (text between `{` and matching `}`)
2. Return an AST node specific to that block type
3. Report errors with source locations relative to the original file (not the block-relative offset)
4. Add declarations to the unified symbol table
5. Resolve identifiers via the symbol table for cross-block references

### 11.3 Symbol table contents

The unified symbol table per SFC includes:

| Source block | Symbol kind |
|---|---|
| `@state` | Signals, computeds, resources, props, actions, lifecycle hooks, server functions, exposed names |
| `@template` | Element references (for refs), slot names |
| `@style` | (No declarations; `@style` is reference-only) |
| `@agent` | (No declarations; `@agent` is reference-only) |
| Plugin blocks | Declarations per plugin manifest |

### 11.4 Compilation order

The compiler processes blocks in this order regardless of file order:

1. `@route` (if present) — establishes routing context
2. `@state` — establishes symbol table
3. Plugin blocks — extend symbol table with plugin contributions
4. `@template` — resolves references against symbol table
5. `@style` — resolves references against symbol table
6. `@agent` — resolves references against symbol table

Each later phase has read-only access to the symbol table from earlier phases.

### 11.5 Split-Bundle Compilation

> **Applied via Amendment 02 (2026-05-02).** Path convention: **Option B** (`/server/_actions/`, Nuxt-style) — locked by user adjudication during the v1 reconciliation session.

Some macros cause the compiler to emit multiple output artifacts from a single SFC source file. The author writes unified source; the compiler produces split outputs.

| Macro | Server artifact | Client artifact |
|---|---|---|
| `$server` (in `@state`) | `/server/_actions/{component-id}/{name}.ts` | RPC stub in component bundle |
| `$action="..."` (on `<form>` in `@template`) | `/server/_form-actions/{component-id}/{name}.ts` | Form submission handler in component bundle |
| `@agent` block | `/server/_mcp/{component-id}.ts` | (no client code; agent surface is server-only) |

**Coordination guarantees:**

- Split outputs are coordinated by the compiler; the SFC author writes unified source
- The runtime ensures client code never imports server-only modules at runtime
- Server-only imports referenced from client artifacts cause compile errors with clear source locations
- Each split artifact's path is deterministic from the SFC's path and the macro's name
- Generated paths are stable across builds (no hash collisions absent source changes)

**Implementation requirements:**

- The compiler MUST emit server artifacts only when the build target includes server output (e.g. SSR or API routes enabled)
- The compiler MUST emit client artifacts only when the build target includes client output (e.g. SPA or hydration enabled)
- Builds targeting only one side (e.g. static client-only) MUST elide unused server-side macro features with a warning, not a silent skip
- Source maps MUST link generated artifacts back to the original SFC line where the macro appears

**Build target definition:**

The compiler operates with one of three build targets at any time:

| Target | Emits |
|---|---|
| `client` | Client bundle only (SPA mode, static export) |
| `server` | Server bundle only (API-only deployments) |
| `universal` | Both bundles (SSR mode — default for pages) |

The build target is specified in `scribe.config.ts` (`build.target` field) or via CLI flag (`--target`). Default for page components is `universal`.

---

## 12. Open Questions

### 12.1 Should `@route` be a sub-block of `@state` instead of top-level?

Currently `@route` is a fifth top-level block. Alternative: a `route:` field inside `@state`.

```
// Current:
@route { path: '/users/[id]' }
@state { ... }

// Alternative:
@state {
  route: { path: '/users/[id]' }
  ...
}
```

**Proposed resolution:** Keep `@route` as a top-level block. Routing is structural (file-system role), not state. A top-level block for routing matches the conceptual separation of concerns.

### 12.2 Should `@layout` shorthand exist?

The shorthand `@layout 'admin'` (no block body) is convenient but introduces a non-block top-level form. This is the only such case in v1.

**Proposed resolution:** Drop the shorthand. Either use the full `@route { layout: 'admin' }` block or rely on `scribe.config.ts` route-pattern matching. One less special case.

### 12.3 Should plugin blocks support a "must come last" constraint?

Some plugin blocks might need to run after all core blocks have been parsed. Currently plugin block ordering is convention only.

**Proposed resolution:** Add `ordering: 'before-core' | 'after-core' | 'flexible'` to plugin manifests. Defer to v2 if needed.

### 12.4 Should empty files be valid?

A `.scribe` file with no blocks is currently a no-op. Should it error?

**Proposed resolution:** Warn but don't error. Empty files are sometimes useful as placeholders during development. The warning encourages adding content but doesn't block builds.

---

## 13. Verification

Compiler implementations MUST pass conformance tests covering:

- All block-level error cases (per §9)
- Brace matching across complex interior content (per §2.4)
- Cross-block reference resolution (per §4.3)
- Plugin block registration and namespacing (per §6)
- File-system convention application (per §7)
- Symbol table construction (per §11.3)
- Compilation order (per §11.4)

Conformance suite lives in `bench/compiler-conformance/blocks/`. Every error message in §9 has a fixture asserting the exact wording.

---

## 14. Sign-off

Spec is binding once approved. Changes require an amendment with version bump.

**Spec version:** 0.1.0-draft
**Stable from:** TBD
**Reviewed by:** TBD
**Approved by:** TBD
