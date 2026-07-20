# Build manifest — verified-principal (#420 / GO1a)

**Branch:** `fix/verified-principal` · **Issue:** #420 (founder-ratified 2026-07-20, option 1, strict verified-JWT)
**Commit:** `fix(agent-service): derive rate-limit keys and scopes from signature-verified principal (#420)`

The reported hole: rate-limit keys were `${userId}:${tag}` with `userId` arriving from
`request.params.arguments.context` over MCP and never cross-checked against the JWT
`sub` — a caller reset its own quota by rotating `userId`. The ratification widened the
scope to the sibling hole on the scope path: `checkScope` consulted DECODED, unverified
claims, so a forged `scope` claim passed `$scope`. Both are closed by one interface.

## 1. Interface shape chosen

Extended `AuthPlugin` in `packages/agent-service/src/types.ts` (not a sibling
interface — the gate already holds an `authPlugin`, and one plugin should not need two
registrations):

```ts
export interface VerifiedClaims {
  readonly sub?: string
  readonly scope?: string
  readonly scp?: readonly string[]
  readonly scopes?: readonly string[]
  readonly [key: string]: unknown
}

export interface AuthPlugin {
  checkScope(jwt: string, scope: string): boolean          // unchanged (required)
  verify?(jwt: string): Promise<VerifiedClaims | null>     // NEW, optional
}
```

- `verify` is **async** because the verifying primitive is `crypto.subtle` HMAC
  (`verifyJwt` in `packages/auth/src/server.ts`, now exported). The decode-only path
  (`plugin.ts`/`jwt.ts`) is documented in-source as a rejected design for gating.
- `verify` is **optional** so third-party `AuthPlugin` implementations keep
  typechecking (semver-minor). Optional does NOT mean the control is optional — see
  fail-closed below.
- **One verified-claims source for both checks.** The gate (`runGate`, agent-service)
  resolves the principal once via `verify(jwt)`; the rate-limit key is
  `${claims.sub}:${tag}`, and the scope consult (`checkScope`) runs strictly AFTER
  `verify` authenticated the same token string — a decode inside `checkScope` therefore
  reads claims whose signature has already been checked. Forging a `scope` claim now
  requires forging the signature, which `verify` rejects at step 2.
- `@aihu/auth/server` gains `createVerifiedAuthPlugin({ jwtSecret })`
  (`packages/auth/src/verified-plugin.ts`) producing a plugin whose `verify` is the real
  HMAC path (Bearer-prefix tolerated, never throws). Server-only export on purpose: the
  factory takes the raw HMAC secret, which must never reach a browser bundle. The
  browser entry (`@aihu/auth` index) is unchanged — its size row did not move.

## 2. How fail-closed works

Gate step 2 (the 401 slot; ordering 404 → 401 → 403 → 429 preserved) resolves a
verified principal for any tool that declares `$scope` OR `$rate-limit`:

| condition | refusal |
| --- | --- |
| no `authPlugin` registered | 401 `AUTH_MISSING` (Amendment 2 posture, unchanged) |
| plugin has no `verify` | 401 `AUTH_UNVERIFIABLE` — never falls back to decode-only claims or caller identity |
| no JWT presented | 401 `AUTH_REQUIRED` |
| `verify` returns `null` (forged/malformed) | 401 `AUTH_INVALID` |
| verified claims carry no usable `sub` | 401 `AUTH_INVALID` |

`requestContext.userId` is retained on the type for compatibility/telemetry but is
**never** a policy input; its doc (formerly the false claim at `types.ts:54`,
"The verified user ID from JWT sub claim") now states exactly that. Un-scoped,
un-rate-limited tools still require nothing (a2a/acp anonymous back-compat, tested).

**401 actionability:** `AgentServiceOptions.authDiscoveryUrl` (forwarded from
`AgentServerOptions`) is included as `authDiscoveryUrl` in every 401 envelope, and the
MCP error text appends `(auth discovery: <url>)`. It is informational only, never a
policy input, and is absent when unconfigured (and never on 403 — a scope denial is not
a credential problem).

## 3. Async ripple extent

