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

### Amendment — brand hue vs. state hues (2026-07-26, E1/E2 colour pass)

This is an **explicit widening** of the paragraph above, made deliberately rather than
silently. The single-accent rule as practiced was never "no non-terracotta pixel exists":
`--color-destructive` has shipped since the packs existed, and measured in oklch it is
terracotta *toned*, not a second hue (`#a8432b` = oklch(0.515 0.139 34.7) vs. accent
`#c8543a` = oklch(0.591 0.154 34.1) — same hue, lower lightness and chroma). What the rule
actually protects is **identity**. Restated precisely:

- **Brand hue (unchanged, absolute):** terracotta is the only *identity* hue — logo, links,
  emphasis, decoration, hero art, "what colour is aihu". Never a second one. The dot is
  terracotta, never AI-blue.
- **State hues (the widening):** semantic *state* tokens — `info` / `success` / `warning` /
  `destructive` / `neutral` — may carry non-terracotta hues, under all three constraints:
  1. **Placement.** State colours appear only where they signal state: alerts, badges,
     toasts, form validation, status chips. Never as decoration, section accents, link
     colour, or identity. If a screen would still make sense with the state colour swapped
     for another state colour, it is being used as decoration — that use is illegal.
  2. **Hue bands (a closed list, measured in oklch hue).** Terracotta `h≈29–35` (accent,
     destructive), ochre `h≈70–82` (warning), sage `h≈153–158` (success), graphite
     `h≈245–267` (info, neutral, ink, graphite itself). **Any hue outside these bands is
     banned** — the 2026-07-23 off-brand indigo (h≈280–300 territory) that created this
     lock falls in no band, and this amendment cannot be cited to admit the next one.
     Adding a band is a new amendment, not an interpretation.
  3. **Chroma cap.** Every semantic token's oklch chroma is **strictly below the accent's
     in the same mode** (accent C=0.154 light / 0.158 dark; current semantic max is 0.110
     light / 0.125 dark). Terracotta stays the most vivid thing on any screen — its rarity
     and dominance are the identity.

### Semantic state tokens (daihui layer — `packages/css-engine/src/packs.ts`)

Component-token names (`--color-*`) per the css-engine interchange contract. Every number
below is computed by `.tastemaker/check_contrast.py --pairings` (run it; do not eyeball).

| Role | Token | Light | Dark | On-colour (light / dark) |
| --- | --- | --- | --- | --- |
| Info (state) | `--color-info` | `#3d5a75` | `#8fadc8` | `#faf8f4` / `#1a1d24` |
| Success (state) | `--color-success` | `#3f6f4f` | `#84b898` | `#faf8f4` / `#1a1d24` |
| Warning (state) | `--color-warning` | `#945f0e` | `#d8a848` | `#faf8f4` / `#1a1d24` |
| Neutral (fill) | `--color-neutral` | `#363c47` | `#636a72` | `#faf8f4` / `#faf8f4` |

- **info** — oklch(0.456 0.056 247.4) / (0.734 0.051 245.7): the **graphite band with the
  chroma raised** (graphite C=0.021 → 0.056). Steel, not AI-blue — the chroma cap is what
  keeps it on the right side of that line. Conventional info-blue (saturated azure) was
  rejected as exactly the banned hue.
- **success** — oklch(0.498 0.074 153.7) / (0.737 0.072 157.1): a warm sage/forest green,
  desaturated to sit on warm paper. Green cannot be derived from the palette; it is the one
  genuinely new hue, admitted narrowly via band 153–158. Mint/emerald rejected as off-warmth.
- **warning** — oklch(0.531 0.110 70.1) / (0.758 0.125 82.0): deep ochre/bronze — the warm
  neighbour of terracotta, distinct from destructive (h 70 vs 35). Deliberately deep enough
  that the off-white label passes 4.5 and the colour is text-safe on paper; the conventional
  bright-amber-with-dark-text daisyUI look was rejected (fails the fill tier on paper at
  in-family saturation). Template appearance change accepted per founder ruling E1.
