# Build manifest — Track GO (Governed), slices GO1 + GO2

Branch `fix/governed-track`, off `fix/agent-metadata-describe-wire` @ `ca3fd2b9`.
Measured 2026-07-19 on macOS (darwin arm64), bun 1.3.x / vitest 3.2.6, after a
`bun install --frozen-lockfile` and `cargo build --release -p aihu-compiler`.

Property closed: **Governed 2/4 → 4/4.** `check:governed` **2 findings → 0**.

---

## Headline numbers

| Acceptance criterion | Before | After | Verdict |
|---|---|---|---|
| `bun run check:governed` findings | 2 | **0** | ✅ |
| `baselines.json` `governed.expect` | 2 | **0** | ✅ decremented in the same commit |
| Scorecard Governed row | 2 / 4 | **4 / 4** | ✅ |
| `packages/agent-service` tests | 56 passed, 0 failed | **63 passed, 0 failed** | ✅ ≥ 56 |
| `packages/agent-server` tests | 20 passed, 2 skipped, 0 failed | **30 passed, 2 skipped, 0 failed** | ✅ see note |
| `packages/agent-a2a` | 14 passed | **14 passed** | ✅ unchanged |
| `packages/agent-acp` | 19 passed | **19 passed** | ✅ unchanged |
| Full root suite | — | **2159 passed, 1 failed, 13 skipped** | ⚠️ the 1 failure pre-exists, see below |

**Note on the agent-server baseline.** The brief specified "≥ 22 passing". Measured on the
base commit, `packages/agent-server` is **20 passing + 2 skipped = 22 total** — the 22 in
the brief counts the two skipped `headless-compiled-dispatch` tests. Flagging the
discrepancy rather than quietly reinterpreting the number. Either reading is satisfied:
30 passing now, and the same 2 remain skipped (they were skipped before this branch and are
untouched by it).

**The one full-suite failure is pre-existing and unrelated.**
`packages/css-engine/tests/resolve-binary.test.ts > accepts the real dev target/ binary`
fails because this fresh worktree has no css-engine dev binary in `target/`. Verified by
`git stash push -u` → re-run → **same failure on the untouched base commit** → `git stash
pop`. My diff touches no file in `packages/css-engine`.

---

## Files changed

| File | Slice | Change |
|---|---|---|
| `packages/agent-service/src/agent-service.ts` | GO1 | Split the Step-4 rate-limit guard so an absent plugin denies |
| `packages/agent-service/src/types.ts` | GO1 | Corrected the `rateLimitPlugin` doc, which asserted the opposite behaviour |
| `packages/agent-service/tests/live-dispatch.test.ts` | GO1 | +7 bidirectional tests |
| `packages/agent-server/src/agent-server.ts` | GO2 | Handshake state, `hello` validation, delegation gate |
| `packages/agent-server/src/types.ts` | GO2 | `bridgeHandshakeTimeoutMs` option; corrected `BRIDGE_PROTOCOL_VERSION` + `attachBridge` docs |
| `packages/agent-server/tests/agent-server.test.ts` | GO2 | +10 bidirectional tests; `makeFakeBridge.handshake()` |
| `scripts/check-governed.ts` | both | Self-test re-based (see §"Deviation") |
| `docs/plans/slice-0-invariants/baselines.json` | both | `governed.expect` 2 → 0 |
| `docs/plans/2026-07-19-thesis-conformance.md` | both | Scorecard 2/4 → 4/4; Track GO updated |

Nothing outside `packages/agent-service/`, `packages/agent-server/`, `scripts/`, and
`docs/` was touched — `packages/compiler/`, `packages/agent-a2a/`, `packages/agent-acp/`
are clean, as required by the concurrent-Builder constraint.

---

## GO1 — rate limiting fails closed

`agent-service.ts:215` read:

```ts
if (rateLimitSpec !== null && rateLimitPlugin) {
```

Declare `$rate-limit`, omit the plugin, and the entire branch is unreachable: the call
dispatches and returns the action's result, silently unlimited. This is the thesis §3
failure mode *"a declared control that silently no-ops when its plugin is absent"*, and it
sat directly beside `:199`, where `$scope` with no `authPlugin` correctly returns 401
`AUTH_MISSING`. The fix makes rate-limit match that posture:

```ts
if (rateLimitSpec !== null) {
  if (!rateLimitPlugin) return jsonrpcError(429, 'RATE_LIMIT_MISSING: …')
  …
}
```

The guard is `rateLimitSpec !== null`, **not** "always deny" — an undeclared control still
dispatches with no plugin present. 429 was chosen over 401/403 because the denial is about
quota enforceability, and because it keeps the two absent-plugin denials distinguishable
(401 for absent auth, 429 for absent rate limiting), which the invariant now asserts.

**Bidirectional tests** (`live-dispatch.test.ts`, `describe('GO1 …')`). All use a
**permissive binding** whose `callAction` succeeds for any name, per the AC11 trap: a
binding that throws lets a test pass with no server-side check at all, because the handler
maps the invoker's throw to a 404. Each denial is asserted on the **gate's envelope code**
and paired with a proof the action never ran.

