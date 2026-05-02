# Investigation — @route Block + Build-Target Framework Status

**Date:** 2026-05-02
**Investigator:** Investigator (Mode 3, read-only)
**Branch:** investigate/v1-reconciliation
**Repo HEAD when measured:** main = 7fa0957 (Scout's reference base);
investigation branch tip = e9d2d46 (Architect roadmap draft).

> **Working note:** Two of the four "required reading" files (the Director's
> session-start note and a second Scout's spec-quartet-alignment report) are
> not yet in `.team/v1-reconciliation/`. The Director said "in flight"; this
> report goes off the existing Scout Round 1 + Architect roadmap draft and
> direct source/spec inspection.

---

## Item 7 — `@route` block status

### Parser audit

- **File:** `packages/compiler/src/parser/sfc.rs`
- **Recognizes `@route` block:** **NO**
- **Cite:**
  - `packages/compiler/src/parser/sfc.rs:82-88` — the `BlockKind` enum has
    exactly four variants: `Script`, `Template`, `Style`, `Agent`. No `Route`.
  - `packages/compiler/src/parser/sfc.rs:92-108` — `next_block()` looks for
    only four opener strings: `"<script setup"`, `"<template>"`, `"<style"`,
    `"<agent>"`. No `@route` (or `<route>`) opener is searched.
  - `packages/compiler/src/parser/mod.rs:1-4` — module file lists only
    `agent`, `directives`, `sfc`, `template`; no `route` parser module.

Note: the `@route` syntax in spec §7.3 uses the `@`-prefixed block convention
described in `docs/spec-block-structure.md`, while the current parser only
recognizes legacy HTML-tag blocks (`<agent>`, `<script setup>`, …). This is
a separate vocabulary mismatch (the v1 spec moved to `@`-prefixed blocks but
the compiler still parses HTML-tag blocks); regardless of the syntax form, no
"route" block of either shape is recognized.

### Type definitions

- **File:** `packages/compiler/src/types.rs`
- **`@route` block represented in AST:** **NO**
- **Cite:**
  - `packages/compiler/src/types.rs:13-20` — `ScribeSource` struct has fields
    `script`, `template`, `style`, `meta`, `agent`. No `route` field.
  - `packages/compiler/src/types.rs:96-101` — `AgentBlock` is the only
    structured-data block type defined; no `RouteBlock` exists.
  - `packages/compiler/src/types.rs:46-49` — `CompileUnit` wraps
    `ScribeSource` + `template_ast`; nothing route-related.

### Codegen audit

- **File:** `packages/compiler/src/codegen/emit.rs`
- **Emits route metadata from `@route` blocks:** **NO**
- **Cite:**
  - `packages/compiler/src/codegen/emit.rs:26-47` — `emit()` branches on
    `unit.source.agent` (Some → options form; None → function form). No
    branch for a route block; it does not exist in the input type.
  - `packages/compiler/src/codegen/emit.rs:228-311` — `emit_manifest()`
    only emits `agent-manifest.json` from the `<agent>` block. No
    `routes.json` / route manifest emission of any kind.
  - `packages/compiler/src/bin/main.rs:88-107` — CLI writes exactly two
    artifacts: `<tag>.ts` (component JS) and, conditionally,
    `agent-manifest.json`. No route-metadata sidecar is produced.

### Router consumption

- **File:** `packages/router/src/router.ts` and
  `packages/router/src/vite-plugin.ts`
- **Reads compiler-emitted route metadata:** **NO**
- **Falls back to file-system scanning only:** **YES (exclusively)**
- **Cite:**
  - `packages/router/src/vite-plugin.ts:75-89` — `scanPages(root, pagesDir)`
    walks the `pages/` directory and returns matching files; no metadata
    consumed from any compiler artifact.
  - `packages/router/src/vite-plugin.ts:37-56` — `parseSegments()` derives
    segments purely from the file path (`[id]` → param, `[...all]` →
    catchall). No `@route { path: ... }` override is read.
  - `packages/router/src/vite-plugin.ts:61-73` — `generateVirtualModule()`
    emits the `virtual:scribe-routes` body straight from filenames:
    `pattern`, `segments`, and `module: () => import(<file>)`. No `name`,
    `middleware`, or `ssr` field carried through (the four fields shown
    in spec §7.3 example).
  - `packages/router/src/router.ts:1-31` — `RouteDefinition` shape is
    `{ pattern, segments, module }`. No `name`, no `middleware`, no `ssr`,
    no other `@route` fields.

The `@route` block's stated overrides (path, name, middleware list, ssr
flag, layout — see Block Structure Spec §§7.3 and 7.5 lines 335-410) have
**no path of any kind into the file-based router today.** Even if a SFC
contained an `@route` block, the parser would currently fail (it would
either be silently dropped depending on where it sits relative to known
block openers, or — more likely — error out, since the parser advances
position by recognized blocks only and `@route { ... }` between blocks is
not expected).

### Verdict

**Item 7 status:** **GAP**

Nothing in the Rust compiler, the codegen, the CLI, the router, or its
Vite plugin reads, emits, or honors `@route`. The block exists only in
spec text (Block Structure Spec §7.3, footnote in §7.2; Amendment 01
clarifies its existence in the macro vocabulary). The router today is
file-system-scan only (PR #21).

**Implication for v1.0-final:** This is **build in v1.0-final** (or
defer to v1.1) — there is no implementation to ratify. Required pieces:

1. Parser: recognize a fifth block (probably a new `BlockKind::Route`
   in `sfc.rs:82-108` plus a new `parser/route.rs` module to parse the
   TypeScript-object-literal body shown in spec §7.3).
2. Types: add `RouteBlock` struct (with `path`, `name?`, `middleware?`,
   `ssr?`, `layout?` fields) and a `route: Option<RouteBlock>` field on
   `ScribeSource`.
3. Codegen: emit a sidecar (e.g. `<component-id>.route.json`) or extend
   the `defineElement` call to embed metadata, OR emit a third artifact
   for the router's vite-plugin to discover.
4. Router vite-plugin: optionally read the compiler-emitted route
   metadata to override `pattern`/`segments` and to carry through
   `name`/`middleware`/`ssr`/`layout`. Update `RouteDefinition` shape
   in `router.ts:17-21` to carry the new fields.
5. Validation: the spec restricts `@route` to files under `src/pages/`
   ("Pages only" in the table at §7.3); the parser/compiler should
   reject `@route` outside that path (probably a CLI flag or
   path-aware compiler hook).

**Effort estimate:** 2-4 days of focused compiler + router work.
Parser+types: ~half day. Codegen+CLI sidecar: ~half day. Router
vite-plugin metadata-merge: ~half day. Validation + tests + integration
fixture: 1-2 days. The `@route` body is a TypeScript object literal,
not a custom mini-language, so parsing is a string-extraction problem
(similar to how `<agent>` is extracted at `sfc.rs:224-247` and then
handed to a sub-parser at `parser/agent.rs`).

---

## Item 8 — Build-target framework

### Compiler awareness

- **File:** `packages/compiler/src/lib.rs`
- **Has build-target concept:** **NO**
- **Existing vocabulary (if any):** **none**
- **Cite:**
  - `packages/compiler/src/lib.rs:1-25` — public surface is `compile()`
    and `compile_full()`; both take only `source: &str` (or
    `&ScribeSource`). No target parameter, no environment toggle, no
    feature flag.
  - `packages/compiler/src/codegen/emit.rs:26` — `emit(unit, tag_name)`
    has only two parameters. No target argument; the emitted JS shape is
    identical regardless of intended runtime.
  - Repo-wide grep for `target|client|server|universal|--target|BuildTarget`
    in `packages/compiler/src/`: **zero matches**.

### CLI flag

- **File:** `packages/compiler/src/bin/main.rs`
- **`--target` flag:** **NO**
- **Other relevant flags:** `--stdin`, `--tag <name>`, `--out <dir>`
  only.
- **Cite:**
  - `packages/compiler/src/bin/main.rs:5-22` — flags parsed: `--stdin`,
    `--out`. No `--target`.
  - `packages/compiler/src/bin/main.rs:25-43` — in stdin mode the only
    other flag is `--tag <name>`.
  - `packages/compiler/src/bin/main.rs:88-112` — output paths are
    `<dir>/<tag>.ts` (component JS) and `<dir>/agent-manifest.json` (if
    agent block present). One artifact shape regardless of intended
    runtime.

There is no separation between client, server, and universal artifacts
at the compiler boundary. The only conditional is "agent block present
yes/no," which gates options-form vs function-form emission and
agent-manifest emission — both are runtime-agnostic.

### Config field

- **File:** `packages/server/src/config.ts`
- **`build.target` field in `defineScribeConfig`:** **NO**
- **Other build-related config:** none. There is no `build` object at
  all.
- **Cite:**
  - `packages/server/src/config.ts:11-27` — `ScribeConfig` interface has
    exactly three optional members: `server` (CORS, basePath,
    maxBodySize), `agent`, `routes` (only `manifestPath`). No `build`
    field.
  - `packages/server/src/config.ts:43-45` — `defineScribeConfig` is the
    identity function; whatever the user passes is what they get. There
    is no build-time mutation, default-target injection, or schema
    validation that would constrain target.
  - Repo-wide grep for `build\.target`: only one file matches —
    `docs/AMENDMENT-02-block-structure-split-bundle.md` (the proposal
    itself). Confirmed via Grep on `C:\git\fellwork\scribe`.

### Loader coordination

- **File:** `packages/server/src/loader.ts`
- **3-state loader interacts with build-target:** **NO** — it operates
  on a different axis (runtime detection, not build target).
- **Cite:**
  - `packages/server/src/loader.ts:122-127` — `LoaderState` is
    `'native-loaded' | 'edge-skipped' | 'native-failed-loud' |
    'unsupported-platform'`. These are *runtime* states, not build
    targets.
  - `packages/server/src/loader.ts:50-87` — `detectPlatform()` switches
    on `process.platform + process.arch`; the only "modes" are platform
    descriptors (darwin-arm64, darwin-x64, linux-x64-gnu,
    win32-x64-msvc).
  - `packages/server/src/loader.ts:93-111` — `detectEdge()` checks
    `globalThis.EdgeRuntime`, `process.env.NEXT_RUNTIME`, and
    `process.env.SCRIBE_NATIVE_SKIP`. These are deployment-runtime
    signals, not build targets the user picks.
  - `packages/server/src/loader.ts:301-350` — `renderToString()`
    branches on loader state and on `opts` (serializer, contextSetup,
    component shape). No branch ever consults a "build target" symbol.

The loader's three states (`NATIVE_LOADED`, `EDGE_SKIPPED`,
`NATIVE_FAILED_LOUD`) are *orthogonal* to Amendment 02 §11.5's
`client/server/universal`. The loader answers "where am I running
right now?"; the build target answers "what artifacts should the
compiler emit?". They could in principle interact (e.g. an
`EDGE_SKIPPED` deployment might still want server-only `_scribe-server/`
artifacts) but there is no coordinating mechanism today.