- **neutral** — light is **graphite verbatim** (`#363c47`); dark is a graphite-band mid grey
  (oklch 0.521 0.015 251.7) lightened until the fill clears 3.0 against the dark bg.
  **Naming resolution (E2):** `--color-neutral` is the daisyUI-interop name for a *filled
  neutral surface* (default buttons etc.). It does **not** repurpose graphite's brand
  meaning — it is the component-token *realization* of the graphite axis, the same way
  `--color-accent` realizes terracotta. `--graphite` keeps the AI-axis semantic; `neutral`
  is the fill role that happens to be drawn from it. It is NOT `--color-muted` (de-emphasis
  text) — mapping those produces visibly wrong buttons.
- The `aihu-graphite` pack carries the same token names at chroma 0 (states differ by
  lightness only, per that pack's monochrome identity — pair states with icons/copy there).

### Legal pairings (verified `.tastemaker/check_contrast.py --matrix`)

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

Semantic state tokens (all computed; unlike terracotta, the state trio is **text-safe both
ways** — as text on paper/surface AND as a fill under its on-colour):

- **Light:** info/paper 6.79, info/surface 7.20, on-info label 6.79; success/paper 5.50,
  success/surface 5.84, on-success label 5.50; warning/paper 5.07, warning/surface 5.38,
  on-warning label 5.07; neutral fill/paper 10.45, on-neutral label 10.45 — all text-safe.
- **Dark:** info/bg 7.73, success/bg 8.00, warning/bg 8.28, each with dark-ink label ≥7.2 —
  text-safe. Neutral fill/bg 3.30 and fill/surface 3.08 — **ui-safe** (the fill tier);
  its off-white label is 5.16, text-safe. Neutral-as-fill is the only semantic pairing that
  lives in the ui-safe tier, and only in dark mode.

Any new pairing a screen introduces (a badge fill, disabled state, hover, state border) must be
checked against this contract and added here before shipping — re-run
`.tastemaker/check_contrast.py --matrix` with the new token, don't eyeball it. The claims in
this section are themselves machine-checked: `check_contrast.py --pairings` recomputes every
one and exits non-zero if a claim no longer holds. If you change a token here, change the
`TOKENS` table in that script in the same commit.

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
The terracotta status dot may carry a faint live pulse (reduced-motion-aware).

## Design direction — "Datasheet for a living framework" (APPROVED 2026-07-23, founder: "It's beautiful")

The bound character for aihu docs/marketing surfaces. Reference render: the approved direction
prototype (published artifact; source kept in the working scratchpad, NOT committed — biome lints
embedded CSS in vendored HTML).

- **The dot is the system, not just the logo.** The terracotta dot ("reads first," per brand) is
  the recurring live-status device: `● governed`, `● live · runnable`, `● Run`, section accents,
  nav "you are here". Small, precise, deliberate — never decorative scatter. Its rarity is the point.
- **The dual-surface code card is the signature move.** Show one `.aihu` component AND its two
  governed projections: **Human render** (terracotta — the actual rendered UI) beside **Agent
  surface** (graphite — the exposed `expose`/`describe` contract an agent sees). Code-as-hero +
  thesis-as-design in one object. The flagship hero treatment and the API/example story.
- **Datasheet rigor.** Geist Mono metadata rails (section numbers, versions, byte sizes, construct
  tags, expose chips), hairline warm-neutral rules instead of boxes-everywhere, `tabular-nums`,
  precise alignment. Instrument-grade — fitting for a compiler-backed framework. Terracotta stays
  rare and deliberate = restraint = "governed".
- **Duality is a fixed semantic:** terracotta = human/experience; graphite = agent/security —
  applied identically everywhere (hero, duality band, expose chips), never a second hue.
- **API-as-datasheet:** each export as `signature | declaration | expose-chips`, not prose.
- **Show, don't tell:** a visual/mockup/real-render beats explanatory paragraphs; the dual-surface
  card sells more than a page of feature copy.

Type note stands: this direction assumes **Geist / Geist Mono** self-hosted (the prototype used a
system-grotesque stand-in). Self-host via the OFL `geist` package at build-out.
