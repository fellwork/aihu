# Slice 0 — Build-time invariants: architecture spec

**Branch:** `ci/thesis-invariants` · **Answers to:** `docs/architecture/thesis.md` (base layer, not revisable here) · **Scoped by:** `docs/plans/2026-07-19-thesis-conformance.md` §"Slice 0"

> Authored by the Slice-0 Architect (read-only agent); committed by the Team Lead on its behalf.

## Design principle: the ratchet, not the boolean

The five green-but-vacuous suites all failed the same way — they asserted *the shape of a thing they themselves supplied*. Two structural rules follow, and every check below obeys both:

1. **Prefer behavioral probes over textual assertions.** Where a property is observable at runtime, the check must observe it. Grep is used only where the defect is genuinely lexical (a duplicated declaration), never as a proxy for behavior.
2. **Every check exits on an exact expected-failure count, not on zero.** Each script takes `--expect <N>` and exits 0 **iff** `failures === N`. Count goes up (new violation) → red. Count goes down (slice landed) → *also* red, forcing the baseline decrement in the same PR that fixes the defect. This is what lets all five gate in CI on day one despite all five failing, and it is the mechanism that proves each check actually fails first — the baseline is committed as a number and CI enforces it.

A check whose `--expect` is unreachable in both directions is measuring nothing. Each spec states its bidirectional proof: a **fails-when** case and a **must-not-flag** case, both required as fixtures.

---

## 1. `check:derived`

| | |
|---|---|
| **Script** | `scripts/check-derived.ts` |
| **npm script** | `"check:derived": "bun scripts/check-derived.ts"` |
| **Exit contract** | `--expect 2`. Exit 0 iff exactly 2 findings. Exit 1 with per-finding `file:line` + rule id otherwise. Exit 1 if the agent-surface file set is empty (no vacuous pass — precedent: `check-emit-parses.ts:77`). |
| **Complexity** | Medium. Two rules, one needs light TS parsing. |

**What it asserts.** Thesis §2: *"if a human has to remember to update something when they add an `$action`, the property is violated."* Two structural rules, each grouped **by defect, not by comment** — three comments describing one duplication is one finding.

**Rule D1 — duplicated agent-surface declaration.** Over an allowlist of agent-surface source roots (`packages/plugin-agent-readiness/src`, `packages/seo/src`, `packages/agent-*/src`, `packages/mcp/src`, `packages/server/src/agent-readiness-config.ts`, `packages/cli/src`), extract every exported `interface`/`type` declaration and hash its normalized member-name set. Any declaration **name** whose structural hash appears in ≥2 distinct packages is one finding.

**Rule D2 — hand-authored agent artifact literal.** In scaffold output (`packages/cli/src/index.ts`, `templates-*.ts`) and every `examples/*/vite.config.*`, any `skills:` / `tools:` / `actions:` array literal whose elements are object literals with literal `id`/`name` values — i.e. not the return of a call into the registry or manifest — is one finding.

**How it detects.** D1: `Bun.Transpiler().scan` is insufficient (no type info); use the TypeScript compiler API already present via `packages/tsc` — parse each file, walk `InterfaceDeclaration`/`TypeAliasDeclaration`, collect `members.map(m => m.name.getText()).sort().join('|')`, bucket by hash. D2: same AST walk, match `PropertyAssignment` whose name matches the artifact key set and whose initializer is an `ArrayLiteralExpression` of `ObjectLiteralExpression`s.

**Current expected failures — exactly 2, cited verbatim from the scorecard:**

1. *"MCP server-card `skills` generated — ❌ — `packages/cli/src/index.ts:206` — "kept in sync with the `$action` entries", hand-written in the scaffold"* → Rule D2, one finding. (The scaffold carries three comments about this — `index.ts:206`, `:306`, `:318` — all describing the single `skills` literal at `:207-211`. **One defect, one finding.**)
2. *"`AgentReadinessConfig` single-sourced — ❌ — mirrored in two files, both carrying "Mirror of … keep in sync": `packages/server/src/agent-readiness-config.ts:1` and `packages/plugin-agent-readiness/src/types.ts:1`"* → Rule D1, one finding. (Note the scorecard's ⚠️: the second file claims to mirror *itself*. The check must key on the **structural hash**, not on parsing the comment's claimed target — the comment is wrong and unparseable as a source of truth.)

