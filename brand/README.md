# aihu brand assets

The aihu logo — **N5 dot**. A rounded-bowl `u` with a single accent dot
floating where the tittle of an `i` would sit. The `i` itself is absent;
the dot is the brand.

## Files

| File | Purpose |
| --- | --- |
| `aihu-logo.svg` | Primary mark · dot r=9 (medium). The default. |
| `aihu-logo-small.svg` | Small dot r=7. Matches stroke weight — true-tittle read. |
| `aihu-logo-large.svg` | Bold dot r=11. Hero scale — dot dominates. |
| `aihu-wordmark.svg` | Mark + "aihu" lockup (Geist, 600). |
| `favicon.svg` | Transparent-background favicon (same geometry as primary). |
| `aihu-logo.html` | Preview page: hero, proportion studies, size ladder, wordmark. |

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#1a1d24` | `u` stroke (light backgrounds) |
| Off-white | `#faf8f4` | `u` stroke on dark; warm canvas |
| Accent | `#c8543a` | the dot — terracotta, never AI-blue |
| Type | Geist (sans), Geist Mono | wordmark + UI |

## Geometry

All variants use a `100×100` viewBox.

- **u path:** `M 18 30 L 18 56 a 32 32 0 0 0 64 0 L 82 30`
- **stroke-width:** `14`, no fill, butt linecaps
- **dot:** `cx=50`, `cy=16` (medium/small) or `14` (bold)
- **dot radius:** `7` (small) · `9` (medium, default) · `11` (bold)

The dot sits with a generous gap above the top of the `u`; the dot is the
focal element and should always read first.

## Usage

```html
<!-- favicon -->
<link rel="icon" type="image/svg+xml" href="/brand/favicon.svg" />

<!-- inline mark -->
<img src="/brand/aihu-logo.svg" alt="aihu" width="32" height="32" />
```

For dark surfaces, swap the `u` stroke color from `#1a1d24` to `#faf8f4`.
The dot stays terracotta in both modes.
