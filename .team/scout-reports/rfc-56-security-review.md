# RFC #56 Security Review — Live-Binding Architecture

**Spec:** `docs/superpowers/specs/2026-05-05-spec-live-binding.md` (v0.1.0-draft)
**Reviewer:** Scout (read-only audit role)
**Date:** 2026-05-06
**Verdict:** PARTIAL

---

## §1 Spec Sections Audited

- **§6 Security Model** (primary) — six subsections covering authentication, scope enforcement, rate-limit enforcement, instance isolation, action sanitization, and registry write access.
- **§9 Acceptance Criteria** — security review gate (a)–(d) and six integration test scenarios that verify §6 has testable gates.
- **§5 Dispatch Algorithm** — pseudocode where the runtime trust boundary is exercised; all scope/rate-limit/action checks execute here.
- **§3 Compiler Emission** — the `__agentBinding` export shape and the server-artifact-only elision rule; load-bearing for the security model per §6 preamble.
- **§8 Open Questions** — residual risk surface: multi-instance dispatch (§8.1), SSR headless mount (§8.2), error-format consistency (§8.3).

Supporting documents also reviewed (read-only):
- `docs/roadmap/arch-3-plugins.md` §3 (canonical source for the spec) and §7 Risk Register (R3, R5, R7).
- `docs/roadmap/SUMMARY.md` §6 HIGH risk callout and dependency graph.
- `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` §5 (`@agent` block macros: `$expose`, `$expose.write`, `$action`, `$scope`, `$rate-limit`, `$describe`).

---

## §2 Threat-Model Audit

### 2.1 Cross-Frame Access

**Finding: Missing**

The spec specifies that `componentInstanceRegistry` is module-private in `packages/arbor/src/mount.ts` (§6.6), but does not address whether a document framed inside an untrusted iframe can reach the parent's module scope — or vice versa. In browser contexts (client-hydrated `LiveBinding`, §7 point 2), a same-origin iframe shares the JavaScript module graph if loaded from the same origin without a sandbox attribute. An attacker who can inject a same-origin iframe (via XSS, open-redirect, or misconfigured iframe `allow` attribute) can reach `registerLiveBinding` indirectly through `mount()` by mounting a crafted component. The spec's module-privacy claim (`componentInstanceRegistry` is module-private — §6.6) is true within a single execution context, but cross-frame access breaks that isolation boundary in browsers when the Same-Origin Policy is satisfied.

**Spec citations:** §6.6 (registry write access), §7 (client-hydrated bindings are long-lived).

**Suggested remediation:** §6 requires an explicit subsection on cross-frame trust. At minimum, the spec should mandate: (a) the `mount()` entry point validates that the executing document origin matches an allowlist before registering a client-side binding; (b) the framework documentation explicitly states that the binding mechanism carries the Same-Origin Policy assumption and sandbox attributes (`sandbox="allow-scripts allow-same-origin"`) must NOT be applied together on aihu-hosted content iframes.

**CWE/OWASP:** CWE-346 (Origin Validation Error), OWASP API4:2023 (Unrestricted Resource Consumption via confused deputy).

---

### 2.2 Trust Boundary on Agent Dispatch — PEP/PDP Split

**Finding: Partially Addressed**

The spec is clear that the Policy Enforcement Point (PEP) is `handleToolCall` in `agent-service.ts` and that the Policy Decision Point (PDP) is `@aihu/auth`'s `checkScope` function injected as a constructor dependency (§5 pseudocode, §6.1, §6.2). The layer ordering is correct: middleware runs before `handleToolCall` is reached (§6.1), and `checkScope`/`checkRateLimit` execute at steps 3 and 4 before any action dispatch (§5 invariant).

However, two gaps exist:

**Gap A — `requestContext` population is out-of-spec.** The spec states "requires `@aihu/auth` before-handler to have populated `requestContext`" as a comment in the pseudocode (§5, step 3). If `@aihu/auth` is not registered (optional plugin, Plugin Contract Spec §6.5.3), nothing in the spec mandates a fallback that fails closed. The pseudocode shows that if `requiredScope !== null`, the scope check runs — but if `@aihu/auth` is absent and `requestContext` is unpopulated, the behavior of `checkScope` against an empty or absent claims object is undefined by this spec. A component with `$scope authenticated` could be accessible to an unauthenticated caller if the auth plugin is absent and `checkScope` receives a null/empty context and returns a truthy value.