**False-positive guards (over-detection).** Named exclusions, each with a stated reason, asserted by a must-not-flag fixture:

- `packages/primitives/**` — entirely out of the allowlist. `input/text-control.ts:22` and `form-control/hidden-input.ts:33` say "kept in sync" about **DOM/attribute reflection**, not agent surface. `checkbox/index.ts:213` and `switch/index.ts:192` "mirrors the root's state" is a CSS styling hook.
- `packages/compiler/**` — ~20 "mirrors" comments (`emit.rs:3510`, `parser/sfc.rs:406`, `wasm.rs:14`, …) are internal codegen invariants and Rust↔Rust parity notes. Out of allowlist.
- `packages/agent-server/src/opaque-id.ts:4` — *"Mirrors the compiler's `opaque_member_id`"*. **In** the allowlist and must **not** fire: it is a cross-language algorithm parity note, not a duplicated TS declaration (D1 finds no second TS declaration) and not an artifact literal (D2 finds no array). This is the sharpest guard in the check — a naive comment-grep flags it and blows the count to 3.
- `packages/seo/src/routes.ts:9` — *"Mirrors the pattern from `createAgentReadinessRoutes`"*. In allowlist, must not fire: mirrors a *pattern*, declares nothing duplicated.
- `packages/cli/src/templates-agent.ts:183` — *"(mirrors the component)"* inside a scaffold string array. Must not fire: the adjacent literal is a `registerAgentMetadata({ actions: … })` call, which is the **derivation target**, not a hand-mirrored artifact. D2 matches `skills`/`tools` keys in *config* position only.
- `dist/**`, `**/tests/**`, `**/*.test.ts`, `packages/_moved/**` — excluded globally.

**Bidirectional proof.** Fixtures under `scripts/fixtures/check-derived/`: `should-flag/` containing one synthetic duplicated `AgentSkill` interface across two package dirs and one synthetic `skills: [{id:'x'}]` vite config; `should-not-flag/` containing the `opaque-id.ts` comment shape and a primitives-style "kept in sync" DOM comment. The script runs both fixture trees in self-test mode (`--self-test`) and fails if `should-flag` yields ≠2 or `should-not-flag` yields ≠0. **The self-test runs before the real scan on every invocation.**

---

## 2. `check:governed`

| | |
|---|---|
| **Script** | `scripts/check-governed.ts` |
| **npm script** | `"check:governed": "bun scripts/check-governed.ts"` |
| **Exit contract** | `--expect 2`. Exit 0 iff exactly 2 probes report "control did not deny". Exit 1 otherwise, printing each probe's request, the envelope received, and the envelope expected. Exit 1 if any probe throws (an erroring probe is not a passing probe). |
| **Complexity** | Medium-high. Requires standing up a real `createAgentService` and a real bridge channel pair; no HTTP needed. |

**What it asserts.** Thesis §3 failure modes: *"a declared control that silently no-ops when its plugin is absent; a check that is structurally always-true."* This is **behavioral, not static** — precisely because `AC11` failed by asserting the invoker's rejection rather than the gate's. Each probe asserts the **gate's** envelope (`jsonrpcError` code), never merely that the call didn't succeed.

**Probe G1 — declared control with plugin absent must deny.** For each declared control the gate knows about (`$scope`, `$rate-limit`), construct a real `AgentService` over a binding that **declares** the control, with the corresponding plugin **omitted**, and call `handleToolCall` with a fully valid `RequestContext`. Assert a denial envelope with a specific code.

