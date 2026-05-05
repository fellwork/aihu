# Director-note · cli-templates · round 001 · 2026-05-05

**Mode:** 2 (build/refactor, L-scope) · **Author:** Topic Director ·
**Reads:** state-cli-templates.md (just authored), arch-3..5,
SUMMARY.md, _user-directives.md, packages/cli/src/* · **Prior notes:** none

---

## On-thesis assessment

**Strongly on-thesis.** This track is a direct application of Directive 0
*"agentic discovery and interaction, for human purpose"*: it collapses
the "I scaffolded a project" → "my project is discoverable by agents"
gap to a single prompt answer (D9 Agent surface = Minimal default).

It also leverages Aihu's specific structural advantages over every
competitor CLI:

1. **`.mcp.json` auto-emission** is already drafted in arch-4 §6.6 —
   v0.2.0 just wires it on.
2. **`@expose` blocks in SFCs** are already shipped (v1 cutover
   2026-05-03). The starter component is a working agent surface
   without extra packages.
3. **Vanilla `@style` block** is a unique-to-Aihu default that lets us
   defer Tailwind to v0.2.1 *without* leaving users stuck — every other
   framework-CLI bundles a CSS framework because their templating layer
   has no scoped CSS.
4. **`@aihu/adapter-cloudflare` already exists** — edge-first deploy is
   a working default, not a future deliverable.

The track does NOT compete with v1.1's M1 critical path (homepage
playground, WASM compiler, examples polish). It runs adjacent and can
proceed in parallel. v0.2.0 of `@aihu/cli` is post-1.0 minor work.

**Risk on-thesis:** Two state-file callouts are HIGH severity (R-CT-04
template versioning; R-CT-06 backward compatibility with existing
`aihu app`). Both are addressed by the §7 Architect brief — flagging
here so the Architect doesn't gloss them.

## Routing for synthesis

**Topic-summary doesn't exist yet for this track.** Recommend:
**state-cli-templates.md IS the topic-summary.** No separate
`docs/topic-summaries/cli-templates-summary.md` needed for v0.2.0 — the
state file already plays both roles. Synthesizer at end of round 002
(post-Architect) updates state-cli-templates.md in place rather than
forking a separate summary doc.

If the track grows beyond v0.2.x and accumulates >5 director-notes, then
split: state-cli-templates.md becomes the single-pointer state, and
`docs/topic-summaries/cli-templates-summary.md` becomes the living
synthesis. Defer that split until needed.

## Priority

**v0.2.0 is the active milestone.** v0.2.1 (M2) and v0.2.2 (M3) are
documented in state §3 but **defer all M2/M3 substance** until v0.2.0
ships and the compile-after-scaffold harness is green in CI. Do not let
the Architect or Builder pull M2 work forward unless v0.2.0 itself is
explicitly broken.

The single hard scope-creep guard: the Architect's IS-NOT-IN-V0.2.0 list
(state §7 (f)). Verify the Architect ships that list verbatim in arch-6.

## Scope signal: **continue** (with one user-clarification trigger surfaced below)

No scope-shift detected. The user-listed dimensions are coherent;
adding D9–D11 is substantive completion (every competitor prompts D10
and D11; D9 is Aihu's headline differentiator and the framework already
has the underlying infra).

**One scope question must surface to the user before Architect proceeds**
(see "Surface-to-user triggers" below).

## Refined brief for next role

Spawn an **Architect** (Mode 2, single track, no parallel agents).

**Deliverable:** `docs/roadmap/arch-6-cli-templates.md` answering all
six questions (a)–(f) listed in state-cli-templates.md §7. Plus test
fixture stubs in `packages/cli/test-fixtures/` (empty JSON files with
filenames matching state §5's named fixtures).

**Acceptance for Architect round:**
1. arch-6 file lands at the canonical path
2. Each of (a)–(f) has a concrete decision (not "TBD")
3. The five named fixtures from state §5 exist as files (content TBD by
   Builder; just stubs from Architect)
4. The IS-NOT-IN-V0.2.0 list (f) appears verbatim in arch-6
5. Backward-compat contract for `aihu app foo` is cited with a runnable
   git-diff command suitable for CI
6. No code touched in `packages/cli/src/**`

**No-do list for Architect:**
- Do NOT write Builder-level code
- Do NOT publish any package
- Do NOT propose new packages outside what state §2 already named
- Do NOT design v0.2.1+ in detail (note them, defer them)

**Brief format:** standard Architect dispatch from `fw-agent-skill`'s
`references/templates.md`. Reference state-cli-templates.md as the
substantive input; the Architect should `agents_search` for `topic:cli-templates`
to pull future synthesizer updates if any.

## Surface-to-user triggers

Before the Architect dispatches, the Team Lead should ask the user for
clarification on the following, batched as a single focused list. **All
four are scoping decisions the Architect needs locked, not domain
unknowns.**

1. **Which deploy platforms are *must-have* for v0.2.0?**
   Director recommends Cloudflare Workers only (`@aihu/adapter-cloudflare`
   ready; matches Aihu's edge-first runtime story; defer Vercel + Fly
   to v0.2.1 + v0.2.2). Confirm or override.

2. **Publish CLI templates: bundled in `@aihu/cli` or separate `@aihu/templates-*` package family?**
   Director recommends bundled-in-CLI for v0.2.0 (faster ship, single
   tag, simpler Builder). Split into a separate package family if v0.2.x
   accumulates >3 template-only patch releases. (See state §6 R-CT-07.)

3. **Should agent-features (D9) default to ON or OFF?**
   Director recommends ON (Minimal) — it's the headline differentiator,
   `.mcp.json` is silent (no console spam), and the example component
   with `@expose` is a teaching moment. **The framing question is whether
   we want first-touch users to see "agent-ready out of the box" as the
   default story.** If user prefers explicit opt-in, change D9 default
   to "None" and add a one-line "tip" at end of scaffold output.

4. **Target user persona for v0.2.0 — solo developer or team?**
   Director assumes **solo developer building a side project** (no
   monorepo, no auth, no DB, single-package, deploy-to-CF). Team-targeted
   options (monorepo, auth, ORM) all defer to v0.2.1+. Confirm — if user
   actually wants a team-ready scaffold by v0.2.0, several M2 items
   come back in scope and the Architect must be re-briefed.

If the user answers "Director's recommendations look right, proceed,"
the Architect dispatches as briefed above. If any answer differs, the
Director re-runs and updates state-cli-templates.md before Architect
fires.

## Continuity check

**No prior notes — this is round 001.** AGENTS.db search for
`cli-templates` returned zero hits across delta + base. The track opens
clean. Future continuity-check entries in subsequent rounds reference
this note's id and the state file's then-current §3 phasing.

---

*Substance only. Branch names, dispatch mechanics, and merge sequencing
belong to the Team Lead.*
