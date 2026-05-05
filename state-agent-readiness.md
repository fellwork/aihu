# State — Agent-Readiness Track

**Last updated:** 2026-05-03 (6-track follow-up Historian close — HEAD pointer refresh only)
**Current main HEAD:** `b704cd9` (Merge PR #51 — t4e/examples-integrated)
**Test floor:** 612 TS + 222 Rust
**Previously updated:** 2026-04-30
**Track HEAD (agent-readiness milestone):** `8e4f885` on `feat/agent-readiness-phase3`

---

## Spec

`.team/agent-readiness/spec-agent-readiness.md` — binding, all phases implemented.

---

## Packages

| Package | Status |
|---------|--------|
| `@aihu/server` | Source complete. Barrel (§2.8) done. |
| `@aihu/agent-readiness` | Source complete. Barrel (§3.7) done including vite-plugin. |

---

## Implementation Sequence (spec §8)

| Phase | Status |
|-------|--------|
| Phase 0 — Scaffolds, `types.ts`, `llms-txt.ts`, `robots.ts` | COMPLETE |
| Phase 1 — Server modules, `mcp-server-card.ts`, `content-negotiation.ts` | COMPLETE |
| Phase 2 — Config, barrels | COMPLETE |
| Phase 3 — `vite-plugin.ts`, integration tests, AC scripts | COMPLETE |

---

## Tests

**206 / 206 passing.** `tsc --noEmit` clean.

---

## Acceptance Criteria

| AC | Status |
|----|--------|
| AC-1 `generateLlmsTxt` | PASS |
| AC-2 `generateMcpServerCard` | PASS |
| AC-3 Content negotiation — markdown match | PASS |
| AC-4 Content negotiation — fall-through | PASS |
| AC-5 `generateRobotsTxt` allow-all | PASS |
| AC-6 Edge-safe dist check | Script ready (`scripts/check-edge-safe.sh`); pending `bun run build` |
| AC-7 Hard boundary (source) | PASS |
| AC-8 `MountScope.agent` unchanged | PASS |

---

## Pending Before Main Merge

1. Squash-merge phase branches: `phase1` → `phase2` → `phase3` → `main`
2. `bun run build` — verify rolldown + `.d.ts` output for both packages
3. `bash scripts/check-edge-safe.sh` — AC-6 final verification against dist files

---

## Open Questions

| ID | Priority | Description |
|----|----------|-------------|
| OQ-3 | MEDIUM | `getAllAgentMetadata()` absent from `@aihu/agent` v0. TODO comment in `vite-plugin.ts`. Deferred until minor-version bump. |
| Hot-reload | LOW | `configureServer` hook skeleton in place; `.aihu` invalidation listener not yet wired. Dev-mode follow-on. |

---

## Retro

`.team/agent-readiness/retro-phase1-3.md`
