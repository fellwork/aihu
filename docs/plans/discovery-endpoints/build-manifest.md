# Build manifest — fix #423: deprecated / non-spec discovery endpoints

Branch: `fix/discovery-endpoints` · Package: `packages/plugin-agent-readiness` (edits confined here).
Verified against `docs/domain-hints/seo-and-agent-discoverability.md` §6 and the specs it cites.

## Summary of the three fixes

### Fix 1 — A2A card path was the deprecated `/.well-known/agent.json`
A2A v0.3.0 (2025-07-30) renamed the discovery path to `/.well-known/agent-card.json`
(breaking; IANA feedback that `agent.json` was too generic). Current spec v1.0.1 (2026-05-28).

- **Canonical** path `/.well-known/agent-card.json` is now served (dev middleware + build emit).
- **Deprecated alias** `/.well-known/agent.json` is STILL served (SDKs serve both), now with a
  `Deprecation: true` header (RFC 8594) and `Link: </.well-known/agent-card.json>; rel="successor-version"`.
  The alias body is byte-identical to the canonical card, so existing consumers do not break.
- The dev middleware (`serveResponse`) was updated to forward **all** response headers (previously
  only `Content-Type`), so the alias's deprecation signal survives the Vite dev path too.

Files: `src/a2a-card.ts` (header comment), `src/vite-plugin.ts` (path constants, `a2aCard` handler
adds deprecation headers on the legacy pathname, dev `pathMap` + build `files` list both paths,
`serveResponse` header forwarding, plugin doc comment).

### Fix 2 — "SEP-1649 compliance" claim removed (card kept, not advertised as spec-compliant)
MCP revision 2025-11-25 defines no `/.well-known/mcp` server-card. SEP-1649 is CLOSED;
SEP-2127 moved off the Standards Track onto the Extensions Track. The card is still useful, so
we keep serving it — we just stop claiming conformance to a dead proposal.

- `src/mcp-server-card.ts` header rewritten: now states the card is aihu's OWN documented shape,
  explicitly NOT SEP-1649/spec compliant, with the closed-proposal context.
- `src/mcp-discovery.ts` header annotated: `/.well-known/mcp.json` is not in any MCP spec; it is an
  opt-in convenience surface, not spec-compliant.
- `tests/compliance/mcp-server-card-schema.test.ts` — the `describe` was
  `"MCP Server Card SEP-1649 schema compliance"`, i.e. a test pinning us to a closed proposal.
  Retargeted to `"MCP Server Card — documented aihu shape"` with a comment stating it validates our
  own shape and claims no spec conformance. All shape assertions retained (they were never
  SEP-specific — `$schema` literal, `version`, `protocolVersion` format, `serverInfo`, `transport`,
  `capabilities`, tools, credential-safety, round-trip).

Residual note (NOT changed — out of scope, would alter served bytes / risk over-reach): the emitted
`$schema` value `https://modelcontextprotocol.io/schemas/server-card/v1.0` points at a
modelcontextprotocol.io URL that does not resolve to a published schema. It functions as our card's
shape identifier; changing it is a separate content-change decision for the Team Lead. Flagged here
so it is not lost.

### Fix 3 — OAuth well-knowns advertised but not served → **STOP-ADVERTISING** (chosen option)
`mcp-server-card.ts` advertised `/.well-known/oauth-protected-resource` (RFC 9728, on OUR server) and
`/.well-known/oauth-authorization-server` (RFC 8414, on the auth server) and nothing answered either.

**Decision: stop advertising, do not serve.** Justification:
- Removing a dangling advertisement is safe and immediately honest; a pointer to an unserved
  well-known is worse than no pointer (a consumer follows it and 404s).
- Serving RFC 9728 protected-resource metadata *correctly* requires the full resource/scopes/
  auth-server relationship and is a larger, separate task — the prompt's default and the safe call.
