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

### `@agent` block: docs say optional, compiler says required
- **What:** All agent codegen is gated on `unit.source.agent.is_some()` (`emit.rs:127, 211`). But `docs/site/authoring-agents.md:87` says "No `@agent` block needed", and `aihu create` scaffolds a component with `$action` + `expose` + `describe` and **no `@agent` block**. `cookbook/agent-weather.aihu` — the canonical `expose`/`describe` example — likewise has none, and compiles to zero agent artifacts.
- **Net:** the default scaffold is discoverable (the MCP server-card is served) but not callable, and the card's `skills` array is hand-mirrored in `vite.config.ts` with a comment admitting it is kept in sync manually. The scaffold's own comment that "`$action` is the single source of truth for the agent surface" is false at the compiler level.
- **Decision needed:** either make `@agent` optional in codegen (gate on "has any exposed member" instead), or make the scaffold and cookbook include the block. Pick one.

### `agent-weather.aihu` compiles to invalid JS (bug)
- **What:** An async `$action` handler lowers to `function fetchForecast(async ()) { … }` — a syntax error. Reproduced by compiling `cookbook/agent-weather.aihu` directly.
- **Why it matters:** it ships as a cookbook exemplar for the agent feature.

### agent-service gate authorizes by tag, not action name — NOT minor; re-triaged
- **What:** `handleToolCall`/`authorize` confirm a live binding exists for the TAG but don't re-validate the action name against that binding. `agent-service.ts:148` checks `typeof binding.callAction === 'function'` — **always true**. The real check (`action in meta.actions`) sits only on a branch that unconditionally returns 404 two lines later, so the allowlist is never enforced on any path that can succeed.
- **Why the old "cosmetic" triage was wrong:** enforcement is displaced to the browser's opaque-ID map, which makes **the client the allowlist authority**. That directly inverts this file's own stated design two entries up — "The dispatcher exposes no policy info, so the server-side gate is load-bearing." Today it is not load-bearing.
- **Context:** `packages/agent-service/src/agent-service.ts` `runGate` step 1.
- **Depends on:** nothing.

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
