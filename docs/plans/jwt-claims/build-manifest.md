# Build manifest — jwt-claims validation + fail-closed rate limiter

**Branch:** `fix/jwt-claims-validation`
**Commit:** `fix(auth): enforce JWT exp/nbf/aud in verify; rate limiter fails closed at capacity`

Two defects in the shipped verified-principal path (#420):

1. `verifyJwt` (`packages/auth/src/server.ts`) checked the HMAC signature only —
   `exp` / `nbf` / `aud` were never validated, so a signed token stayed valid
   forever, despite the docstring implying expiry handling.
2. `createRateLimiter` (`packages/scraping/src/rate-limiter.ts`) allowed a call
   whenever its key map hit `maxKeys` capacity — a governed control failing OPEN.

## 1. What `verifyJwt` now validates (in order)

1. **Signature** — HMAC-SHA-256 via `crypto.subtle.verify` (unchanged, #420).
2. **`exp`** — rejected once `now >= exp + leeway`. A token **without** `exp`
   is rejected by default; a present-but-non-numeric `exp` is always rejected
   (malformed, not "no expiry").
3. **`nbf`** — rejected while `now < nbf - leeway`.
4. **`iat` sanity** — a numeric `iat` more than `leeway` in the future is
   rejected (the issuer's clock, or the claim, cannot be trusted). Non-numeric
   `iat` is ignored: it is informational, not a validity bound.
5. **`aud`** — enforced only when an expected audience is configured; the
   token's `aud` (string or array, RFC 7519 §4.1.3) must include it. When no
   audience is configured, `aud` is not checked — existing callers keep working.

Every failure returns `null`; the agent-service gate already maps a `null`
`verify` result to 401 `AUTH_INVALID` (fail-closed, `agent-service.ts`
`runGate` step 2) — verified by the gate-integration tests below. The
`verifyJwt` and `createVerifiedAuthPlugin` docstrings now state exactly what is
validated.

## 2. Config surface (all optional; defaults are the fail-closed posture)

`VerifyJwtOptions` (`packages/auth/src/server.ts`, exported from
`@aihu/auth/server`), inherited by `VerifiedAuthPluginOptions`
(`extends VerifyJwtOptions`) and mirrored on `AuthConfig` (which structurally
satisfies `VerifyJwtOptions`, so `getAuthState` passes its config straight
through):

| option | default | justification |
| --- | --- | --- |
| `allowNoExpiry?: boolean` | `false` | A token without `exp` never stops being replayable — not acceptable for a verified principal. Opt-in exists only for machine credentials with an external revocation story. |
| `audience?: string` | unset (aud not checked) | Enforcing an audience nobody configured would break every existing caller; the config path now exists for services that scope tokens to themselves. |
| `clockSkewSec?: number` | `60` | The common ceiling used by OIDC client libraries: absorbs the drift of an un-NTP-synced host (seconds to tens of seconds) while staying negligible against real token lifetimes, so it does not meaningfully extend the replay window. |
| `now?: () => number` | `Date.now` | The codebase's existing testable-clock pattern (`createRateLimiter` uses the same shape); temporal tests pin the clock, no wall-clock flakiness. |

## 3. Rate limiter fail direction flipped to CLOSED

`createRateLimiter.checkRateLimit` now **denies** any call it cannot
positively account for:

- a NEW key when the map is at `maxKeys` capacity (previously allowed as a
  "safety valve" — memory pressure became an unlimited bypass for every new
  key);
- any internal error (e.g. invalid rateSpec) — caught, warned, denied.

Under-limit behavior for tracked keys is unchanged (regression-tested),
including in-place window resets and the O(1) invariant.

**Follow-up (out of scope here):** the store is PER-PROCESS (in-memory `Map`).
A multi-instance deployment multiplies the effective quota by instance count;
distributed accounting is a separate, larger concern and is noted in the
factory docstring.

## 4. Per-test mapping

All temporal tests inject the pinned clock via `now`.

| Claim | Test |
| --- | --- |
| Expired token → `verify` null → gate 401 `AUTH_INVALID` | `jwt-claims.test.ts` › "rejects an expired token (exp in the past, beyond the 60s default leeway)" + "expired token → verify null → gate 401 AUTH_INVALID, action never runs" |
| Within clock-skew leeway of expiry → still accepted | `jwt-claims.test.ts` › "accepts a token within the clock-skew leeway of expiry" (+ counter-proof: same token rejected at `clockSkewSec: 0`) |
| `nbf` future → rejected; past → accepted; within leeway → accepted | `jwt-claims.test.ts` › the three "nbf validation" tests |
| No `exp` → rejected by default; accepted only with `allowNoExpiry: true` | `jwt-claims.test.ts` › "rejects a token with NO exp by default" / "accepts a token with NO exp only when allowNoExpiry: true" (+ plugin pass-through variant; non-numeric `exp` always rejected) |
| `aud` mismatch → rejected; match (string + array) → accepted; unconfigured → ignored | `jwt-claims.test.ts` › the six "aud validation" tests |
| Future-`iat` sanity (documented addition) | `jwt-claims.test.ts` › "rejects a wildly future iat" / "accepts a normal past iat" |
| Signature-invalid still rejected (#420 regression) | `jwt-claims.test.ts` › "rejects a wrong-secret token even when every claim is temporally valid"; full pre-existing suites `verified-plugin.test.ts`, `verified-principal.test.ts` unchanged and green |
| Positive control: fresh token still dispatches through the gate | `jwt-claims.test.ts` › "fresh token from the same signer still dispatches" |
| Rate limiter at capacity → DENIED (fail-closed) | `scraping.test.ts` › "at map capacity, a NEW (untracked) key is DENIED — fail-closed" |
| Rate limiter under-capacity → allowed (regression) | `scraping.test.ts` › "already-tracked keys keep normal under-limit accounting at capacity (regression)" + pre-existing under-limit suite |
| Rate limiter store/spec error → denied, not thrown | `scraping.test.ts` › "an internal error (invalid rateSpec) denies instead of throwing — fail-closed" |

**Fixtures:** the shared signing helpers in `packages/auth/tests/m2.test.ts`
and `packages/auth/tests/verified-plugin.test.ts` now default a fresh 1h `exp`
(overridable per test). The `agent-service` `verified-principal` fixtures and
the `agent-a2a` / `agent-acp` attribution fixtures needed **no** change — their
`verify` implementations are in-test stubs/HMAC-only fixtures that do not route
through `verifyJwt` (confirmed by green runs, not assumption).

## 5. Measured results (2026-07-20, this worktree)

- `bunx vitest run packages/auth packages/agent-service packages/agent-server packages/scraping`
  → **228 passed, 0 failed, 2 skipped** (12 files passed, 1 skipped — the 2
  skips are the pre-existing `headless-compiled-dispatch` fixtures gated on a
  compiled artifact). Includes the new `jwt-claims.test.ts` (24 tests) and 3
  new rate-limiter tests.
- `bunx vitest run packages/agent-a2a packages/agent-acp` → **46 passed, 0 failed**.
- `check:governed` → self-test ok (6 cases), 4 G1 + 4 G2 + 1 G3, **0 findings** (baseline 0).
- `check:attributed` → self-test ok (4 cases), 3 transports, **0 findings** (baseline 0).
- `bun run typecheck` → **PASS** (50 moon tasks).
- `biome ci` on all touched files → **exit 0**.

## 6. Semver

`@aihu/auth` **minor**, `@aihu/scraping` **minor** — new optional options plus
a deliberate behavior change: tokens without `exp` (previously accepted
forever) are now refused unless explicitly allowed. Documented in
`.changeset/jwt-claims-validation.md`. TS-only; no Rust/compiler change, no
binary bump.