`crypto.subtle` forces the gate async. The ripple is bounded to one function:
`runGate` became `async` and its two existing callers — `handleToolCall` and
`authorize` — were **already** `async` and now `await` it. `asMiddleware`,
agent-server's `callTool`, and every adapter already awaited those. No public signature
changed shape; no sync caller existed. Verification COMPLETES before the scope consult
(step 3) and the rate-limit consult (step 4) — pinned by the ordering test below.

## 4. Transport hardening (`agent-server/src/mcp-server.ts`)

`CallTool` used to pass `request.params.arguments.context` (including `userId`) to the
gate as if authoritative. New `credentialOnlyContext()` reduces caller args to the only
forwardable part: `{ userId: null, jwt }` when a non-empty string `jwt` is present,
`undefined` otherwise. A credential is legitimately caller-presented (the gate
verifies it); an identity claim is not. Belt-and-braces: the gate ignores caller
`userId` anyway — this keeps the spoofed value from even crossing the boundary. All
transports are covered regardless, because the verified check lives inside `runGate`.

## 5. Invariant probe (G3 in `scripts/check-governed.ts`)

Behavioral, matching the file's stated design (the issue allowed a static check; a
behavioral probe measures what the gate DOES, not what its source mentions). `runG3`
stands up a real `AgentService` with a verify-capable plugin and a key-recording
rate-limit plugin, then replays the attack:

1. one credential, two rotated `context.userId` values → both consulted keys must equal
   `verified-sub:tag`, and no rotated identity may appear in any key;
2. an unverifiable credential → 401 with the limiter never consulted.

Self-test regression (real code path, no shim): the regressed plugin's `verify` ECHOES
the caller-supplied identity as `sub`, making the caller control the bucket —
observationally the pre-#420 `${userId}:${tag}` derivation — and the probe must flag it
(should-flag case, expected 1). G1's rate-limit cells were given a verify-capable
authPlugin + JWT context so they still measure the RATE-LIMIT control (429) rather than
the new, earlier 401 — preserving the distinct-codes discrimination proof
($scope 401 vs $rate-limit 429).

**Pre-fix FAIL proof (measured):** with `git stash push -u -- packages/` (new probe kept,
pre-fix sources restored), `bun run check:governed` exits **1**:

```
check:governed — SELF-TEST FAILED. ...
  should-not-flag: verified-principal rate-limit keys (live tree, #420 landed):
    expected 0 finding(s), got 1
PRE-FIX check:governed exit code: 1
```

After `git stash pop`: self-test ok (6 cases, both directions), 4 G1 cells + 4 G2
sub-probes + 1 G3 probe, **0 findings**, baseline 0 — the probe demonstrably
discriminates on exactly this defect.

## 6. Per-test mapping (ratified test plan → named tests)

| Ratified requirement | Test |
| --- | --- |
| Same JWT, rotated caller userId → same bucket, caller context ignored | `verified-principal.test.ts` › "same JWT with two rotated userId values lands in the SAME bucket, keyed by sub" |
| Unverifiable JWT → 401 | `verified-principal.test.ts` › "an unverifiable JWT on a rate-limited tool → 401, and the limiter is never consulted" |
| Forged-signature JWT rejected on the rate-limit path | `verified-principal.test.ts` › "rate-limit path: token signed with the wrong secret → 401, no bucket consumed" |
| Forged-signature JWT rejected on the scope path | `verified-principal.test.ts` › "scope path: forged token carrying the required scope claim → 401, not 200" (+ positive control: genuine token passes) |
| Malformed JWT → verify null → 401, never falls through to caller claims | `verified-principal.test.ts` › "malformed JWT never falls through" (3 malformed shapes; limiter untouched, action never ran) |
| Async gate ordering: verification completes before limit/scope consult | `verified-principal.test.ts` › "checkRateLimit and checkScope observe a fully resolved verification" (event-order assertion) |
| Anonymous caller on rate-limited tool → 401 with discovery URL when configured | `verified-principal.test.ts` › "anonymous caller on a rate-limited tool → 401 carrying authDiscoveryUrl" (+ absent-when-unconfigured / never-on-403) |
| Pinning test INVERTED, not deleted | `live-dispatch.test.ts` › AC8 "rate-limit key uses verified-sub:tag format — caller userId is not the key" (was "rate-limit key uses userId:tag format") |
| Fail-closed on a plugin that cannot verify | `live-dispatch.test.ts` › AC9 "returns 401 when the plugin cannot verify signatures (fail-closed)"; `agent-server.test.ts` › "401 (fail-closed) when the auth plugin cannot signature-verify (#420)" |
| MCP boundary drops caller identity | `agent-server.test.ts` › "rotating context.userId over MCP does not rotate the rate-limit bucket", "context carrying only a userId (no jwt) is dropped entirely → 401", "a 401 over MCP carries the configured auth-discovery URL" |
| Real-crypto plugin factory | `packages/auth/tests/verified-plugin.test.ts` (genuine/forged/tampered/malformed/Bearer/agrees-with-`verifyJwt`) |