- `$scope` declared, `authPlugin` omitted → expect **401 `AUTH_MISSING`**. Passes today: `agent-service.ts:199`.
- `$rate-limit` declared, `rateLimitPlugin` omitted → expect **429** or an explicit fail-closed denial. **Fails today**: `agent-service.ts:215` — `if (rateLimitSpec !== null && rateLimitPlugin)`. The plugin's absence makes the whole branch unreachable; the call dispatches and returns the action's result.

That G1 reports scope PASS and rate-limit FAIL *from the same probe harness* is the check's own proof of discrimination. If both pass or both fail, the harness is broken.

**Probe G2 — bridge handshake must be verified.** Drive a real `BridgeChannel` pair against `createAgentServer`. Three sub-probes, one finding if **any** fails to reject:
- send `invoke` having sent no `hello` at all → expect rejection;
- send `hello` with `protocol: BRIDGE_PROTOCOL_VERSION + 1` → expect rejection;
- send `hello` with `protocol: 'not-a-number'` → expect rejection.

**Fails today** — one finding. Grepping the whole tree, `BRIDGE_PROTOCOL_VERSION` appears at `types.ts:74` (definition), `bridge-client.ts:18,67` (import + send), `agent-server.ts:35,302` (import + re-export). **It is never on the right-hand side of a comparison anywhere.**

**Current expected failures — exactly 2**, per the scorecard rows for rate-limit fail-open and the unverified handshake.

**False-positive guards.**
- G1 must **not** flag a control that is simply *not declared*. Probe matrix includes an undeclared-`$rate-limit`/absent-plugin cell that must dispatch normally.
- G1 must **not** count the invoker's own "unknown action" rejection as a gate denial. Probes use an action that **is** advertised in `registerAgentMetadata`, so the 404 branch cannot fire. This is the explicit anti-`AC11` guard: assert the code, `401`/`429`, not merely `ok === false`.
- G1 must not flag the LiveBinding-without-metadata path (`agent-service.ts:168`) — a documented, separately-tracked gap.
- G2 must **not** require a handshake on the no-bridge path (`agent-server.ts:279`, headless/CI dispatch). Only channel-attached dispatch is probed.

**Bidirectional proof.** The scope cell of G1 is the built-in must-not-flag case. For G2, a mutation self-test: the fixture bridge server injects a version check when `--self-test` is set, and all three sub-probes must flip to reject.

---

## 3. `check:attributed`

| | |
|---|---|
| **Script** | `scripts/check-attributed.ts` |
| **npm script** | `"check:attributed": "bun scripts/check-attributed.ts"` |
| **Exit contract** | `--expect 2`. Exit 0 iff exactly 2 of 3 transports fail. Exit 1 if the discovered transport count ≠ 3 — **a transport added without being registered here must break the build**. |
| **Complexity** | Low-medium. Pure AST, no runtime. |

**What it asserts.** Thesis §4: *"Tier 0 is co-equal… A transport that cannot express 'who is asking' has failed the thesis even if it never transacts."*

**How it detects.** AST over `packages/agent-{server,a2a,acp}/src/**/*.ts` plus any future `packages/agent-*/src` matching the transport-package predicate. Find `CallExpression`s whose callee resolves to `.handleToolCall`. For each:
- **arity < 3** → finding;
- **arity ≥ 3 but the third argument is a literal `null`/`undefined`** → finding;
- **arity ≥ 3 and the third argument is an identifier/member expression typed `RequestContext | undefined`** → pass.

Grep alone is insufficient — `handleToolCall` appears 22 times in `packages/*/src`, of which **19 are comments, type declarations, or JSDoc**. Only 3 are calls.

**Current expected failures — exactly 2 of 3:**

| Transport | Site | Verdict |
|---|---|---|
| `agent-server` | `agent-server.ts:279` — `handleToolCall(toolName, params, ctx)` | **PASS** |
| `agent-a2a` | `a2a-adapter.ts:59` — two args, no ctx | **FAIL** |
| `agent-acp` | `acp-adapter.ts:57` — two args, no ctx, params hardcoded null | **FAIL** |

