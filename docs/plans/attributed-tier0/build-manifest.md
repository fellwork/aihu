# AT1 — Attributed tier 0 — build manifest

**Branch:** `fix/attributed-tier0` (from `fix/agent-metadata-describe-wire` @ `ca3fd2b9`)
**Scope:** `packages/agent-a2a/`, `packages/agent-acp/` only. No file outside those two
packages was edited except the two planning docs the acceptance criteria name.

---

## The defect

Thesis §4 tier 0 requires that "the request carries an identity context at all, even if
anonymous is the answer," on "every path, always." Two of three transports did not:

| Transport | Before | After |
|---|---|---|
| `agent-server` | `handleToolCall(toolName, params, ctx)` — **passed** | unchanged (reference impl) |
| `agent-a2a` | `handleToolCall((msg as string) ?? '', body.params ?? null)` — 2 args, no ctx | `handleToolCall((msg as string) ?? '', body.params ?? null, ctx)` |
| `agent-acp` | `handleToolCall(toolName, null)` — 2 args, no ctx, params hardcoded `null` | `handleToolCall(toolName, params, ctx)` |

---

## Files changed

| File | Change |
|---|---|
| `packages/agent-a2a/src/a2a-adapter.ts` | Added `contextFor(req)`; threaded `ctx` as the 3rd arg; propagated the gate's `code` into the failed-task envelope; **deleted the 4-line ANONYMOUS-ONLY waiver comment**. |
| `packages/agent-a2a/src/types.ts` | Added `A2aAdapterOptions.resolveAuth`; re-exported `RequestContext`. |
| `packages/agent-acp/src/acp-adapter.ts` | Added `contextFor(req)`; threaded `ctx`; **read real `params` from the message instead of hardcoded `null`**; propagated the gate's envelope into an `error` part; **deleted the 4-line ANONYMOUS-ONLY waiver comment**. |
| `packages/agent-acp/src/types.ts` | Added `AcpAdapterOptions.resolveAuth`, `AcpMessage.params`; re-exported `RequestContext`. |
| `packages/agent-a2a/tests/attribution.test.ts` | **NEW** — 6 tests. |
| `packages/agent-acp/tests/attribution.test.ts` | **NEW** — 10 tests. |
| `docs/plans/slice-0-invariants/baselines.json` | `attributed.expect` **2 → 0**, reason/ratchet rewritten. |
| `docs/plans/2026-07-19-thesis-conformance.md` | Attributed scorecard **1/3 → 3/3**; evidence table, Track AT row. |

### How the context is derived

Not a second derivation — the same injection point `agent-service.asMiddleware()` already
uses (`AgentServiceOptions.resolveAuth`, `agent-service.ts:295`) and that `agent-server`
forwards verbatim (`agent-server/src/types.ts:65`):

```ts
const ANONYMOUS: RequestContext = { userId: null }

const contextFor = async (req: Request): Promise<RequestContext> => {
  if (!options?.resolveAuth) return ANONYMOUS
  try { return (await options.resolveAuth(req)) ?? ANONYMOUS } catch { return ANONYMOUS }
}
```

The fallback is an **explicit anonymous context**, not `undefined`. That is the whole point
of tier 0: the gate must have something to decide against. Fail-closed is preserved
unchanged — an anonymous context still yields 401 `AUTH_REQUIRED` on any scoped or
rate-limited binding (`runGate` step 2).

---

## Acceptance — measured

| Criterion | Target | Measured | |
|---|---|---|---|
| `bun run check:attributed` | 0 findings (from 2) | **0 findings**, 3 transports, 3 call sites, passing: `agent-server, agent-a2a, agent-acp` | ✅ |
| `baselines.json` `attributed.expect` | 2 → 0, same commit | **0**, same commit | ✅ |
| Scorecard row | 1/3 → 3/3 | **3/3** | ✅ |
| `packages/agent-a2a` tests | ≥ 14 pass, 0 fail | **20 pass, 0 fail** (14 existing + 6 new) | ✅ |
| `packages/agent-acp` tests | ≥ 19 pass, 0 fail | **29 pass, 0 fail** (19 existing + 10 new) | ✅ |
| `packages/agent-service` | 56, unchanged | **56 pass** (23 + 5 + 28), not edited | ✅ |
| `packages/agent-server` | 22, unchanged | **22 pass** (7 + 3 + 2 + 10), not edited | ✅ |

`check:attributed` before → after:

