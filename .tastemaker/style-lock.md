# aihu — style lock

**Status:** LOCKED. This is a contract, not a suggestion. Reuse these exact tokens for every
aihu UI (docs-next, examples, playground, any future surface). Do **not** re-derive a palette
or type pairing — a builder doing exactly that invented an off-brand indigo accent (2026-07-23),
which is the drift this lock exists to prevent.

**Source of truth:** `brand/README.md` + `brand/aihu-*.svg` (canonical), realized in
`apps/docs-next/src/styles/tokens.css`. If this lock and `brand/` ever disagree, `brand/` wins
and this file is corrected.

## Color contract

Single-accent identity. Terracotta is the **only** brand hue. The brand doc's own rule:
**"the dot — terracotta, never AI-blue."** No second brand color. Ever.

| Role | Token | Light | Dark |
| --- | --- | --- | --- |
| Ink (text) | `--fg` | `#1a1d24` | `#ece9e2` |
| Paper (bg) | `--bg` | `#faf8f4` | `#14161c` |
| Surface | `--surface` | `#ffffff` | `#1a1d24` |
| **Accent (the dot)** | `--accent` | `#c8543a` | `#e0674b` |
| Graphite (AI axis) | `--graphite` | `#363c47` | `#aab0bd` |
| Border / neutral | `--border` | `#ece9e2` | `#2b3038` |
| Muted text | `--muted` | `#5a5a55` | `#a39a92` |

**The humans/AI duality is expressed in-brand:** human/experience axis = **terracotta**;
AI/governance/security axis = **graphite** (a neutral from the brand ink). Differentiate the
two by tone/weight/treatment — never by adding a hue.

### Legal pairings (verified `check_contrast.py --matrix`, light mode)

- **Text-safe (≥4.5 — body text, links, button labels on a fill):** ink/surface (16.9),
  ink/paper (15.9), ink/border (13.9), graphite/surface (11.1), **graphite/paper (10.5)**,
  ink/on-accent (15.9).
- **UI-safe (≥3.0, <4.5 — large text, icons, state borders, button fills):** **terracotta on
  paper/surface = ~4.1–4.4**, terracotta/border (3.6), ink/terracotta (3.8).
- **Contract rule that bit us to know:** terracotta is **UI-safe, not text-safe**. Use it for
  buttons, accents, large/bold text, icons, rules — **not** small body copy on paper. Off-white
  label on a terracotta fill = 4.14 (fine for a button label; a hair under 4.5 for small text).
- **Decorative only (<3.0 — hairlines, never the sole state signal):** terracotta/graphite (2.5),
  ink/graphite (1.5), any neutral-on-neutral.

Any new pairing a screen introduces (a badge fill, disabled state, hover, state border) must be
checked against this contract and added here before shipping — re-run
`check_contrast.py --matrix` with the new token, don't eyeball it.

## Type

**Geist (sans) + Geist Mono** — per `brand/README.md` ("Type: Geist (sans), Geist Mono"). The
wordmark is Geist 600.

- ⚠️ **Open deviation:** `apps/docs-next` currently ships **Inter + JetBrains Mono**, not Geist.
  Fix in the build-out — self-host Geist/Geist Mono (@font-face, no CDN) and swap the stacks.
- Display: Geist, tight tracking, heavy (~700–750) used with restraint.
- Body: Geist, ~65ch measure. Code/labels: Geist Mono.

## Logo / mark

The **N5 dot**: a rounded-bowl `u` (`M 18 30 L 18 56 a 32 32 0 0 0 64 0 L 82 30`, stroke-width 14,
no fill) with a single terracotta dot at `cx=50, cy=16, r=9` (default). The dot is the brand and
must read first. On dark, the `u` stroke flips ink→off-white; the dot stays terracotta.
Use `brand/aihu-*.svg` byte-for-byte — do not reconstruct the mark.

## Density & spacing

4px grid. Content cards ≥ 24px internal padding. Internal padding ≤ the gap between siblings.
(Realized in `apps/docs-next/src/styles/tokens.css` space scale — reuse those tokens.)

## Motion

SSG + islands: static pages ship ~0 JS; interactive islands (playground counter, theme toggle,
search, TOC) hydrate. Keep motion restrained — reveals/transitions, reduced-motion-aware.
