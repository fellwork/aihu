/**
 * `@aihu/css-engine/packs` — the two built-in style packs as `StylePack`
 * objects (Plan 3 Task 10 follow-up).
 *
 * These are the **source of truth** for the shipped `styles/aihu-default.css`
 * and `styles/aihu-graphite.css` bundles. The `.css` files are GENERATED from
 * these objects (`bun run gen:style-packs` → `scripts/gen-style-packs.ts`),
 * so the JS pack objects and the CSS files can never drift: each `.css` file
 * is exactly `pack.toCss()`. The `style-pack.test.ts` parity test asserts this
 * byte-for-byte.
 *
 * Both packs are expressed through the public {@link defineStylePack} API — the
 * same one external orgs use — proving the built-ins carry no privileged shape.
 * Token NAMES are the interchange contract: any recipe styled against these
 * names works under either pack with no markup change. Only the VALUES differ.
 *
 * Two access paths ship for each pack:
 *   1. `import { aihuDefault } from '@aihu/css-engine/packs'` → the JS object
 *      (`.tokens`, `.dark`, `.toCss()`).
 *   2. `import '@aihu/css-engine/styles/aihu-default.css'` → the generated CSS
 *      bundle (Vite/bundlers inline it).
 */

import { defineStylePack, type StylePack } from './define-style-pack.ts'

/**
 * `aihu-default` — the aihu brand palette (warm paper + ink, accent `#c8543a`),
 * derived from `aihu-logo.html` / `aihu-wordmark.svg`. Light values in `:root`,
 * dark overrides in `.dark`.
 */
export const aihuDefault: StylePack = defineStylePack({
  name: 'aihu-default',
  tokens: {
    // ── Color tokens (the utility-table contract: bg-primary → var(--color-primary)) ──
    'color-primary': '#1a1d24',
    'color-primary-foreground': '#faf8f4',
    'color-secondary': '#5a5a55',
    'color-secondary-foreground': '#faf8f4',
    'color-accent': '#c8543a',
    'color-accent-foreground': '#faf8f4',
    'color-surface': '#faf8f4',
    'color-surface-foreground': '#1a1d24',
    'color-background': '#faf8f4',
    'color-foreground': '#1a1d24',
    'color-muted': '#5a5a55',
    'color-muted-foreground': '#8a8880',
    'color-border': '#ddd9d2',
    'color-ring': '#c8543a',
    'color-destructive': '#a8432b',
    'color-destructive-foreground': '#faf8f4',
    // ── Semantic state tokens (daihui layer; values verified by
    //    .tastemaker/check_contrast.py --pairings — update both together) ──
    'color-info': '#3d5a75',
    'color-info-foreground': '#faf8f4',
    'color-success': '#3f6f4f',
    'color-success-foreground': '#faf8f4',
    'color-warning': '#945f0e',
    'color-warning-foreground': '#faf8f4',
    'color-neutral': '#363c47',
    'color-neutral-foreground': '#faf8f4',
    // ── Radius scale ──
    'radius-sm': '4px',
    'radius-md': '8px',
    'radius-lg': '12px',
    'radius-pill': '999px',
    // ── Spacing scale ──
    'space-1': '0.25rem',
    'space-2': '0.5rem',
    'space-3': '0.75rem',
    'space-4': '1rem',
    'space-6': '1.5rem',
    'space-8': '2rem',
    'space-12': '3rem',
    'space-16': '4rem',
    // ── Typography ──
    'font-sans': '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    'font-mono': '"JetBrains Mono", ui-monospace, "Fira Code", "Cascadia Code", monospace',
    // ── Non-color scalars (D4 §3.2/§3.4) — aihu-native defaults for the
    //    daisyUI-style recipe layer (Slice 4); no dark override, matching
    //    the radius/space/font scales above (theme-independent). ──
    'size-selector': '1.25rem',
    'size-field': '2.25rem',
    border: '1px',
    depth: '1',
    noise: '0',
  },
  dark: {
    'color-primary': '#ede8e0',
    'color-primary-foreground': '#1a1d24',
    'color-secondary': '#9e9890',
    'color-secondary-foreground': '#1a1d24',
    'color-accent': '#e8705a',
    'color-accent-foreground': '#1a1d24',
    'color-surface': '#1a1d24',
    'color-surface-foreground': '#ede8e0',
    'color-background': '#13151b',
    'color-foreground': '#ede8e0',
    'color-muted': '#9e9890',
    'color-muted-foreground': '#6e6860',
    'color-border': '#2e3240',
    'color-ring': '#e8705a',
    'color-destructive': '#f08070',
    'color-destructive-foreground': '#1a1d24',
    'color-info': '#8fadc8',
    'color-info-foreground': '#1a1d24',
    'color-success': '#84b898',
    'color-success-foreground': '#1a1d24',
    'color-warning': '#d8a848',
    'color-warning-foreground': '#1a1d24',
    'color-neutral': '#636a72',
    'color-neutral-foreground': '#faf8f4',
  },
})