- RFC 8414 metadata belongs on the **authorization server**, not the MCP server, so synthesizing a
  `/.well-known/oauth-authorization-server` URL from the MCP card was wrong regardless of whether
  anything served it.

Implementation: the `auth` block now emits only `authorizationServer` = the OAuth **issuer
identifier** (the configured token endpoint's origin, e.g. `https://auth.example.com`) — a real,
honest fact. Consumers perform their own RFC 8414 discovery against that issuer. `resourceMetadata`
(the RFC 9728 pointer) is removed from both the emitted object and the `McpServerCard['auth']` type.
No `/.well-known/oauth-*` string is emitted anywhere in the card.

Files: `src/mcp-server-card.ts` (`auth` interface field + generation block).

### Also — `llms-full.txt` wording
`llms-full.txt` is a Mintlify invention, not in the llmstxt.org spec. It is kept (widely copied).
Grep found **no** comment/doc in `plugin-agent-readiness` source that calls `llms-full.txt`
spec-compliant, so no wording correction was required. (The only spec-status discussion already lives
in the domain-hint doc and is already correct.)

## Files changed
- `src/a2a-card.ts` — header comment (canonical path + deprecated alias).
- `src/vite-plugin.ts` — A2A path constants; `a2aCard` handler deprecation headers on legacy path;
  canonical + legacy paths wired in dev `pathMap` and build `files`; `serveResponse` forwards all
  headers; plugin doc comment.
- `src/mcp-server-card.ts` — header (drop SEP-1649 claim); `auth` type + generation (stop advertising
  OAuth well-knowns, emit issuer origin only).
- `src/mcp-discovery.ts` — header note that `/.well-known/mcp.json` is non-spec.
- `tests/compliance/mcp-server-card-schema.test.ts` — rename describe; replace the `resourceMetadata`
  URL assertion with a "does not advertise unserved OAuth well-knowns" assertion.
- `tests/mcp-server-card.test.ts` — update the auth-block unit test to assert issuer origin + absence
  of the two `/.well-known/oauth-*` strings.
- `tests/vite-plugin.test.ts` — a2aCard suite now covers canonical path (no Deprecation header) and
  the legacy alias (200 + `Deprecation: true` + `Link` successor-version + identical body); new
  `A2A dev-middleware wiring` suite drives the real `configureServer` middleware and asserts both
  `/.well-known/agent-card.json` and `/.well-known/agent.json` are served (behavioral, not source-grep).

## Measured acceptance numbers
- `plugin-agent-readiness` tests: **153 passed / 0 failed** (baseline was 150; net +3 from new A2A
  canonical/alias/wiring tests; two OAuth assertions rewritten in place, one describe renamed). ≥115 ✔.
- `tsc --noEmit` (package): **exit 0**.
- `biome ci packages/plugin-agent-readiness`: **exit 0**, 0 warnings (introduced `any`s in a new test
  were replaced with a typed local `Middleware` shape).
- Thesis checks, all matching committed baseline of **0**: `check:derived` 0, `check:governed` 0,
  `check:attributed` 0, `check:dual-audience` 0, `check:hydration-adoption` 0.

## Bidirectional check
- **Correct behavior present:** canonical `/.well-known/agent-card.json` served + valid; MCP card
  no longer claims SEP-1649; card carries no unserved `/.well-known/oauth-*` advertisement.
- **No over-reach:** deprecated `/.well-known/agent.json` alias still served (same body); the MCP
  server card, `/.well-known/mcp.json`, `/.well-known/mcp/server-card.json`, llms.txt, llms-full.txt,
  robots.txt, sitemap.xml endpoints are otherwise unchanged; edits confined to
  `packages/plugin-agent-readiness/`; compiler / agent-a2a / agent-acp untouched.

## Not done (per instructions — Team Lead lands)
No README regen, no version bump, no bun.lock/`.size-limit.json` edits. Bundle size not re-measured
here; no size-limit change expected (header/string additions only), but noting it was not run.
