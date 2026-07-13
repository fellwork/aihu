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

### `@state` collection macros are NOT lowered in the SERVER/universal build (separate, deeper bug)
- **What:** Discovered while fixing the above. For `--target server`/universal, the compiler emits the `@state` body's `$prop:`/`$action:`/`$computed:` blocks **verbatim as raw JS labeled statements** instead of lowering them (to `ctx.props.x` / `function name(){…}` / `computed(…)`). The emitted `__agentBinding` then references `bump`, `label`, etc. that are never declared — so the **headless server-side dispatch path (`__agentBinding` without a bridge) is broken for any real compiled `@agent` component.** Only the CLIENT (elide_agent) path lowers correctly.
- **Why it hasn't bitten yet:** the T6 demo + `@aihu/agent-server` tests drive components over the **bridge (client) path**, and the agent-service unit tests use **hand-built** `agentBinding` objects — so the compiler's server-side lowering was never exercised end-to-end. The launch demo is unaffected. But "use `createAgentServer` headless (no browser) against a compiled component" would fail today.
- **Context:** `packages/compiler/src/codegen/emit.rs` — the server/universal `emit()` path does not run the collection-macro lowering that the client `elide_agent` path runs. Repro: `aihu-compile --stdin --tag t --target server < comp.aihu` and inspect the `setup(ctx)` body — the `$prop:`/`$action:` blocks appear unlowered.
- **Depends on:** nothing; compiler fix. Bigger blast radius than the client-path fix — touches the core setup-body lowering, so scope carefully.

### agent-service gate authorizes by tag, not action name (minor)
- **What:** `handleToolCall`/`authorize` confirm a live binding exists for the TAG but don't re-validate the action name against that binding. An unknown action on a registered tag passes the gate and surfaces as a loud `503 BRIDGE_ERROR` from the browser-side opaque-ID desync rather than a clean `404 no action`.
- **Why:** Cosmetic/UX correctness — the call is still rejected loudly without mutating state (the security invariant holds), but the code is misleading. A real MCP client would prefer a `404`.
- **Context:** `packages/agent-service/src/agent-service.ts` `runGate` step 1 (the live-binding branch checks `typeof binding.callAction === 'function'`, not action membership). Low priority; documented in the agent-server tests.
- **Depends on:** nothing.

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
