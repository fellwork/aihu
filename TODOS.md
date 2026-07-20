# TODOS

## Compiler / language (added 2026-07-10)

### aihu-tsc — DONE (2026-07-13); remaining follow-ups
- **Shipped:** `@aihu/tsc` (`aihu-tsc`) projects each `.aihu` into the TypeScript
  program as a VIRTUAL file via Volar's `proxyCreateProgram`. The vite plugin no
  longer writes `*.aihu.ts`, and the scaffolded `typecheck` script now runs
  `aihu-tsc` instead of `tsc` (plain `tsc` cannot see inside a `.aihu` and reports
  a clean pass over every SFC without checking one).
- **Follow-ups:**
  - Consumers can drop `*.aihu.ts` from `.gitignore` once on the new compiler, and
    delete any sidecars still on disk.
  - `aihu-compile <file> --out <dir>` still writes a `<tag>.aihu.ts` into the OUT
    dir. Harmless (it is not next to the source) but now pointless — remove.
  - Wire `.aihu` diagnostics into `@aihu/language-server` from the same surface, so
    the editor and `aihu-tsc` cannot disagree. Its `state-generator.ts` is a second,
    weaker generator and should be retired.

### `signal(null)` infers `T = null` — untyped signals across the corpus (added 2026-07-12)
- **What:** `const [doc, setDoc] = signal(null)` gives `T = null`, so `doc()` is
  `null`, `setDoc(realDoc)` is an error, and every member read off it lands on
  `never`. Same for `signal([])` → `never[]`. Wants `signal<Doc | null>(null)`.
- **Why:** Now that @state is actually type-checked, this single idiom is the
  dominant source of diagnostics in the fellwork web app (15 files; it accounts
  for most of the ~274 substantive errors the new sidecar surfaces). It was
  invisible before only because the script was never handed to tsc.
- **Note:** this is app-side authoring, not a compiler bug — but the corpus has
  to be migrated before `.aihu` type-checking can be made blocking.

### TS type-check sidecar — remaining harvest gap
- **Status (2026-07-12):** the @state body is now INLINED into the sidecar at its
  real lines, so plain script code (imports, consts, functions) carries real
  types and is fully checked. What remains:
  - **macro bodies are not checked.** `$prop:`/`$action:`/`$computed:` lines are
    blanked (they are aihu syntax, not TS — `type: { params: { ref: string } }`
    puts `string` in value position). Their bindings are declared instead, with
    `$prop` carrying its real `type:`. Lowering macro bodies to TS is the fix.
  - **loop aliases are `any`.** `{#each xs as m}` binds `m` in the template, so
    there is no declaration to borrow from. Deriving the element type from the
    iterable (e.g. projecting the body through `xs.forEach((m) => …)`) would
    give `m` a real type.