Under-enforcement (must deny):
1. `$rate-limit` + no plugin → **429 `RATE_LIMIT_MISSING`**, `ran() === false`
2. `$scope` + no plugin → **401 `AUTH_MISSING`**, `ran() === false`
3. the two denials use **distinct codes** — not one blanket "declared ⇒ deny" rule

Over-enforcement (must dispatch):
4. no `$rate-limit`, no plugin → dispatches
5. no controls **and no request context at all** → dispatches (protects the a2a/acp
   back-compat path, which carries no auth context)
6. `$rate-limit` **with** a permissive plugin → dispatches (declared ≠ denied)
7. ordering invariant intact: scoped **and** rate-limited with neither plugin → **401**,
   not 429 (Step 3 precedes Step 4)

---

## GO2 — the bridge verifies the handshake it already sends

`BRIDGE_PROTOCOL_VERSION` was defined (`types.ts:74`), sent by the client
(`bridge-client.ts:18,67`), imported and re-exported by the server
(`agent-server.ts:35,302`) — and, confirmed by grepping the tree, **never once on the
right-hand side of a comparison**. `handleBridgeFrame`'s `case 'hello'` returned without
inspecting `msg.protocol`, and `attachBridge` accepted any channel. A channel that receives
`invoke` frames *is* the execution authority; it was becoming one without ever proving which
protocol it speaks.

Implemented:

- Per-channel handshake state (`pending` / `verified` / `rejected`), **reset on every
  `attachBridge`** so status is never inherited from a previous peer.
- `hello` validation is **strict**: the value must be a finite `number` equal to
  `BRIDGE_PROTOCOL_VERSION`. `'1'`, `null`, `NaN` are rejected, not coerced. The runtime
  `typeof` guard is load-bearing rather than redundant — the field is typed `number` but
  arrives as untyped JSON off a socket.
- `callTool` refuses to delegate to an unverified channel: **503 `BRIDGE_UNVERIFIED`**.
- Until verified, `hello` is the **only** frame a channel may send. Honouring
  `result`/`error`/`snapshot` from an unidentified peer would let it resolve calls and
  overwrite `serialize()` state. (Hardening beyond the three required cases; tested.)

**Ordering.** The channel check runs *after* `service.authorize`, so the agent-service
gate's 404/401/403/429 still wins and an unauthorized call is denied for its own reason
rather than masked by a transport error. It is still never forwarded. Tested.

**The no-bridge path is untouched.** `agent-server.ts`'s headless/CI branch has no channel
to verify; requiring a handshake there would break every bridge-less consumer. Explicitly
tested ("the NO-BRIDGE headless path needs no handshake at all").

**Bidirectional tests** (`agent-server.test.ts`, `describe('GO2 …')`). Every case asserts
both the **503 code** and that **no `invoke` frame reached the wire**.

Must reject: (a) invoke with no prior `hello`; (b) mismatched protocol version;
(c) non-numeric protocol; plus stringified `'1'` not coerced; plus an unverified channel
cannot overwrite `serialize()` state; plus re-attach resets verification.

Must still work: a valid `hello` **is** delegated to; a `hello` arriving *after* `callTool`
starts still verifies; the no-bridge headless path dispatches; a gate rejection still
reports **403 `SCOPE_DENIED`**, not the transport error.

### Decision: bounded wait, not an instantaneous check

`attachBridge` and the client's `hello` are inherently racy over a real socket — the demo
server attaches the channel and an agent may call a tool before the first frame crosses the
wire. An instantaneous check would turn normal startup into a spurious denial. So an
unverified channel is **waited on** for `bridgeHandshakeTimeoutMs` (default **1000ms**,
configurable) before being refused. A *mismatched* or *non-numeric* `hello` short-circuits
immediately — there is nothing left to wait for. The timer is `unref`'d so a pending
handshake never holds a process or vitest worker open.

This was validated, not assumed: `examples/agent-driven-demo/tests/real-ws-bridge.test.ts`
drives `createAgentServer` + `createBridgeClient` over a **genuine `ws` socket** and does
exactly `attachBridge(...)` → `createBridgeClient(...)` → immediate `callTool`. It **passes,
2/2** (this required building the compiler binary from source; the suite is not in the root
vitest config and does not run in a plain `vitest run`). A fail-instantly design would have
broken it.

---

## Deviation: `scripts/check-governed.ts` was edited — here is why that is not weakening it

The brief forbids weakening the check to make it green, and separately requires updating its
discrimination self-test, which asserted `$scope` denies while `$rate-limit` does not — true
only while GO1's bug was. Both were honoured. **No expectation was relaxed; the check got
strictly stronger, and its finding count is still computed the same way.**

**1. The simulation shims were removed, not the assertions.** The self-test's
should-not-flag half used to be a *shim*: a hardcoded `{ code: 429 }` for G1 and an early
`return { correct: true }` for G2, simulating a fix the tree did not yet have. It proved the
assertion logic could observe a pass; it could not prove the *server* could produce one. Now
the should-not-flag half is **the real, unmutated tree**, and the should-flag half regresses
it through **real code paths only**:

- G1 regression: inject an always-permissive `rateLimitPlugin` — observationally identical
  to the old `&& rateLimitPlugin` guard skipping the check.
- G2 regression: send a valid `hello` first. The pre-fix server delegated to every channel;
  a post-fix server delegates to a handshaken one. The regression *is* the real delegation
  path, not a stand-in for it.

The self-test still asserts **1** G1 finding and **3** G2 findings under regression — the
exact pre-fix counts.

**2. A positive control was added to G2.** New 4th sub-probe: *a channel that sends a valid
`hello` **must** be delegated to.* Without it, "refuse every channel" would score a perfect
G2 while breaking the bridge outright. G2 went from 3 sub-probes to 4.

**3. The discrimination proof was re-based onto an axis a broken gate cannot fake.** It now
requires: both declared controls **deny** with their plugin absent (catches
under-enforcement); they deny with **different codes**, 401 vs 429 (catches the two controls
collapsing into one blanket rule); and the **undeclared** control still dispatches (catches
over-enforcement). A gate that denied everything fails the third; one that allowed
everything fails the first. The old form could only ever have held while the bug did.

Live output after the fix:

```
check:governed — self-test ok (4 cases, both directions).
check:governed — discrimination ok: declared controls deny with distinct codes
                 ($scope 401, $rate-limit 429); an undeclared control still dispatches.
check:governed — ran 4 G1 cells and 4 G2 sub-probes.
check:governed — 0 finding(s), matching the committed baseline of 0. Property holds.
```

Before, on the base commit:

```
check:governed — 2 finding(s):
  agent-service.ts:215 [G1] $rate-limit declared, rateLimitPlugin absent — GATE DID NOT DENY …
  agent-server.ts:158  [G2] bridge handshake is never verified — 3/3 sub-probes were accepted …
```

---

## Surfaced decision — rate-limit keys are caller-derived (**GO1a, NOT fixed**)

**Reported as PARTIAL on this sub-item, deliberately.** The brief authorised surfacing over
half-fixing, and this is the case it anticipated.

**The defect.** The key is `` `${userId}:${tag}` ``. On the MCP path `userId` is entirely
caller-supplied — `mcp-server.ts`'s `CallToolRequestSchema` handler reads
`request.params.arguments.context` and passes it straight through as the `RequestContext`.
Nothing cross-checks it against the JWT `sub`. An agent evades its quota by rotating
`userId` between calls. GO1 makes the control impossible to *silently disable*; it does not
make the *identity* trustworthy. These are different defects and only the first was
in-scope-decidable.

**Why I did not fix it.** Both candidate fixes are product decisions:

1. **Derive the identity from the verified JWT.** `AuthPlugin` exposes only
   `checkScope(jwt, scope)` — there is no way to obtain a verified subject. This needs a new
   `subject(jwt): string | null` on the interface plus an implementation in `packages/auth`
   (outside this slice's declared scope), and it forces an unanswered question: a component
   may declare `$rate-limit` *without* `$scope`, so no JWT is expected at all. Keying on a
   verified subject would newly require a JWT for every rate-limited component — a behaviour
   change to the Amendment 3 / §6.3 `userId` rules that would break unscoped-but-rate-limited
   components reached by the a2a/acp adapters.
2. **Refuse caller-supplied context at the MCP boundary.** In-scope for `agent-server`, but
   it breaks every current caller, the CLI scaffold templates, and the existing tests — and
   the stdio MCP server has *no transport-level auth* to replace it with. That is a topology
   decision, not a patch.

**Additional evidence that the format is intentional, not accidental.** `live-dispatch.test.ts`
carries a test literally named *"rate-limit key uses userId:tag format"* asserting
`` usedKeys[0] === 'user-42:weather-card' ``. The shape is pinned by an existing test; changing
it unilaterally would be overruling a recorded decision, not fixing an oversight.

**Where the gap is now recorded** (so it cannot be lost): this manifest; a comment at the
call site in `agent-service.ts` §Step 4; `baselines.json` `governed.reason`; and the
scorecard's Track GO table as **GO1a**.

**Note for whoever picks up GO1a:** `check:governed`'s G1 probe will **not** catch a
regression here — it measures fail-closed behaviour, not key provenance. A new probe is
needed, and it should assert that two calls with *different* `userId`s and the *same*
verified credential share a quota bucket.

---

## Reproducing these numbers

```bash
bun install --frozen-lockfile
bun run check:governed                                    # 0 findings
npx vitest run packages/agent-service packages/agent-server
npx vitest run packages/agent-a2a packages/agent-acp      # unchanged
npx biome check packages/agent-service packages/agent-server scripts/check-governed.ts
npx tsc --noEmit -p packages/agent-server/tsconfig.json
npx tsc --noEmit -p packages/agent-service/tsconfig.json

# The real-ws bridge test is NOT in the root vitest config and needs the compiler:
cargo build --release -p aihu-compiler
cp target/release/aihu-compile packages/compiler/bin/aihu-compile
cd examples/agent-driven-demo && npx vitest run              # 2/2
```

Lint and both typechecks are clean.