/**
 * `aihu-graphite` — a neutral monochrome ramp expressed in `oklch()`
 * (chroma ≈ 0). Mirrors `aihu-default`'s token NAMES exactly so the two packs
 * are interchangeable; only the VALUES differ (desaturated monochrome scale).
 */
export const aihuGraphite: StylePack = defineStylePack({
  name: 'aihu-graphite',
  tokens: {
    // ── Color tokens — monochrome oklch ramp (light) ──
    'color-primary': 'oklch(0.22 0 0)',
    'color-primary-foreground': 'oklch(0.98 0 0)',
    'color-secondary': 'oklch(0.45 0 0)',
    'color-secondary-foreground': 'oklch(0.98 0 0)',
    'color-accent': 'oklch(0.35 0 0)',
    'color-accent-foreground': 'oklch(0.98 0 0)',
    'color-surface': 'oklch(0.99 0 0)',
    'color-surface-foreground': 'oklch(0.22 0 0)',
    'color-background': 'oklch(0.99 0 0)',
    'color-foreground': 'oklch(0.22 0 0)',
    'color-muted': 'oklch(0.55 0 0)',
    'color-muted-foreground': 'oklch(0.65 0 0)',
    'color-border': 'oklch(0.88 0 0)',
    'color-ring': 'oklch(0.35 0 0)',
    'color-destructive': 'oklch(0.4 0 0)',
    'color-destructive-foreground': 'oklch(0.98 0 0)',
    // ── Semantic state tokens (monochrome — states differ by lightness only,
    //    per this pack's chroma≈0 identity; pair with icons/copy for meaning) ──
    'color-info': 'oklch(0.44 0 0)',
    'color-info-foreground': 'oklch(0.98 0 0)',
    'color-success': 'oklch(0.5 0 0)',
    'color-success-foreground': 'oklch(0.98 0 0)',
    'color-warning': 'oklch(0.54 0 0)',
    'color-warning-foreground': 'oklch(0.98 0 0)',
    'color-neutral': 'oklch(0.3 0 0)',
    'color-neutral-foreground': 'oklch(0.98 0 0)',
    // ── Radius scale (shared contract) ──
    'radius-sm': '4px',
    'radius-md': '8px',
    'radius-lg': '12px',
    'radius-pill': '999px',
    // ── Spacing scale (shared contract) ──
    'space-1': '0.25rem',
    'space-2': '0.5rem',
    'space-3': '0.75rem',
    'space-4': '1rem',
    'space-6': '1.5rem',
    'space-8': '2rem',
    'space-12': '3rem',
    'space-16': '4rem',
    // ── Typography (shared contract) ──
    'font-sans': '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
    'font-mono': '"JetBrains Mono", ui-monospace, "Fira Code", "Cascadia Code", monospace',
    // ── Non-color scalars (shared contract, D4 §3.2/§3.4) ──
    'size-selector': '1.25rem',
    'size-field': '2.25rem',
    border: '1px',
    depth: '1',
    noise: '0',
  },
  dark: {
    'color-primary': 'oklch(0.92 0 0)',
    'color-primary-foreground': 'oklch(0.18 0 0)',
    'color-secondary': 'oklch(0.68 0 0)',
    'color-secondary-foreground': 'oklch(0.18 0 0)',
    'color-accent': 'oklch(0.78 0 0)',
    'color-accent-foreground': 'oklch(0.18 0 0)',
    'color-surface': 'oklch(0.22 0 0)',
    'color-surface-foreground': 'oklch(0.92 0 0)',
    'color-background': 'oklch(0.16 0 0)',
    'color-foreground': 'oklch(0.92 0 0)',
    'color-muted': 'oklch(0.62 0 0)',
    'color-muted-foreground': 'oklch(0.5 0 0)',
    'color-border': 'oklch(0.32 0 0)',
    'color-ring': 'oklch(0.78 0 0)',
    'color-destructive': 'oklch(0.7 0 0)',
    'color-destructive-foreground': 'oklch(0.18 0 0)',
    'color-info': 'oklch(0.72 0 0)',
    'color-info-foreground': 'oklch(0.18 0 0)',
    'color-success': 'oklch(0.74 0 0)',
    'color-success-foreground': 'oklch(0.18 0 0)',
    'color-warning': 'oklch(0.78 0 0)',
    'color-warning-foreground': 'oklch(0.18 0 0)',
    'color-neutral': 'oklch(0.52 0 0)',
    'color-neutral-foreground': 'oklch(0.98 0 0)',
  },
})

/** All built-in packs, keyed by name — handy for registry/iteration. */
export const builtinPacks: Record<string, StylePack> = {
  [aihuDefault.name]: aihuDefault,
  [aihuGraphite.name]: aihuGraphite,
}