Attack tests use REAL HMAC-SHA-256 (Web Crypto) signing/verification in-test — "forged"
means a cryptographically wrong signature, not a stub's opinion.

## 7. Measured results (2026-07-20, this worktree, after fast-forward to origin/main 774b38cf)

- **Tests:** `bunx vitest run packages/agent-service packages/agent-server packages/auth`
  → **185 passed, 0 failed, 2 skipped** (187 total; 10 files passed, 1 skipped —
  the 2 skips are pre-existing `headless-compiled-dispatch` fixtures gated on a
  compiled artifact).
- **Invariants:** all five thesis invariants **0 findings** at baseline 0 —
  `check:derived`, `check:attributed`, `check:governed` (now 4 G1 + 4 G2 + 1 G3,
  self-test 6 cases both directions), `check:dual-audience`, `check:hydration-adoption`.
- **G3 pre-fix proof:** exit **1** on the stashed pre-fix tree (§5), exit 0 after.
- **Typecheck:** `bun run typecheck` → exit 0 (50 moon tasks).
- **Lint:** `biome ci` on all touched packages + `scripts/check-governed.ts` → exit 0.
- **Build + size:** `bun run build` exit 0; `bun scripts/size.ts` exit 0.
  - `@aihu/agent-service` 1.45 kB gzip vs former 1400 B limit (110 B over from the
    fail-closed chain + discovery field, reduced to 87 B by message trimming). Budget
    raised 1400 B → **1600 B** (precedent: `chore(size): raise agent-a2a/agent-acp
    limits for AT1`), now **+113 B headroom**. `check:size-rows` policy holds.
  - `@aihu/auth` browser entry **unchanged**: 1.16 kB vs 1.5 KB (**+352 B headroom**) —
    the verified plugin lives in the server-only entry (`dist/server.js`, no size row
    by policy), which is also where a raw HMAC secret belongs.

## 8. Semver

- `@aihu/agent-service`, `@aihu/auth`, `@aihu/agent-server`: **minor** — optional
  interface member + new optional config/exports.
- Behavior change: refusing caller-supplied identity is breaking **for spoofing callers
  only** (and for deployments running scoped/rate-limited tools without a verifying
  plugin, which were serving the vulnerability). Documented as a security fix in the
  changeset (`.changeset/verified-principal.md`).

## 9. Surfaced, not changed

- **`mcp-server-card.ts` does NOT actually advertise `/.well-known/oauth-protected-resource`.**
  The brief said the readiness plugin "already computes it"; in reality
  `generateMcpServerCard` deliberately emits only the authorization-server issuer origin
  and documents why advertising an unserved well-known is worse than none
  (`packages/plugin-agent-readiness/src/mcp-server-card.ts:112-123`). The ratified
  fallback — a config field on the service (`authDiscoveryUrl`) — is what shipped;
  actually SERVING the RFC 9728 document remains open and is where the config value
  should ultimately point.
- **Adapters (`agent-a2a`/`agent-acp`)** still build anonymous `{ userId: null }`
  contexts via `resolveAuth`. Correct for unscoped tools; a scoped/rate-limited tool
  behind them now requires the host's `resolveAuth` to supply a `jwt`. No adapter code
  change was needed (check:attributed still 0 findings).
- **`checkScope` remains required on `AuthPlugin`.** Removing or optionalizing it would
  be breaking; it now runs only post-verification. A future major could fold it into a
  claims-based signature.
- **Rust/compiler untouched** (TS-only lane, as briefed). No binary bump.
- **G1 finding line refs** in `check-governed.ts` (`agent-service.ts:215`) predate this
  change and drift with edits; left as-is since findings are currently zero.