The one required PASS is the anti-vacuity guard: a rule flagging all three is indistinguishable from a rule flagging everything.

**False-positive guards.**
- `agent-service.ts:295` — `this.handleToolCall(…, ctx)` inside `asMiddleware`. Not a transport boundary; `agent-service` is excluded from the transport set (it is the callee, not a caller).
- Interface signatures and the 18 JSDoc mentions — excluded by requiring a `CallExpression` node.
- Tests and `dist/**` excluded. `mcp-server.ts:73` is a comment only.
- **The a2a/acp sites each carry a comment claiming *"v1: … ANONYMOUS-ONLY … so scoped/$rate-limited tools fail closed (401) through this path."* The check must ignore it entirely.** It is a claim, not a fact, and the thesis rejects it explicitly (§4: the failure stands *"regardless of whether they transact"*). A check honoring an in-source waiver comment would be exactly the vacuous pattern this slice exists to eliminate. **No suppression comments are supported by any of these five checks.**

---

## 4. `check:dual-audience`

| | |
|---|---|
| **Script** | `scripts/check-dual-audience.ts` |
| **npm script** | `"check:dual-audience": "bun scripts/check-dual-audience.ts"` |
| **Exit contract** | `--expect 3`. Exit 0 iff all 3 sub-checks fail. |
| **Complexity** | Medium. DA-c needs a real SSR render; no browser. |

**DA-a — a markdown representation can be produced.** Scan all non-test, non-`dist` source for a value structurally assignable to `MarkdownResolver` (object or class with `resolve(path: string): Promise<string | null>`) **exported from a package's public entry**. Zero found → finding. *Currently fails*: 9 hits total — 2 `dist/*.d.ts` re-exports, 1 `src/index.ts` type re-export, 2 declaration/field, **4 inline mocks in tests**.

**DA-b — negotiation reaches non-`Accept` clients.** Behavioral: build the middleware from `createContentNegotiationHandler`, issue a request with **no `Accept` header** and `User-Agent: GPTBot`, assert `Content-Type: text/markdown`. *Currently fails* — `content-negotiation.ts` reads `Accept` and nothing else.

**DA-c — primary content retrievable without JS.** Behavioral: drive `createServerRouter(routes).handle(req)` against a fixture route rendering known text inside a shadow-DOM-bearing element. Assert (1) the text appears outside any `<template shadowrootmode>` boundary, (2) the body carries `data-aihu-path` markers. *Currently fails* — `router/src/server.ts:41` calls `renderToString(component)` with no options, and `ssr.ts` gates every marker on `opts?.hydratable ?? false`. One finding covering both assertions — one defect (the missing options object); splitting inflates the count past 3.

**False-positive guards.**
- DA-a must **not** count test mocks or `dist/*.d.ts`. Exclude `**/tests/**`, `**/*.test.ts`, `**/dist/**`; require a **value** declaration, never a type. Direct counter to *"the test supplies the thing that does not exist."*
- DA-a must not count a resolver constructed inside the check itself — import only from package public entries.
- DA-b must **not** demand markdown for a normal browser UA — that breaks the human axis, a thesis violation in the opposite direction. Probe matrix includes a browser-UA cell returning HTML.
- DA-c must **not** be satisfied by `packages/app/src/prerender.ts:283,382` (the SSG path). Targets the production router specifically.
- DA-c must not assert exact markup strings — the explicit anti-`hydrate.test.ts` guard. Assert presence of markers and reachability of text, never a hand-written HTML blob.

---

## 5. `check:agent-conformance` — the OOB bar

| | |
|---|---|
| **Script** | `scripts/check-agent-conformance.ts` |
| **npm script** | `"check:agent-conformance": "bun scripts/check-agent-conformance.ts"` |
| **Exit contract** | `--expect <N>` from the committed baseline, **grouped per-target**. Exit 0 iff the failing-assertion multiset equals the baseline exactly. Exit 1 if zero apps generated, zero examples discovered, or any build/serve step errored. |
| **Complexity** | **High.** The largest item in the slice; budget as its own multi-round sub-slice. |