**Gap B — caller identity is implicit in `requestContext.userId`.** The rate-limit key is `{userId}:{tag}` (§5 step 4, §6.3). The spec does not define how `userId` is extracted from the JWT claims, what happens if `userId` is absent (anonymous caller), or whether a caller can forge `userId` by supplying a crafted JWT. Specifically: the spec delegates JWT validation entirely to `@aihu/auth` middleware (§6.1) but does not specify that `checkRateLimit` must refuse to operate on a null or anonymous `userId`. An anonymous caller might share a single rate-limit bucket with all other anonymous callers (DoS amplification) or bypass per-user rate limits entirely.

**Spec citations:** §5 (dispatch pseudocode, steps 3–4), §6.1, §6.2, §6.3, §9(b).

**Suggested remediation:** §6 must specify: (a) if `@aihu/auth` is not registered, `handleToolCall` MUST return 401 unconditionally for any component with a `$scope` declaration (fail-closed default); (b) `requestContext.userId` MUST be required and non-null for rate-limit key construction — absent `userId` results in 401, not a shared anonymous bucket.

**CWE/OWASP:** CWE-285 (Improper Authorization), CWE-306 (Missing Authentication for Critical Function), OWASP API1:2023 (Broken Object Level Authorization).

---

### 2.3 Replay / Stale-Binding

**Finding: Addressed in §6**

The spec explicitly addresses stale-binding via `dispose$()` and `onCleanup` (§2.3, §6 preamble). The cleanup pattern uses `filter(b => b.rootId !== binding.rootId)` and deletes the key when the list empties. The spec states: "After unmount, no stale binding remains in the registry" (§2.3). The §9 security gate criterion (c) mandates verifying this under concurrent mount/unmount.

One residual concern: the spec does not address concurrent race conditions at the module-level registry during simultaneous mount and unmount operations. If a server process handles concurrent SSR requests (§7), two goroutine-equivalent microtask threads could race on `componentInstanceRegistry.get(tag)` followed by `componentInstanceRegistry.set(tag, [...existing, binding])` (§2.3 `registerLiveBinding`). A TOCTOU race could result in a disposed binding remaining observable to `handleToolCall` for a brief window. This is a low-severity concern because the window is a single event-loop tick in a Node/Bun single-threaded runtime, but the spec should acknowledge this and note that it relies on JavaScript's cooperative multitasking (no true thread-level races) as a deliberate design assumption.

**Spec citations:** §2.3, §6 (stale-binding prevention narrative), §9(c).

**Suggested remediation:** Add a note to §2.3 explicitly stating the registry operations are safe under JavaScript's single-threaded cooperative execution model, and that multi-threaded server environments (e.g., Bun workers, Node.js `worker_threads`) require external synchronization or per-thread registries.

**CWE/OWASP:** CWE-362 (Race Condition), CWE-613 (Insufficient Session Expiration mapped to binding lifetime).

---

### 2.4 Timing-Channel Leaks via `$rate-limit`

**Finding: Missing**

The spec specifies that `checkRateLimit` uses a sliding-window counter keyed on `{userId}:{tag}` (§6.3). It does not specify whether the rate limiter responds with a constant-time path regardless of whether the user has any history with the targeted tag. An attacker could use timing differences in the rate-limit check to infer: (a) whether a specific `tag` is currently mounted (a mounted component with a rate-limit declaration takes a different code path than a 404 "no live instance" response); (b) approximate usage counts for another user's `{userId}:{tag}` bucket by observing when rate-limited 429s appear (information leakage about other users' activity rates).

The §5 pseudocode dispatches in order: (1) 404 if no binding found, (2) 403 if scope fails, (3) 429 if rate-limited. This ordering means a rate-limited response implicitly confirms that the target tag is mounted AND the caller has valid scope — more information disclosure than a uniform 4xx response.

**Spec citations:** §5 (steps 2, 3, 4 ordering), §6.3, §8 (no timing mention in open questions).