```
before: check:attributed — expected 2, found 2 — matching the committed baseline of 2.
after:  check:attributed — 3 transports, 3 `handleToolCall` call site(s).
        Passing: agent-server, agent-a2a, agent-acp.
        check:attributed — 0 finding(s), matching the committed baseline of 0. Property holds.
```

The check's own self-test still passes (4 cases, both directions). **`scripts/check-attributed.ts`
was not modified** — it was read to understand the measurement and then left alone.

### Bidirectional tests, by name

**Direction 1 — an authenticated request arrives WITH its context and is evaluated against it:**
- a2a: `denies a scoped tool with 403 SCOPE_DENIED when the authenticated caller lacks the scope`
- a2a: `ALLOWS the same scoped tool when the authenticated caller HAS the scope`
- acp: `denies a scoped tool with 403 SCOPE_DENIED when the authenticated caller lacks the scope`
- acp: `ALLOWS the same scoped tool when the authenticated caller HAS the scope`

**Direction 2 — an unauthenticated request is anonymous, not a crash:**
- both: `carries an explicit anonymous context and 401s a scoped tool (no crash)`
- both: `serves an UNSCOPED tool anonymously — anonymous is a valid answer, not an error`
- both: `with no resolveAuth configured at all, still reaches the gate as anonymous`
- both: `a THROWING resolver degrades to anonymous rather than 500ing the transport`

**ACP arguments:**
- `forwards params from parts[0].content.params to the action invoker`
- `accepts the `args` key as well`
- `accepts top-level params when the tool name came via content`
- `still dispatches with no arguments when none are supplied`

### AC11b compliance — the gate, not the invoker

Every fixture binding is **permissive**: `callAction` resolves for any name, `getSignal`
returns a value. Each denial test first asserts the binding *would* have run the call
(`await expect(binding.callAction('readSecret', [])).resolves.toEqual(...)`), so only a real
server-side gate can produce the rejection. Assertions are on the gate's **envelope code**
(401 / 403), never on "the call failed". Positive cases are asserted too — a test that only
proves denial cannot distinguish "context evaluated" from "context still missing", since
missing context also denies.

### Mutation-verified

Reverting each fix and re-running the new tests:
- a2a, `ctx` removed from the call → **2 of 6 fail** (both direction-1 tests).
- acp, reverted to `handleToolCall(toolName, null)` → **5 of 10 fail** (both direction-1 tests
  plus 3 of 4 argument tests).

The direction-2 tests pass both before and after **by design** and this is stated plainly
rather than glossed: anonymous behaviour is externally identical either way. They are
regression guards for "anonymous must not crash / must not start 500ing", not evidence of
the fix. The direction-1 and argument tests carry the proof.

---

## Existing tests updated

**None.** All 14 a2a and 19 acp tests pass unmodified. They assert `status` / `content`
fields that the fix preserves; none asserted the anonymous shape with `toEqual` on a whole
envelope, so no assertion of the old behaviour had to be rewritten. The new coverage is
additive, in separate `attribution.test.ts` files.

---

## Deviations

1. **The gate's `code` is now surfaced in both adapters' failure envelopes** — a2a adds
   `code` to the failed task object; acp adds an `{ type: 'error', content: envelope }` part.
   Rationale: the acceptance criteria require asserting the gate's 401/403, and before this
   the code was dropped at the transport boundary — the verdict the gate reached was
   *unobservable*, which is precisely the "invisible until someone audits it" failure mode
   §4 names. Both changes are strictly additive; no existing field changed shape and no
   existing test needed touching. This is not AT2 protocol work — the JSON-RPC 2.0 envelope,
   task store, and `agent-card.json` path are untouched.

2. **`AcpMessage.params` added** as a fallback source of arguments for the case where the
   tool name arrives via `msg.content` rather than a part. Part-carried
   `content.params` / `content.args` take precedence. Without it the `content`-addressed form
   of an ACP call (which the existing AC-6 test exercises) would still have had no way to
   carry arguments.

## Out of scope, confirmed untouched

Full a2a/ACP spec conformance (JSON-RPC 2.0 envelope, task store, `agent-card.json` path)
and the 542 lines of existing shim tests — all AT2. `scripts/check-attributed.ts` was not
weakened. `packages/compiler/`, `packages/agent-service/`, and `packages/agent-server/` were
not edited.

## Known unrelated failure

`packages/tsc/tests/language-plugin.test.ts` → `generates a type-check surface, not the raw
.aihu text` fails on this branch **and on the base commit with all my changes stashed**.
Pre-existing, outside my scope, not caused by this work.