**Harness:**

1. `aihu create <name> --yes` into a temp dir. Non-interactive path already supported: `create.ts:171` — `hasFlag('yes') || argv.includes('-y') || !process.stdin.isTTY`, defaulting `template=minimal, css=none, git=on`. **No file in the generated tree may be edited by the harness** — assert by hashing the tree post-generate and post-build, allowing only build-output paths to differ.
2. `bun run build` in the generated dir.
3. Serve the built output over real HTTP on an ephemeral port.
4. Run the checklist against the **served app over HTTP** — every assertion is an HTTP response, never a module import.
5. Repeat across `examples/`. Discovery is filesystem-driven (any `examples/*/package.json` with a `build` script, minus `archived/` and `_shared/`), **not** a hardcoded list — unlike `plan-a.yml`'s `examples` job, which enumerates five directories and would silently stop covering anything added later.
6. Fail on any gap.

### The stale-artifact trap

`check-emit-parses.ts:36-60` documents this exact failure — it *"initially resolved a STALE `target/release` binary and reported 24 phantom failures."* Its fix: collect candidates and `reduce` by `statSync(c).mtimeMs`, deliberately rejecting the Vite plugin's fixed precedence. *"A checker that reads a stale artifact is worse than no checker."*

Three exposure points, each needing the same discipline:

- **The compiler binary** — reuse `resolveCompiler()` verbatim via the shared lib.
- **The `aihu` CLI itself** — must resolve to the *workspace* CLI, never a global `aihu` or stale `packages/cli/dist`. Newest-mtime among `packages/cli/dist/bin.js` and `packages/cli/src/bin.ts`; if `dist` is older than any file in `src`, **rebuild or hard-fail**.
- **The generated app's `node_modules`** — must link workspace packages, not published versions. A run resolving `@aihu/plugin-agent-readiness@latest` from the registry measures someone else's build. Assert every `@aihu/*` resolution points inside the workspace; hard-fail otherwise.

### Checklist — agent half

| Assertion | Spec basis | Today |
|---|---|---|
| `/.well-known/agent-card.json` served, valid A2A card | §6.2 — renamed in A2A v0.3.0, breaking; spec now v1.0.1 | ❌ `vite-plugin.ts:211,230` serve the deprecated `agent.json` |
| No SEP-1649 conformance claim in served output or card metadata | §6.1 — SEP-1649 CLOSED; SEP-2127 off Standards Track | ❌ |
| OAuth well-knowns: `/.well-known/oauth-protected-resource` 200s **or** the card doesn't advertise it | §6.1 — advertised at `mcp-server-card.ts:84-85`, nothing serves either | ❌ |
| MCP tools in the served card match the compiler-emitted registry exactly (set equality on ids) | Thesis §2 | ❌ hand-written `skills`; `endpoint` is a placeholder |
| `robots.txt` served and RFC 9309-parseable | — | ✅ expected |
| If `Agentmap:` advertises an ARD catalog, `/.well-known/ai-catalog.json` 200s | §6.4 — **advertise-or-serve only; do not require emission** | vacuously ✅ |
| `llms-full.txt`, if served, not described as spec compliance | §6.3 — a Mintlify invention | assert-only |

### Checklist — SEO half

| Assertion | Spec basis | Today |
|---|---|---|
| Server-rendered `<head>`: title, description, canonical, `og:*` — in the **raw HTTP body**, no JS | §1.2 | ❌ |
| Primary content in the raw body, outside any shadow boundary | §1.2, §1.3 | ❌ |
| JSON-LD in `<head>` or light DOM, never a shadow root | §1.7 | ❌ |
| `sitemap.xml` served; every `<lastmod>` derives from real content mtime | §3.1 | ❌ no sitemap |
| `<lastmod>` never build-date stamped | §3.1 — Google discounts site-wide | see rule |
| `<priority>`/`<changefreq>` absent or ignored-by-design | §3.1 | assert-only |