**Suggested remediation:** §6.3 should specify: (a) `checkRateLimit` operates in constant time regardless of whether the key has prior history; (b) the `429` response MUST NOT be reachable before scope check passes (current ordering already achieves this — but the spec should make the ordering invariant explicit as a security property, not just an implementation detail); (c) the rate-limit counter for a `{userId}:{tag}` pair MUST NOT be readable or inferrable by a third-party observer.

**CWE/OWASP:** CWE-200 (Exposure of Sensitive Information to Unauthorized Actor via timing), OWASP API4:2023 (Unrestricted Resource Consumption).

---

### 2.5 Memory Model — Registry DoS via Instance Churn

**Finding: Partially Addressed**

The spec uses a `Map<string, LiveBinding[]>` (§2.1). The dispose pattern filters the array and deletes the key when empty (§2.3). This prevents unbounded growth under normal SSR churn — each SSR request's bindings are disposed when `onCleanup` fires. The spec correctly notes that SSR bindings are ephemeral (§7).

However, the spec does not address:

**Gap A — No upper bound on concurrent registered bindings.** A client-side scenario where an attacker rapidly mounts and holds open many instances of the same component (for example, in a long-running page session that repeatedly instantiates `weather-card` via dynamic routes) can grow the `LiveBinding[]` array without bound. M2 only reads `bindings[0]`, but the array still accumulates. The dispose path removes entries on unmount, but if `onCleanup` is not triggered (e.g., a component is mounted server-side in a headless session that is never cleanly shut down — see §8.2), entries leak.

**Gap B — The headless mount pattern (§8.2) has no lifetime specification.** The spec explicitly defers the headless mount design to M3 (§8.2), but notes it's needed for long-lived server-side agent sessions. Without a lifetime bound, a long-lived server-side binding is a guaranteed ref leak — the signal closure captured by `__agentBinding.reads` and `__agentBinding.actions` (§3) keeps the entire component reactive closure alive indefinitely.

**Spec citations:** §2.1, §2.3, §7, §8.2, arch-3 R5.

**Suggested remediation:** §6 should add a subsection specifying: (a) a maximum registered binding count per tag (configurable, defaulting to a reasonable cap like 1000) with a 503 or warning on overflow; (b) a TTL-based eviction fallback for long-lived or headless bindings as a belt-and-suspenders measure alongside `onCleanup`.

**CWE/OWASP:** CWE-400 (Uncontrolled Resource Consumption), OWASP API4:2023 (Unrestricted Resource Consumption).

---

### 2.6 CSP / Iframe Sandbox Compatibility

**Finding: Missing**

The spec makes no mention of Content Security Policy compatibility. The `__agentBinding` export shape (§3) uses function closures compiled into the server artifact, which do not require `eval` or blob URLs and are therefore compatible with strict CSP (`script-src 'self'`). However, the spec does not state this explicitly.

More significantly, the binding mechanism's security property that `__agentBinding` is elided from client bundles (§3, §6) depends on the compiler split-bundle pass being correctly configured for the deployment target. The spec does not specify what happens if a client artifact is served with relaxed CSP that permits `unsafe-eval` or if the compiler's client/server artifact split is misconfigured — for example, if a developer manually overrides the build configuration and includes the server artifact in a client bundle. A relaxed-CSP environment combined with a misconfigured build that leaks `__agentBinding` into a client bundle would expose signal closures and the binding table to browser-side JavaScript.

**Spec citations:** §3 (client artifact elision), §6 preamble ("load-bearing for the security model"), §9(d).

**Suggested remediation:** §6 should add a CSP subsection explicitly stating: (a) the binding mechanism is compatible with `script-src 'self'` and does not require `unsafe-eval` or `unsafe-inline`; (b) the `__agentBinding` elision is a compiler guarantee, NOT a runtime defense — deployment processes must validate that client bundles do not reference `__agentBinding` (the §9(d) acceptance criterion covers this for the compiler test fixture, but the spec should extend this to production build validation).

**CWE/OWASP:** CWE-693 (Protection Mechanism Failure), OWASP API8:2023 (Security Misconfiguration).

---

### 2.7 Supply-Chain — Malicious Template Injecting `@expose` Block with High-Privilege Scope Claim

