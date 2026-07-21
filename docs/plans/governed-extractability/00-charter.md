# Governed Extractability — design effort charter

**Status:** design (no implementation). Team Lead orchestrating per fw-agent-skill.
**Topic:** `governed-extractability`  **Track:** `da4-govern`
**Started:** 2026-07-20 (founder-directed via /fw-agent-skill).

## Why this exists (founder framing, verbatim intent)

> "We need to be able to control what is extractable with the agentic core. If we
> can't control the data flow/scraping then it will become just a normal web
> framework."

The DA4 light-DOM flip (#437 phase 2) makes page content crawlable **by default**.
Shipping that ahead of a first-class control over *what is extractable* would invert
the thesis — crawlable-by-default with only coarse, scattered escape hatches. So the
control is designed **first**; the flip lands *into* it (ratified sequencing B).

## Ratified inputs (founder, 2026-07-20) — carry into the eventual thesis amendment

- **D1 — layouts default to `shadowMode: 'none'`** (page-chrome, not leaves). Amends the
  DA4 classifier text ("else leaf → open") for layout-mode files. Ratified.
- **D2 — CSS scoping for light pages = Option A (`@scope`)**, evergreen browser floor
  (Chrome 118+/Safari 17.4+/Firefox 128+), with tag-prefix as the pre-approved fallback.
  Ratified. Rationale: `@scope` is the enabling primitive; keeps the door open to a
  future unified light-everywhere mode.
- **D3 → reframed — sequencing B.** Extractability is a *core governed capability*, not a
  test. Design it first (this effort), then flip.
- Design spec for the flip mechanics already exists: `docs/plans/da4-flip/design-spec.md`
  (branch `design/da4-flip`). This effort feeds its D3/governance section.

## The design question

Design a **first-class, declared, agent-core-enforced control over what any surface
exposes to crawlers and agents**, and specify how it **composes** with the primitives
that already exist:

- `expose:` — per-member agent opt-in (what the agent axis may call/read)
- `$scope` / `$rate-limit` — governed access + budget, enforced at the serving gate
- **light/shadow rendering axis** — shadow content is not JS-less-crawler-extractable;
  light is. Today this is an *emergent* extractability lever, not a *declared* one.
- content negotiation, serving gate (`superseded_by IS NULL AND sign_off`),
  agent-readiness robots/discovery, MarkdownResolver

The core tension to resolve: **crawler extractability (light DOM, server-rendered) vs
governed agent extractability (expose/scope, verified principal) vs authored intent
(this content is public / agents-only / gated / never-extractable).** These are three
different axes today; the design must unify them into one declared model.

## Spine (fw-agent-skill, Mode 2 — design-heavy)

1. **Scout** (survey, read-only) → map every extractability-relevant control in the repo:
   layer, what it gates, default, and the gaps between them. → `10-survey.md`
2. **Architect ×N (fable)** → independent governed-extractability model proposals. → `2x-design-*.md`
3. **Adversarial critic (fable)** → attack each design (bypasses, incoherence with the
   thesis, composition failures with expose/scope/shadow). → `30-critique.md`
4. **Synthesis (Team Lead)** → one design spec + a **thesis-amendment proposal** for
   founder ratification. → `40-spec.md`, `41-thesis-amendment-proposal.md`

Founder decisions surface at synthesis; the thesis is base-layer (propose, don't edit).