**The `lastmod` rule, precisely.** Record `buildStart`/`buildEnd` wall-clock. A sitemap with **no** `<lastmod>` passes (§3.1 permits omission). A sitemap **with** `<lastmod>` fails if any value falls inside `[buildStart − 60s, buildEnd + 60s]`, or if **all** values are identical across ≥2 URLs while no two source files share an mtime. Minute-granularity windowing so a file genuinely edited today still passes.

### Rules, enforced structurally

- **No mocks.** No `MarkdownResolver`, no fixture card, no stub registry. Enforced by an import-allowlist lint on the harness itself: `node:*`, `bun`, and nothing from `packages/*/tests/**`.
- **No hand-wired routers.** Zero `defineRoute` calls in the harness — enforced by grepping the harness source and hard-failing. Direct counter to `isitagentready.test.ts`.
- **HTTP only.** No assertion may reach into the generated app's module graph.

**Baseline.** The plan gives no exact number here. **Builder must measure it in round 1 and commit the observed count before wiring the gate** — measured, never predicted. Predicting it is how a check gets tuned to its prediction. Architect's estimate is ≥7 failing assertions on the generated app; that figure **must not** be written into `--expect`.

**False-positive guards.**
- An example without `agentReadiness` in its vite config is scored on the SEO half only. An example must **not** be able to opt out of the SEO half — that applies to any served HTML.
- `examples/archived/**`, `examples/_shared/**` excluded.
- Must not flag a missing ARD catalog (§6.4 — v0.9, one month old).
- Must not flag missing `Content-Usage:` (§6.5 — `attach-04` EXPIRED), RSL (no known payer), or `agents.json` (dormant). Requiring these would violate the thesis's *"emitting into a void"* exclusion.
- Must not flag a `Sitemap:` entry that 200s but is empty for a single-page app.
- Build warnings are not failures. Only HTTP-observable gaps count.

---

## Shared utilities

`scripts/lib/invariant.ts` — extracted so the five checks cannot drift, which would itself be a `check:derived` violation:

- **`resolveNewest(candidates)`** — newest-mtime resolution from `check-emit-parses.ts:44-60`, extracted verbatim and re-exported there. Refactor with no behavior change; the one place the stale-artifact fix lives.
- **`expectCount(findings, expected, name)`** — the exit contract. Prints every finding as `file:line  [rule-id]  message`, then the count, then exits 0 iff equal. On mismatch prints the delta **with direction**: *"expected 2, found 1 — a defect was fixed; decrement the baseline in the same PR"* vs *"expected 2, found 3 — new violation."* The message matters: a Builder who sees only "FAIL" will try to make the check pass.
- **`refuseVacuous(items, name)`** — the empty-input guard, generalized. Zero inputs is always exit 1.
- **`agentSurfaceRoots()`** — the single allowlist consumed by `check:derived` and `check:attributed`, so the two cannot disagree about what "agent surface" means.
- **`selfTest(fixtureDir, shouldFlag, shouldNotFlag)`** — the bidirectional harness, run before every real scan.
- **`docs/plans/slice-0-invariants/baselines.json`** — committed expected counts, one entry per check, each with a `reason` citing its scorecard row and a `blockedBy` slice id. A baseline decrement without a source fix is visible in review as a one-line diff with no accompanying change.

**Conventions inherited from `check-emit-parses.ts`:** `#!/usr/bin/env bun`; a header stating what gap the script closes and naming the specific bugs it caught; `import.meta.dir` + `join(ROOT, …)`; `Bun.Glob` for discovery; findings batched, never fail-fast; `console.error` for findings, `console.log` for the success line; explicit CI-wiring status in the header.

---

## CI wiring order

All five fail today. That is the point, and the `--expect` ratchet lets them **all gate immediately** rather than sitting outside CI — the failure mode `check:emit-parses` is in right now (*"NOT yet wired into CI: 16 fixtures still fail"*). An invariant parked outside CI protects nothing.