**Finding: Partially Addressed**

The spec relies on the compiler to construct `__agentBinding` from `$action` and `$expose` declarations in the `@agent` block (§3, §6.5). The `actions` table is described as "the sole allowlist" and "no runtime mechanism exists for external callers to inject entries" (§6.5). This is correct for the runtime layer.

However, the spec does not address the build-time supply-chain attack vector: a malicious third-party template, starter kit, or code-generation tool could emit an `.aihu` SFC that contains a crafted `@agent` block with `$scope` set to a lower-privilege scope string than the component's actual data sensitivity warrants. For example, a malicious template could emit:

```
@agent {
  $scope public            // declares itself public
  $expose secretApiKey     // but exposes high-sensitivity state
  $action exfiltrate
}
```

The compiler would faithfully emit `__agentBinding` with `scope: 'public'` and `reads: { secretApiKey: () => secretApiKey }`. The spec's only defense is the compiler validation mentioned in `@aihu/auth` build-time behavior in arch-3 §2.4 ("Build-time: Validates `$scope` declarations in `@agent` blocks against config"), but this is not referenced in the live-binding spec's §6 Security Model, and its scope is the Plugin Contract Spec, not this RFC.

The spec also does not address whether `$expose` declarations undergo any semantic validation at compile time to verify that exposed names are not classified as sensitive by any framework-level policy.

**Spec citations:** §3 (compiler emission), §6.5 (action sanitization), §9 (compiler gate), arch-3 §2.4 (`@aihu/auth` build-time validation — cited in supporting doc, not in spec §6).

**Suggested remediation:** §6 should add a subsection acknowledging the supply-chain threat and specifying: (a) `$scope` declarations are validated against `aihu.config.ts` scope definitions at build time by `@aihu/auth`'s `beforeCompile` hook — this validation is a security control, not just a DX convenience, and its absence (i.e., when `@aihu/auth` is not installed) must be flagged as a security warning in the compiler output; (b) applications exposing sensitive signals should use `$expose.write` only with explicit build-time review tooling (future work); (c) the `$describe` macro (Macro Vocabulary Spec §5.6) SHOULD be used to document the sensitivity classification of exposed signals as a human-readable audit trail.

**CWE/OWASP:** CWE-345 (Insufficient Verification of Data Authenticity), CWE-440 (Expected Behavior Violation — compiler elision is a security control but treated as a build optimization), OWASP API8:2023 (Security Misconfiguration via template injection).

---

## §3 OWASP / CWE Cross-Reference

| Threat Dimension | Verdict | Primary CWE | OWASP API Security 2023 |
|---|---|---|---|
| Cross-frame access | Missing | CWE-346 (Origin Validation Error) | API4:2023 Unrestricted Resource Consumption (confused deputy) |
| Agent dispatch trust boundary / PEP-PDP split | Partially Addressed | CWE-285 (Improper Authorization), CWE-306 (Missing Authentication for Critical Function) | API1:2023 Broken Object Level Authorization |
| Replay / stale-binding | Addressed in §6 | CWE-362 (Race Condition — residual), CWE-613 (Insufficient Session Expiration) | API2:2023 Broken Authentication (residual) |
| Timing-channel leaks via `$rate-limit` | Missing | CWE-200 (Information Exposure via Timing) | API4:2023 Unrestricted Resource Consumption |
| Memory model — registry DoS via churn | Partially Addressed | CWE-400 (Uncontrolled Resource Consumption) | API4:2023 Unrestricted Resource Consumption |
| CSP / iframe sandbox compatibility | Missing | CWE-693 (Protection Mechanism Failure) | API8:2023 Security Misconfiguration |
| Supply-chain — malicious `@expose` block | Partially Addressed | CWE-345 (Insufficient Verification of Data Authenticity), CWE-440 (Expected Behavior Violation) | API8:2023 Security Misconfiguration |

---

## §4 Verdict

**PARTIAL**

The spec correctly identifies `componentInstanceRegistry` as the primary security surface and addresses three of the seven threat dimensions adequately (stale-binding disposal, action allowlist, module-private registry write access). The dispatch ordering in §5 (scope before rate-limit before action) is structurally sound for the dimensions it covers.

