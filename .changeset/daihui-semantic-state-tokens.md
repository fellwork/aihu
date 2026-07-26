---
'@aihu/css-engine': minor
---

**Semantic state tokens for the daihui layer: `--color-info` / `--color-success` /
`--color-warning` / `--color-neutral` (+ `-foreground` each), in both built-in packs,
light and dark.**

The daisyUI recipe set (Option 4, PR #604 §3.4) references four colour roles aihu had no
token for. Both founder escalations from that design doc are now ruled and implemented:

- **E1** — `info`/`success`/`warning` are added as *state* hues under an explicit
  amendment to the `.tastemaker/style-lock.md` single-accent rule: terracotta remains the
  only *identity* hue; state tokens are confined to a closed list of oklch hue bands
  (terracotta 29–35, ochre 70–82, sage 153–158, graphite 245–267) with chroma strictly
  below the accent's. The rule widening is stated in the lock, not smuggled.
- **E2** — `--color-neutral` is **added, not mapped to `--color-muted`** (a filled
  neutral surface is not a de-emphasis text colour). Its light value is graphite
  (`#363c47`) verbatim: neutral is the component-token realization of the graphite axis,
  the way `--color-accent` realizes terracotta — no brand meaning is repurposed.

Values (aihu-default), all verified by the new contrast tool:

| Token | Light | Dark | Foreground (light / dark) |
| --- | --- | --- | --- |
| `--color-info` | `#3d5a75` | `#8fadc8` | `#faf8f4` / `#1a1d24` |
| `--color-success` | `#3f6f4f` | `#84b898` | `#faf8f4` / `#1a1d24` |
| `--color-warning` | `#945f0e` | `#d8a848` | `#faf8f4` / `#1a1d24` |
| `--color-neutral` | `#363c47` | `#636a72` | `#faf8f4` / `#faf8f4` |

Unlike terracotta (ui-safe only), the state trio is **text-safe both ways** in both modes
(fill-on-bg and label-on-fill all ≥ 4.5; the sole ui-safe pairing is the dark neutral
fill at 3.30/3.08 vs bg/surface, with a 5.16 text-safe label). `aihu-graphite` carries
the same token names at chroma 0, per that pack's monochrome identity.

Also ships `.tastemaker/check_contrast.py` — the WCAG 2.x contrast tool the style lock
has mandated since it was written but which never existed. `--matrix` prints the full
token matrix; `--pairings` recomputes every legal-pairing claim in the lock and exits
non-zero if one no longer holds.

Scope notes: this is the colour slice only — the Rust-side utility resolution
(`is_brand_token` / `AIHU_BRAND_TOKENS`) and the non-colour daisyUI scalars
(`--size-*`, `--border`, `--depth`, `--noise`) are PR #604 slice 3, unchanged here. Only
the two shipped pack bundles grow (16 declarations each); per-component emission is
untouched, and no `.size-limit.json` row moves (packs are build-time).