**Phase 1 — land with the slice.** Add to `plan-a.yml`'s `check` job, after `bun run typecheck`, before `bun run test`:

```
- run: bun run check:derived
- run: bun run check:attributed
- run: bun run check:governed
- run: bun run check:dual-audience
```

Each reads `--expect` from `baselines.json`. Green on day one *because the counts match*; red the moment a count moves either way. Add a `changes` filter so doc-only PRs stay cheap.

**Phase 2 — `check:agent-conformance` as its own job.** Generates, installs, builds, serves — minutes not seconds. Model on the existing `examples` job: `needs: [check]`, same Rust-cache + stage-compiler-binary preamble, `SCRIBE_SKIP_POSTINSTALL: "1"`. Add to `ci-ok`'s `needs`. **Wire only after its baseline is measured on a real run and committed.**

**Phase 3 — the ratchet.** Each fix PR decrements its own baseline in the same commit:

| Baseline moves | Slice |
|---|---|
| `derived: 2 → 1` | DE1 (skills from registry) |
| `derived: 1 → 0` | DE2 (single-source config) |
| `governed: 2 → 1` | GO1 (rate-limit fail closed) |
| `governed: 1 → 0` | GO2 (bridge handshake) |
| `attributed: 2 → 0` | AT1 (both transports, one PR) |
| `dual-audience: 3 → 2` | DA1 (MarkdownResolver) |
| `dual-audience: 2 → 1` | DA2 (UA negotiation) |
| `dual-audience: 1 → 0` | DA3 (after CO5 — path keys must agree first) |
| `agent-conformance: N → 0` | last; DE1 + DE3 + DA1-3 all feed it |

**Phase 4 — done.** Every baseline at 0 → remove `--expect`, switch to zero-tolerance.

Slice 0 *"informs every track, blocks none"* — a red baseline never blocks an unrelated PR, because the ratchet only fires on movement.

---

## Open questions

1. **`check:agent-conformance` baseline is unspecified.** Builder measures in round 1, commits the observed count with a per-assertion breakdown, does **not** wire the gate until it exists. Flagged because a Builder under count-pressure may back-fill a predicted number.
2. **Does `check:derived` group by defect or by comment?** The scaffold carries three comments for one literal; the scorecard says 2 total, so grouping must be by defect. A per-comment rule yields 4, not 2.
3. **Is `agent-server/src/opaque-id.ts:4` a finding?** It is a genuine cross-language sync seam in agent-surface code, and thesis §2 says a "kept in sync with…" comment is a defect report. But counting it makes `check:derived` 3, contradicting the scorecard. Specified as must-not-flag — if the answer is "yes, it counts," the scorecard row needs amending, which is above this slice's authority.
4. **Are the four existing `tests/compliance/` suites deleted or rewritten, and by whom?** Definition of done requires it but no track owns it. They live at `packages/plugin-agent-readiness/tests/compliance/` and `packages/server/tests/compliance/`, not a top-level path as the plan's prose implies. Recommend Slice 0 **deletes** `isitagentready.test.ts` and `mcp-server-card-schema.test.ts` once `check:agent-conformance` covers their ground — a green vacuous suite beside a red honest one actively misleads.
5. **Does DA-c belong to the router or also `@aihu/app`'s prerender path?** `prerender.ts:283,382` also calls `renderToString` without `hydratable`. Specified router-only per the scorecard citation. If prerender is in scope, `dual-audience` is 4, not 3.
6. **Filesystem-driven `examples/` discovery vs `plan-a.yml`'s hardcoded five.** The existing job builds only five of 22 example dirs, noting others are WIP. Auto-discovery surfaces known-WIP examples as conformance failures. Recommend a `conformance: false` opt-out in the example's own `package.json` (data, reviewable) rather than a list in the script — but this changes the baseline either way and needs deciding before the number is committed.