### TS type-check sidecar — completion pass
- **What:** Finish the TypeScript sidecar so `tsc` coverage over `.aihu` files is
  complete: every template-referenced binding surfaces in the sidecar (not just
  `$context` keys + destructuring loop aliases from #389), line preservation
  (#390) holds across all macro forms, and the remaining unharvested constructs
  (whatever an audit of the emit paths turns up — `@state` collection-macro
  bodies, `$action`/`$computed` return types, slot/prop generics) are typed
  rather than elided.
- **Why:** The sidecar's whole value is trust — a type error in an `.aihu` file
  should always cite the real line (#390's contract) and never be silently
  skipped because a construct wasn't harvested. Partial harvesting gives false
  green checkmarks, which is worse than no checking.
- **Context:** Recent work: #389 (sidecar harvests `$context` keys +
  destructuring loop aliases), #390 (line-preserving sidecar so tsc cites the
  real `.aihu` line). Start with an audit of what the harvester still skips.
- **Start at:** `packages/compiler/src/types.rs` (sidecar placement fields,
  ~L88), the codegen emit paths in `packages/compiler/src/codegen/`, and the
  sidecar tests (`packages/compiler/tests/b3_variant_b.rs`,
  `route_and_build_target.rs`).
- **Depends on:** nothing; sequence after the `@state` server-lowering fix below
  if both touch `emit.rs`, to avoid churn.

### Template expressions: spread, `.map`, and array/array-like functions
- **What:** First-class support in the HTML/template portion of `.aihu` syntax
  for spread (`...xs`), `.map()`/`.filter()`/`.flatMap()` and friends, and
  array-likes (`Set`/`Map` iteration, `Array.from`, index/entries) — both in
  interpolation expressions and in attribute/loop positions. Define what the
  template expression grammar admits vs what must be hoisted to the script
  portion, and make the compiler's error message say exactly that when an
  expression is rejected.
- **Why:** Component authors reach for `items.map(...)` and spread as
  reflexively as in JSX; today the boundary between "template expression" and
  "hoist it to a `$computed`" is undocumented and (per founder report) errors
  are opaque. Whether the fix is grammar support, better lowering, or just a
  crisp diagnostic + docs, the current silent/obscure failure is the bug.
- **Context:** Founder request 2026-07-10, same session as the HTML-comment
  parser report — treat both as "template tokenizer/expression grammar
  hardening". Audit what the expression parser accepts today before deciding
  the cut-line.
- **Start at:** the template expression parser/tokenizer in
  `packages/compiler/src/` (grep for the interpolation/expression grammar), its
  codegen lowering in `codegen/emit.rs`, and the compiler test suite for
  template-expression cases; add a docs page for the template-expression subset
  once the grammar is settled.
- **Depends on:** nothing.

## Deferred from go-public eng review (2026-06-02)

### WS capability-bridge auth/origin hardening (v1.x)
- **What:** Add origin checks + WS authentication to the agent-server capability bridge so only the trusted server process can send approved action invocations to a browser-owned component instance, and only authorized viewers can connect to the state stream.
- **Why:** The bridge topology's entire security argument is that the server is the *sole* policy-enforcement point and the *only* thing that can invoke the client-side opaque-ID dispatcher. A demo bridge that trusts localhost is fine for the launch recording, but in production an unauthenticated WS channel is an open remote-control surface for every mounted component.
- **Context:** Chosen topology (go-public design) is a server-mediated capability bridge: compiler emits a narrow opaque-ID client dispatcher (NOT the raw `__agentBinding`), the browser mounts the real visible component and registers that dispatcher, and the server (holding auth/scope/rate-limit via `getAllAgentMetadata()` + agent-service) forwards only approved invocations over WS. The dispatcher exposes no policy info, so the server-side gate is load-bearing.
- **Depends on:** the capability bridge + compiler opaque-ID dispatcher landing first.
- **Start at:** `@aihu/agent-server` (new package) WS handler; reuse `@aihu/auth` for viewer/session checks; enforce server→client invocation signing or a shared per-session bridge token.

### ~~`$action`/`$computed`/`$prop` dispatcher lowering (CLIENT/bridge path)~~ — FIXED (branch fix/agent-action-computed-lowering)
- **Resolved:** Two real bugs in the client/bridge dispatcher path, fixed + tested:
  - `$action` return value was swallowed — `batch(fn): void` discarded `fn()`'s result, so `return batch(() => { … return X })` returned `undefined`. Fixed: `batch<T>(fn): T` now returns the callback value (`@aihu/signals`; behavioral test in `batch.test.ts`).
  - `$prop` write invoker emitted `(v) => { name = v }` (reassigns the `const` binding → throws, never reaches the signal). Fixed: emits `(v) => name.set(v)` across all three sites (server `__agentBinding`, client `__agentDispatcher` export, in-setup `_registerAgentDispatcher`). Compiler test `agent_prop_write_uses_setter_and_action_returns_value`.
  - Reads (`() => computed()` / `() => prop()`) were already correct.
- **Net:** the capability-bridge (client) path now supports reading computed/prop, driving actions WITH return values, and writing props — so the demo can read/drive signals directly instead of via the `serialize()` snapshot workaround.

### ~~`@state` collection macros are NOT lowered in the SERVER/universal build~~ — FIXED (#327, `11323570`)
- **Resolved:** `emit_options_form` (the divergent server path that skipped lowering) was deleted rather than patched. Targets now branch in exactly one place (`emit.rs:127-131`) and `emit_function_form` runs unconditionally for client/server/universal. Verified: `--target server` emits fully lowered `$prop`/`$action`/`$computed` plus a callable `_registerAgentServerBinding`; `--target universal` is byte-identical.
- **Still true (by design, not a bug):** the module-scope `export const __agentBinding` references setup-closure locals, so it is introspection-only — never invoke it directly. The callable path is the in-setup `_registerAgentServerBinding`.
- **Residual gap — test coverage, not correctness:** there is still no insta snapshot of `--target server` output, `inject_server_binding_registration` has no Rust test, and `agent_prop_write_uses_setter_and_action_returns_value` claims to assert "all three emission sites" but sets `target = Client` and inspects only `client.js`. The whole server path leans on one TS test (`agent-server/tests/headless-compiled-dispatch.test.ts`) that **skips itself if the compiler binary is absent**.

### ~~`describe:` / `expose:` never reached any agent-facing artifact~~ — FIXED (this change)
- **What it was:** Two independent dead ends. (1) `emit_manifest` read only the retired **v1** `@agent { input / action }` keywords, so a v2 component's manifest came out `"inputs": {}, "actions": {}` — and nothing in the repo reads `agent-manifest.json` anyway. (2) More importantly, the compiler **never emitted `registerAgentMetadata` at all**, so the `@aihu/agent` registry that `agent-server`'s `buildToolDefinitions` reads was empty in every real app. `describe:` was parsed, validated, parser-tested — then dropped on the floor, reaching no artifact.
- **Why it hid:** the only manifest test in the suite (`agent_airtime_quote_manifest`) uses a **v1** fixture, so it exercised the dead path and stayed green. `registry.ts`'s doc comment ("The compiler emits `registerAgentMetadata(metadata)` at the top level of each…") described a wire that was never built.
- **Fixed:** `collect_agent_members` now also collects each entry's `describe` (gated on `expose`, so unexposed prose never leaks). New `emit_agent_metadata_registration` emits `registerAgentMetadata({ tag, state, actions })` at module scope for server/universal builds — pure data, so it is safe there. `ActionSchema` gained `describe?`; `buildToolDefinitions` now prefers the authored text over its synthesized string for both action and state tools. `emit_manifest` derives from the same walk, so the sidecar can no longer drift from the live registry.
- **Still open:** MCP `inputSchema` is still `args: { type: 'array' }` — real parameter schemas need handler-signature extraction (arity + types off the `handler:` arrow). That is a separate, larger piece and likely interacts with the `function fetchForecast(async ())` codegen bug below.

### `agent-manifest.json` has no consumers
- **What:** Every `manifest_json` reference in the repo is a compiler test. Nothing in `agent-server`, the CLI, the Vite plugin, or `plugin-agent-readiness` reads the sidecar. It is now derived from the same walk as the live registry so it cannot drift, but it remains an artifact nobody opens.
- **Decision needed:** keep it as a build-time introspection sidecar (external tools could consume it), or delete it and let `registerAgentMetadata` be the single source. Leaning delete — an unread artifact that silently disagreed with the live one is exactly how the v1/v2 drift above went unnoticed.

### ~~`@agent` block: docs say optional, compiler says required~~ — FIXED
- **Resolved:** gating moved from "has an `@agent` block" to "exposes anything". `@agent` keeps its v2 job (policy: `$scope`, `$rate-limit`); a component with exposed members and no block gets an empty `AgentBlock` — no policy, which is what declaring nothing means. Does not widen the surface: `expose:` was already an explicit per-member opt-in, and requiring a second one only made the first silently inert. Covered both ways (a component exposing nothing stays inert, block or no block).
- **Blast radius:** ten `cookbook/`+`examples/` components became agent-enabled — they had written `expose:` and were being ignored. On client builds those now carry the opaque-ID bridge dispatcher, i.e. new client weight where there was none.
- **Still open (docs/CLI):** the MCP server-card `skills` array is still hand-mirrored in `vite.config.ts` with a comment admitting manual sync, while the docs claim it is "auto-populated from the `@agent` blocks in your SFCs… aggregated at build time". Now that `registerAgentMetadata` is emitted, wiring the card off the real registry is finally possible.

### ~~`agent-weather.aihu` compiles to invalid JS~~ — FIXED (it was a class, not a file)
- **Resolved:** the reported `function fetchForecast(async ())` turned out to be one of **five** codegen bugs emitting invalid JS. Syntax-checking all 32 `cookbook/`+`examples/` components with esbuild found 5 failures; all now parse, with regression tests. Full list in the `emitted-js-validity-fixes` changeset: async `$action` arg parsing, block-body brace loss in `$computed`/`$resource`, dropped `async` across four macro kinds, `$form` leaking into the plain body, and destructured `$each` aliases tearing at the comma inside their own pattern.

### Emitted JS is never syntax-checked in CI — SCRIPT LANDED, not yet gating
- **What:** the compiler suites assert that emitted output *contains* expected substrings. Nothing asserted it is valid JavaScript. That is how five separate invalid-output bugs shipped at once, one on a documented cookbook exemplar.
- **Landed:** `scripts/check-emit-parses.ts` (`bun run check:emit-parses`). Compiles every `cookbook/*.aihu` + `examples/**/*.aihu` and parses the result with `Bun.Transpiler` — no new dependency, and it catches assignment-to-const, which esbuild's `transform` silently accepts. Reports `compile` vs `parse` failures separately.
- **NOT wired into `plan-a.yml` yet** — 16 of 59 fixtures still fail, so adding it would red the build. Wire it in once the two lists below are clear.
- **Gotcha baked into the script:** it picks the NEWEST of `packages/compiler/bin` / `target/release` / `target/debug`, not the Vite plugin's fixed precedence. The fixed order silently reads a stale `target/release` and reports already-fixed bugs as live — which it did to me on the first run.

### ~~Components emit invalid JS — macro bodies assigning to a `$prop`~~ — FIXED (CO1, `fix/prop-write-rewrite`)
- **What:** `$prop` lowers to `const count = ctx.props.count` (a callable getter with `.set`). A macro body that writes the prop directly — `count++`, `count = 0`, as `aihu-counter` authors it — emitted assignment to a `const`. That is a hard runtime `TypeError: Assignment to constant variable`, so **the cookbook counter's increment/decrement/reset were all broken**, on probably the most-copied example in the repo.
- **Resolved via option (a):** the compiler now rewrites writes to `$prop` bindings into `.set(…)` inside `$action`, `$lifecycle` and `$effect` bodies — `packages/compiler/src/expr/prop_write.rs`, an oxc AST pass with span-based splicing into the original body text. Reads are deliberately NOT touched: `count()` and bare `count` pass through byte-identical.
- **Corrected file set — the original list here was wrong in one entry, and it mattered.** `examples/hacker-news/src/pages/item/[id].aihu` **writes no prop at all**; its failure is the unrelated `$afterNavigate` bug filed directly below. The true affected set was `cookbook/aihu-counter.aihu`, `cookbook/aihu-modal.aihu`, `cookbook/ssr-hydration.aihu`, `examples/_shared/macro-test.aihu`, and `packages/compiler/tests/codemods/fixtures/todo-mvc.expected.aihu` — plus a **sixth found by diffing every `.aihu` emit in the repo pre/post fix**, `packages/templates/cf-team/template/apps/web/src/components/live-counter.aihu`, which sits outside the `check:emit-parses` glob and had therefore never been surveyed.
- **`$lifecycle` was in scope too, not just `$action`:** `cookbook/ssr-hydration.aihu` writes its props from `$lifecycle.mount`. An `$action`-only fix would have left it broken.
- **Still broken in `todo-mvc.expected.aihu`, by design:** `todos = [...todos, …]` becomes `todos.set([...todos, …])`, but the RHS read `...todos` still spreads the getter *function*. That is the separate bare-read defect in `docs/domain-hints/prop-read-form.md`, out of CO1's scope.
- **Diagnosed rather than rewritten:** destructuring / `for-of` / `for-in` into a prop is **C560** (no sound desugar without a temporary and a statement split); a prop write inside `$computed`/`$resource` is **C561** (a derivation must not mutate); `count.foo = x` warns rather than rewriting, since fixing it would require a *read* rewrite.
- **Why esbuild missed it:** `esbuild --loader=ts` transform does not perform const-assignment analysis. `Bun.Transpiler` does. The earlier 32-component sweep passed all of these.

### `$afterNavigate` lowering strips its call head, leaving a dangling `})` (bug)
- **File:** `examples/hacker-news/src/pages/item/[id].aihu` — after CO1, the only remaining `(parse)` failure in `bun run check:emit-parses`.
- **What:** the `$afterNavigate((to) => {` head — the call expression *and* its arrow prefix — is stripped during lowering, but the body and its closing `})` are spliced through. The emit ends up as:

  ```js
  88:     // arch-5 M1: post-navigation analytics — runs after each successful nav.
  89:       if (typeof window !== 'undefined' && (window as any).analytics?.pageview) {
  90:         (window as any).analytics.pageview(to.pathname)
  91:       }
  92:     })          // ← dangling: the `$afterNavigate((to) => {` head was stripped
  ```

  The orphaned `})` is a syntax error, so the whole module fails to parse. The arrow's `to` parameter is left unbound as well.
- **NOT a `$prop` write bug.** This file writes no prop. It was mis-attributed to the prop-write defect above; CO1 deliberately left it alone, and the negative-control test `hacker_news_item_is_unchanged_by_co1` pins that its emit is untouched. Substituting it into a prop-write brief's acceptance set would have made that slice unfalsifiable.
- **Start at:** the router-macro lowering for `$afterNavigate` / `$beforeNavigate` in `packages/compiler/src/codegen/emit.rs` — compare against how `$lifecycle` callbacks correctly keep their head and args.
- **Depends on:** nothing.

### ~~11 example components no longer compile (stale v1 syntax)~~ — FIXED (#425)
- **Resolved:** all ten non-archived files migrated to v2 (`aihu migrate --v2` chain + hand edits for the `$action name: <arrow>` colon form and stale template macros); `examples/archived/` deleted (git history is the archive). `bun run check:emit-parses` is at **0 compile / 0 parse** failures across all 58 components — including `examples/hacker-news`, whose `$afterNavigate` emit bug (above) no longer reproduces against current `main`.
- **Codemod defects fixed in the same slice:** `$lifecycle.mount: { … }` colon form, quoted `$let="…"`, `onclick={…}`-family C306 event handlers, async-arrow round-trip on the v2 idempotency path, statement-aware `@state` passthrough, trailing-comment preservation. The macro-simplification pass is now reachable via `aihu migrate --v2` (plus `--dry-run` on the standalone runner).

### ~~agent-service gate authorizes by tag, not action name~~ — FIXED
- **Resolved:** `runGate` now checks the requested action against the metadata registered for the tag — it must appear in `actions`, or in `state` (handleToolCall falls through to `getSignal` for those). The old check, `typeof binding.callAction === 'function'`, was always true, so the allowlist was dead code on the only branch that can succeed and the CLIENT was the de-facto authority.
- **Why it hid:** the existing AC11 test's fixture throws `no action:` from `callAction`, so it asserted the INVOKER's rejection, not the gate's — the same inversion mirrored in the test. New AC11b cases use a binding that succeeds for any name; verified failing against the old code, where an unadvertised `wipeDatabase` executed.
- **Residual:** when NO metadata is registered for a tag there is nothing to enforce against and the call falls through to the invoker. Not reachable by anything compiled from source (the compiler now always emits `registerAgentMetadata`), but closing it properly means giving `LiveBinding` an advertised surface.

### a2a / acp are shims that look finished (security + correctness)
- **What:** Neither implements its spec. `agent-a2a` is REST paths using deprecated pre-v0.2 method names with no JSON-RPC envelope and no task store; `body.message` must be the literal string `"tag/action"`, so a conforming client sending a `Message` with `parts` gets `error: 'bad message'`. `agent-acp` hardcodes `handleToolCall(toolName, null)` — **the ACP path structurally cannot pass arguments to any action.**
- **Security:** both forward no `RequestContext`, so they are anonymous by construction. Components *with* `$scope` fail closed correctly, but any component without `$scope`/`$rate-limit` is fully callable, unauthenticated and unthrottled, over public HTTP.
- **Why it hides:** 542 lines of tests validate the shims' own invented shape, locking in the divergence rather than catching it.
- **Also:** the header claims Zed's Agent Client Protocol; the implementation resembles BeeAI ACP.
- **Decision needed:** implement, or mark experimental and stop shipping them as complete.

### Rate limiting fails open where scope fails closed
- **What:** `if (rateLimitSpec !== null && rateLimitPlugin)` — declare `$rate-limit`, forget to install the plugin, get silently unlimited. Scope, by contrast, fails closed (401 `AUTH_MISSING`).
- **Also:** rate-limit keys are `${userId}:${tag}` where `userId` is caller-supplied via MCP tool arguments — trivially evaded by rotating it.

### `@aihu/seo` duplicates `plugin-agent-readiness`, with inverted defaults
- **What:** Copy-pasted bot list; sitemap does **not** XML-escape (a path containing `&` produces invalid XML); `plugin.ts`/`json-ld.ts` write to `ast.__seoJsonLd`, which nothing reads. Not wired into the app pipeline; one example consumer.
- **The footgun:** `agent-readiness` defaults `aiAgents = 'allow-all'`; `seo` defaults `disallowAiBots` to **true**. Same 13 bots, opposite defaults, undocumented. For a framework selling agent-readiness, `@aihu/seo` blocking every AI crawler by default is the wrong default in the wrong package.
- **Also:** `mcp-server-card.ts:84-85` advertises `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`; nothing serves either.
- **Recommendation:** delete `@aihu/seo` or re-export from `plugin-agent-readiness`.

### Docs describe unshipped behavior with no status markers
- **What:** `docs/site/agent-discovery.md` + `authoring-agents.md` total 937 lines with **zero** "not yet implemented"/"planned"/"deferred" markers. Specific contradictions: "Every aihu application automatically exposes standard discovery endpoints… with no manual configuration" (it is opt-in via `config.agentReadiness`, routes hand-wired); "The `skills` array is auto-populated from the `@agent` blocks in your SFCs… aggregated at build time" (hand-mirrored in `vite.config.ts`); and a `.mcp.json` sidecar that does not exist (the real file is `agent-manifest.json`, a different non-MCP shape).
- **Also:** `MarkdownResolver` is an injected interface with no concrete implementation shipping anywhere, and content negotiation is `Accept: text/markdown`-only — it does not sniff user-agents, so a crawler that omits the header gets HTML.

### SSR hydration does not work end-to-end — two independent mismatches
- **Path keys never match.** Server emits `data-aihu-path="0"`, `"0.0"` (`packages/server/src/ssr.ts:440`); client hydrate hardcodes `const pathBase = 'hydrate.0'` (`packages/arbor/src/hydrate.ts:276`). Every lookup misses, `existingEl` is undefined, and hydration silently degrades to the `_materialize()` fallback — appending new nodes alongside the server's rather than adopting them.
- **Why it's green:** `packages/arbor/tests/hydrate.test.ts` hand-writes `hydrate.0` markup instead of feeding it real `renderToString` output. There is no test anywhere piping `renderToString(…, {hydratable:true})` into `hydrate()`. The Rust renderer shares the convention (`packages/server/src-native/src/render.rs:408`), so a fix lands in three places.
- **Shadow DOM is invisible to SSR.** No declarative shadow DOM (`<template shadowrootmode>`) is emitted — grep `packages/server/src` for `shadow` returns nothing. Server output is flat light DOM while the client hydrates into `this.shadowRoot ?? this`. With `mode: 'open'` the default, those are different trees. A second mismatch stacked on the first.
- **Also:** the production SSR path (`packages/router/src/server.ts`) calls `renderToString(component)` with no options at all, so it emits non-hydratable HTML regardless.
- **Also:** `_rootIdCounter` is a mutable module global, so path keys are stable only within one page's mount ordering — not across a server and client render.
- **Depends on:** nothing. Blocks any real SSR story, and blocks shards entirely.

### C205 is a stale hard error rejecting valid code — DONE (#424)
- **What:** `lib.rs` fired C205 when a plain `@state` const read a `$prop`, on the premise that the prop shadow is emitted AFTER the plain body. Issue #279 hoisted prop bindings ABOVE the plain body, which fixed the TDZ this guarded against. Confirmed empirically: `const label = ctx.props.label` now emits before the plain body.
- **Resolution:** deleted the C205 emission in `lib.rs`; replaced the rejection-locking test in `cross_block_decls.rs` with two `issue424_*` tests (prop read now compiles + prop binding emitted before the plain body); updated the four docs pages. The `find_plain_const_prop_read` helper in `signals.rs` is retained (its own unit tests still pass) but is no longer wired into the pipeline. No genuinely TDZ-unsafe construct depended on this guard.

### Shard prerequisites (only if pursuing topcoat-style server fragments)
- Ordered; each blocks the next. Recorded from the feasibility pass so the shape isn't re-derived.
- 1. The two SSR mismatches above — prerequisite for everything.
- 2. **Signal pre-seeding.** `hydrate()` accepts a `snapshot` and explicitly discards it (`void snapshot`, hydrate.ts:244) because `signalRegistry` stores getters only, not setters. A server fragment can re-wire effects but cannot deliver VALUES — which is the entire point of a shard.
- 3. **SSR for structural nodes.** `renderNodeAsync` handles `leaf` and `branch`, then falls through to `enqueue('')` — `when()`/`each()` render to the empty string. No shard may contain a list or conditional.
- 4. **A `hydrateFragment(node, host, pathPrefix, parentScope)` entry point.** Today `pathBase` is hardcoded and there is no way to hydrate against an EXISTING scope, so a fragment can't splice into its parent's disposal chain.
- 5. **The endpoint layer.** No server-function / RPC / action concept exists anywhere in `router` or `server` (grepped: zero hits). Registry, stable IDs, protocol, and client-signal serialization all need building.
- **Reusable as-is:** fragment-mode `renderToString` (omit `head`), the hydration walker's wire-don't-recreate algorithm, `ChildScope` + `_teardownChildScope` + `_mc` as the region swap primitive, `effect()` for invalidation, `defineApiRoute` as endpoint substrate.
- **Recommendation:** restrict v1 shards to `shadowMode: 'none'` — those route CSS through `virtual:aihu-utility/<hash>.css` and sidestep the constructable-stylesheet problem entirely, since a server fragment cannot carry `adoptedStyleSheets`.

### MCP tools still ship without parameter schemas
- **What:** `buildToolDefinitions` emits `inputSchema: { properties: { args: { type: 'array' } } }` for every action — no arity, no parameter names, no types. `ActionSchema` carries `returns` and (now) `describe`, but no parameter information, so there is nothing to emit even in principle.
- **Why it matters:** descriptions now reach agents, which fixes tool SELECTION. This is what's left for tool USE — an LLM still has to guess argument shape.
- **Fix:** extract handler signatures (arity + types off the `handler:` arrow) in the compiler and thread them into `ActionSchema`. Interacts with the `$prop`-mutation decision above, since both touch action-body/handler parsing.

### plugin-agent-readiness serves deprecated / non-spec discovery endpoints (bug)
- **Verified against the specs and against our own source.** Three separate problems:
  1. **`/.well-known/agent.json` is the DEPRECATED A2A path.** Spec v0.3.0 (2025-07-30) renamed it to **`/.well-known/agent-card.json`** — flagged breaking, rationale was IANA feedback that `agent.json` was too generic. Current spec is v1.0.1 (2026-05-28, Linux Foundation). SDKs serve both with a deprecation warning; we serve only the old one. See `src/a2a-card.ts:3`, `src/types.ts:63`, `src/vite-plugin.ts:211`.
  2. **`/.well-known/mcp.json` and `/.well-known/mcp/server-card.json` are in NO MCP spec.** Revision `2025-11-25` defines neither. The proposals are unmerged: **SEP-1649 is CLOSED**; SEP-2127 was moved **off the Standards Track onto the Extensions Track**. Our `tests/compliance/mcp-server-card-schema.test.ts` validates "SEP-1649 compliance" against a closed proposal — a test that pins us to a dead spec. See `src/mcp-discovery.ts:3,27`, `src/mcp-server-card.ts:4`.
  3. **The one thing MCP *does* specify, we don't serve.** `mcp-server-card.ts:84-85` advertises `/.well-known/oauth-protected-resource` (RFC 9728) and `/.well-known/oauth-authorization-server` (RFC 8414) and **nothing serves either**. Note RFC 8414's document belongs on the **authorization server**, not the MCP server.
- **Also:** `llms-full.txt` is a **Mintlify invention**, not in llmstxt.org (which defines `llms-ctx.txt` / `llms-ctx-full.txt`). Harmless and widely copied — just don't call it spec compliance.
- **Fix:** serve `agent-card.json` (keep `agent.json` as a deprecated alias), stop claiming SEP-1649 compliance, and either serve the OAuth well-knowns or stop advertising them.
- **Context:** full evidence in `docs/domain-hints/seo-and-agent-discoverability.md` §6.

### Adopt ARD (`/.well-known/ai-catalog.json` + robots.txt `Agentmap:`)
- **What:** [Agentic Resource Discovery](https://agenticresourcediscovery.org/spec), announced 2026-06-17 by Google, Microsoft, GitHub, Hugging Face, Cisco, Databricks, NVIDIA, Salesforce, ServiceNow, Snowflake. A `/.well-known/ai-catalog.json` listing `application/a2a-agent-card+json` and `application/mcp-server-card+json` entries, plus an **`Agentmap:` robots.txt directive mirroring `Sitemap:`**.
- **Why it matters here:** `Agentmap:` is the single clearest technical convergence point between the crawler and agent worlds — the one place the two audiences share a mechanism *by design* rather than by our construction. It is the standards-backed version of the unified-discoverability surface we were about to design ourselves.
- **Status:** v0.9 draft, one month old, Apache-2.0. Real backing, but do not over-index. Track it; don't bet the design on it yet.
- **Depends on:** the endpoint-correctness item above (ARD entries reference the A2A and MCP cards, so those paths must be right first).

### Bare boolean attributes are stripped in templates (bug)
- **What:** A bare HTML boolean attribute in `@template` (e.g. `<button disabled>`)
  is dropped from the emitted element — authors must write `$disabled={true}` to
  get `disabled=""`. Found while wiring a disabled affordance in fellwork-web; the
  same latent bug sits on an audio `<button disabled>` there.
- **Why:** Bare booleans (`disabled`, `readonly`, `required`, `checked`, `selected`,
  `hidden`, …) are standard HTML; silently stripping them is a correctness trap the
  author only catches at runtime.
- **Start at:** the template attribute parser/codegen (`packages/compiler/src/parser/`
  attribute handling + `codegen/emit.rs`) — emit a bare boolean attribute as
  `attr=""` (or the framework's boolean-attr convention), or diagnose it.
- **Depends on:** nothing.