### Codegen target awareness

- **File:** `packages/compiler/src/codegen/emit.rs`
- **Different output per target:** **NO**
- **Examples (if YES):** N/A
- **Cite:**
  - `packages/compiler/src/codegen/emit.rs:26-47` — single emission path;
    only branch is "agent block present" (options form + manifest) vs
    "no agent block" (function form). No conditional that elides
    `_scribe-server/...` artifacts for `client`-only builds, no
    conditional that elides client component JS for `server`-only
    builds.
  - `packages/compiler/src/codegen/emit.rs:228-311` — `emit_manifest()`
    always emits the agent manifest when an `<agent>` block is present.
    There is no "skip in client-only build" gate — which Amendment 02
    §11.5 explicitly mandates ("Builds targeting only one side ... MUST
    elide unused server-side macro features with a warning").

### Verdict

**Item 8 status:** **GAP**

There is **no build-target framework of any vocabulary** in the
compiler, CLI, config, or loader today. The loader's 3-state machine
is an unrelated concept (runtime detection) and the only "branching"
in codegen is `agent-block-yes/no`, which doesn't carve along the
client/server/universal axis. There is nothing for Amendment 02 §11.5
to ratify and no rename-vs-amend choice to make.

**Implication for v1.0-final:**
- Not "SHIPPED with matching vocab" — not shipped at all.
- Not "SHIPPED with different vocab" — there is no different
  vocabulary, just absence.
- This is a clean **build in v1.0-final** (or defer to v1.1):
  - Add `BuildTarget` enum (`Client | Server | Universal`) to
    `packages/compiler/src/types.rs`.
  - Plumb a target argument through `compile()`/`compile_full()`/
    `emit()` (or hang it on `CompileUnit` so emit doesn't grow more
    parameters).
  - Add `--target <client|server|universal>` flag to
    `packages/compiler/src/bin/main.rs` (default `universal` per spec
    §11.5 last paragraph).
  - Add `build` object with `target` field to `ScribeConfig` in
    `packages/server/src/config.ts`.
  - Once split-bundle macros (`$server`, `$action` on `<form>`,
    `@agent` block emitting MCP) land, gate their server-artifact
    emission on target ∈ {Server, Universal} per spec §11.5.

**Effort estimate:** 1-2 days for the *plumbing* alone (enum + threading
+ CLI flag + config field + tests). Days/weeks more if the Architect
also wants the actual split-bundle artifacts — but those aren't on main
yet anyway (no `$server`, no form `$action`, no MCP-from-agent emission;
only `agent-manifest.json` exists). So plumbing the target framework
into a compiler that doesn't yet have target-conditional outputs is
mostly a no-op decoration today; the real work is: (a) define the
plumbing, (b) wire it as macros land. **1-2 days for (a).**

---

## Cross-item interactions

The two items interact in one direction. **`@route` emission depends on
build-target awareness** when (and only when) `@route { ssr: true }` /
`@route { middleware: ['auth'] }` cause the compiler to emit
server-side route handler code (the auth middleware glue, the SSR
toggle into the loader's branch). At that point, in a `client`-only
build, the compiler must elide the server-side handler glue per
Amendment 02 §11.5's "MUST elide ... with a warning" rule. So:

- `@route` parser/types/codegen can land **without** the build-target
  framework, *if* the v1.0-final scope is just "echo the route
  metadata into the router's virtual module" (override path, name,
  layout, but not ssr/middleware semantics).
- `@route` cannot fully ship until the build-target framework lands,
  *if* `ssr: true` and `middleware: [...]` are in the v1.0-final
  surface (those are the bits that generate side-emitted server
  artifacts).

The file-based router does **not** today need build-target awareness
to skip server-only routes in client builds, because there is no notion
of "server-only route" in the router today (every route is loaded the
same way: `module: () => import(<file>)`). Adding `@route { ssr: true }`
is what would introduce a server-only-route concept, and that is
gate-locked behind both items shipping together.

**Recommendation for the Architect:** treat Items 7 and 8 as a
*coupled pair* in v1.0-final scoping. Either both ship (full split-
bundle awareness) or both defer (and v1.0-final ratifies the file-
system-scan-only router). A "land Item 7 alone" plan is workable
*only* if the v1.0-final `@route` surface is restricted to override
fields that don't require server emission (`path`, `name`, `layout`).

---

## Open follow-ups

1. **`@`-prefixed vs `<>`-tag block syntax.** The current Rust parser
   recognizes HTML-tag blocks (`<script setup>`, `<template>`,
   `<style>`, `<agent>`) but the v1 specs (Block Structure Spec
   §7.3, AMENDMENT-01) describe `@`-prefixed blocks (`@route`,
   `@state`, `@template`, `@style`, `@agent`). This is a vocabulary
   schism that this investigation did NOT try to resolve — the
   Architect should flag it. If `@route` lands in v1.0-final, does it
   land in `@`-prefixed form (forcing all blocks to migrate) or in
   `<route>` HTML-tag form (matching the existing parser)? Cite:
   `packages/compiler/src/parser/sfc.rs:92-108` (only HTML-tag
   openers searched) vs `docs/spec-block-structure.md:340` (uses
   `@route { ... }` syntax).

2. **`@layout 'admin'` shorthand.** Spec §7.5 (line ~410) shows two
   forms: `@route { layout: 'admin' }` (block form) and
   `@layout 'admin'` (shorthand). The shorthand is flagged in spec
   §12 as a candidate to drop (line 695). Out of scope for this
   investigation; flag for the Architect when scoping `@route`.

3. **`scribe.config.ts` schema canonicalization.** The Block Structure
   Spec references "Project Config Spec — currently not yet drafted"
   (Amendment 02, Verification block), but `defineScribeConfig` exists
   today in `packages/server/src/config.ts`. There is a real config
   schema and a planned spec, but they don't yet meet. Adding
   `build.target` is a fine wedge to start the spec, but the
   Architect should be aware the Project Config Spec is stub-only.

4. **Loader state ↔ build target mapping.** If the build-target
   framework lands as `Client | Server | Universal`, what state does
   the loader take on a `Server`-only build at edge runtime? Today
   the loader auto-skips to TS at edge regardless. The interaction
   is not currently specified. Flag.

5. **Director's Q5 (Scout report) is adjacent.** Scout Q5 asks
   "Server-native loader: SSR-only or full edge/Workers adapter?" —
   this is the same surface as the build-target framework. Unifying
   the two questions in one Architect decision would reduce
   ambiguity.

