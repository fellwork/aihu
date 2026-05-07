# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.3.x   | :white_check_mark: |
| < 0.3   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities to the maintainers via GitHub private vulnerability disclosure.
Do not open public issues for security vulnerabilities.

---

## `$scope` and `<$guard>` — Compiler Warnings (v0.3.0)

### What this means

When you use `$scope` in an `@agent` block or `<$guard scope="...">` in a template, the compiler emits a `[SECURITY]` warning:

```
[SECURITY] <tag>: @agent $scope '<scope>' declared but @aihu/auth cannot be
verified at compile time (v0.3.0). Ensure @aihu/auth is installed and
configured before deploying to production.
```

This is an **always-warn** behavior in v0.3.0 (per Amendment 7 §6.11, option c). The warning does **not** indicate a bug — it is a reminder that `@aihu/auth` must be installed and registered for scope enforcement to be active.

### What to do

1. Install `@aihu/auth` as a dependency: `bun add @aihu/auth`
2. Register the auth middleware in your server entry point before starting the agent service.
3. Verify `$scope` values match the scope definitions in your `aihu.config.ts`.
4. The compiler warning will be suppressed in a future release once build-graph detection is implemented.

### Fail-closed behavior

If `@aihu/auth` is not registered and a component uses `$scope`:
- `handleToolCall` returns HTTP 401 with `{ error: 'AUTH_MISSING' }`.
- `<$guard scope="...">` renders nothing (fail-closed at the UI layer).

This is intentional. Do not disable this behavior.

---

## Third-party Template Audit Guidance (Amendment 7 §6.11)

**Before using third-party `.aihu` templates (from npm packages, template repos, or community sources):**

1. **Audit `@agent` blocks**: Any template with an `@agent` block exposes actions and signals to external tool callers. Review all `$action`, `$prop`, and `$computed` entries marked `expose: { read: true }` or `expose: { read: true, write: true }`.

2. **Review `$scope` declarations**: Check that `$scope` values match your application's allowed scope set. An unexpected scope (e.g., `$scope admin`) in a third-party template could expose privileged actions.

3. **Check `$rate-limit` settings**: Ensure rate limits are appropriate for your traffic volume. Missing or absent `$rate-limit` on high-volume endpoints may allow quota exhaustion.

4. **Verify `<$guard>` usage**: `<$guard scope="...">` gates DOM rendering. Ensure the scope attribute matches a legitimate, defined scope in your `@aihu/auth` configuration.

5. **Run the audit tool** (v0.4.0, planned): `bunx aihu audit:agent` will scan all SFCs for `@agent` blocks and produce a security report.

---

## Cross-Origin iframe Policy (Amendment 1 §6.7)

`@aihu/arbor` refuses to register live bindings from cross-origin iframes:

- When `window.parent !== window` and the parent origin differs from the current frame's origin, `mount()` skips `LiveBinding` registration and emits a `console.warn`.
- Same-origin iframes are permitted (they share the module graph by design).
- **Never combine** `sandbox="allow-scripts allow-same-origin"` on aihu-hosted content iframes — this combination is a security risk (allows cross-origin iframe breakout).

---

## CSP Compatibility (Amendment 6 §6.10)

The `$live` binding mechanism is compatible with `Content-Security-Policy: script-src 'self'`:

- No `unsafe-eval`, `unsafe-inline`, or blob: URL evaluation at any point.
- `__agentBinding` is elided from client bundles by the compiler — this is a **compiler guarantee**, not a runtime defense. CI/CD pipelines should include a `grep '__agentBinding'` step over assembled client bundles to verify.

---

## Registry Capacity (Amendment 5 §6.9)

The `componentInstanceRegistry` has a default cap of **1000 bindings per tag**. Exceeding this cap:
- Emits a `console.warn`.
- Rejects the new binding without affecting existing bindings.
- Does not evict existing bindings.

TTL-based eviction is reserved for v0.4.0 via the `agent.registry.bindingTtlMs` config key.