However, three dimensions are **Missing** from §6 entirely (cross-frame access, timing-channel leaks, CSP/sandbox compatibility) and two are only **Partially Addressed** with material gaps (PEP/PDP split behavior when `@aihu/auth` is absent, and supply-chain validation authority). These are not edge cases — cross-frame access is a standard browser threat for any JavaScript API that has per-page state, and the fail-closed question for absent-auth-plugin is a deployment scenario the spec explicitly enables (auth is an optional plugin per Plugin Contract Spec §6.5.3).

The §9 acceptance criteria are well-scoped for the dimensions §6 covers, but they do not test any of the three missing dimensions, which means a passing test suite would not catch these gaps.

The verdict is PARTIAL rather than FAIL because the core architectural choices (server-artifact-only emission, module-private registry, scope-before-dispatch ordering) are sound and the gaps are specifiable without architectural redesign.

---

## §5 Recommended Next Action

The verdict is PARTIAL. The following specific §6 amendments are required before re-review. No implementation changes are required — all gaps are specifiable within the current architecture.

**Amendment 1 — Add §6.7 Cross-Frame Trust (addresses §2.1 gap)**

Specify: (a) the `mount()` path on the client MUST NOT register a `LiveBinding` from a component materialized inside a cross-origin iframe; (b) same-origin iframe scenarios carry the Same-Origin Policy assumption and that assumption MUST be documented; (c) framework documentation MUST warn against combining `sandbox="allow-scripts allow-same-origin"` on content iframes.

**Amendment 2 — Strengthen §6.1 with fail-closed rule when `@aihu/auth` is absent (addresses §2.2 Gap A)**

Specify: if `@aihu/auth` middleware is not registered and a `handleToolCall` invocation targets a component with a non-null `$scope` declaration, the call MUST return 401 by default. This is a fail-closed default that prevents accidentally open components when auth is misconfigured.

**Amendment 3 — Specify `requestContext.userId` cardinality in §6.3 (addresses §2.2 Gap B)**

Specify: `requestContext.userId` MUST be a non-null, non-empty string extracted from verified JWT claims. Calls where `userId` cannot be determined MUST return 401, not fall through to a shared anonymous rate-limit bucket.

**Amendment 4 — Add §6.8 Timing Properties (addresses §2.4 gap)**

Specify: (a) `checkRateLimit` MUST operate in constant time with respect to whether the key has prior history; (b) the error-code ordering in §5 (404 → 403 → 429) is a security-relevant invariant and MUST be preserved by implementations — implementations MUST NOT reorder these checks.

**Amendment 5 — Add §6.9 Registry Capacity Bounds (addresses §2.5 Gap A)**

Specify: the `LiveBinding[]` array for any single tag MUST NOT grow beyond a configurable maximum (default: 1000 entries). Exceeding the maximum MUST surface a warning log and MAY return 503. This bound prevents memory exhaustion from instance churn or headless session accumulation.

**Amendment 6 — Add §6.10 CSP Compatibility Statement (addresses §2.6 gap)**

Specify: (a) the binding mechanism is compatible with `script-src 'self'` CSP — no `unsafe-eval` or blob: URLs are required; (b) `__agentBinding` elision is a compiler guarantee, not a runtime defense — production deployments MUST validate that client bundles contain no reference to `__agentBinding` as part of the CI/CD pipeline (not just the compiler fixture test in §9(d)).

**Amendment 7 — Add §6.11 Supply-Chain / Template Trust (addresses §2.7 gap)**

Specify: (a) `$scope` declarations are a security control — `@aihu/auth` build-time validation of `$scope` strings against `aihu.config.ts` is REQUIRED for any deployment exposing `@agent` blocks; absence of `@aihu/auth` in a project with `@agent` blocks MUST produce a compiler warning flagged as security-relevant; (b) third-party templates and starter kits SHOULD be reviewed for `@agent` blocks before use, and this guidance MUST appear in the security documentation (`SECURITY.md`).

Once all seven amendments are incorporated into §6 and the §9 acceptance criteria are extended to include integration tests for Amendments 2, 3, and 5 (the testable ones), the spec is ready for re-review and ratification.
