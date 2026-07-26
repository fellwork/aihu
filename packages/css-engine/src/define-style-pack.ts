/**
 * `defineStylePack()` — the export hook for external orgs (Plan 3 Task 10).
 *
 * Lets an external org declare its own token bundle against the SAME token-name
 * contract as the built-in `aihu-default` / `aihu-graphite` packs (see
 * `styles/*.css`), so a custom pack slots into the engine exactly like the
 * built-ins. Returns a `StylePack` descriptor the engine can register and emit
 * as `:root` / dark / named-theme token blocks.
 *
 * The built-in packs are expressible through this same API — `defineStylePack`
 * is just the typed, programmatic form of the shipped CSS bundles.
 *
 * ## Theme dimensions
 *
 * A pack carries three kinds of token block, emitted in this order (order is
 * load-bearing: `:root`, `.dark`, and `[data-theme="…"]` all have identical
 * (0,1,0) specificity, so the LAST matching block wins):
 *
 * 1. `tokens`  → `:root { … }`                         — the base/light theme.
 * 2. `dark`    → `.dark, [data-theme="dark"] { … }`     — the dark overrides.
 * 3. `themes`  → `[data-theme="<name>"] { … }` each     — the named catalog.
 *
 * The dark block is **dual-keyed** on purpose. `docs/plans/2026-07-23-use-parity-
 * and-daisyui.md` Founder-decision #3 ratifies daisyUI's `data-theme` attribute
 * on `<html>` as the theme-switching convention, while every shipped consumer
 * today keys dark off a `.dark` class at `:root`. Emitting both selectors in one
 * comma-list makes `<html data-theme="dark">` resolve correct token values
 * immediately without invalidating a single `.dark` consumer — the transition
 * step that lets the two conventions coexist instead of requiring a flag day.
 *
 * See `docs/plans/2026-07-26-option-4-daisyui-design.md` §4 for the full
 * migration sequence, and §4.3 in particular for the one thing this does NOT
 * yet migrate: `dark:`-variant *utility rules* are still gated on `:root.dark`
 * by the Rust emitter (`crates/aihu-css-core/src/emit.rs:189-200`), so a page on
 * `data-theme="dark"` alone gets correct token values but not `dark:`-variant
 * utilities until that slice lands.
 */

/** A design-token map: `name` → CSS value. Names omit the leading `--`. */
export type TokenMap = Record<string, string>

/**
 * The selector the dark overrides are emitted under. Dual-keyed so the legacy
 * `.dark`-class convention and the ratified `data-theme` convention both
 * resolve the same values. Exported so consumers/tests can assert against one
 * constant rather than a hand-copied string.
 */
export const DARK_SELECTOR = '.dark, [data-theme="dark"]'

/**
 * Render a comma-separated selector list one selector per line.
 *
 * This is not cosmetic. The shipped `styles/*.css` bundles are generated from
 * these packs (`bun run gen:style-packs`) and byte-parity tested against
 * `toCss()` (`tests/style-pack.test.ts`), *and* they are checked by biome —
 * whose CSS formatter breaks a comma list onto separate lines. If `toCss()`
 * emitted `.dark, [data-theme="dark"] {` on one line, biome would reformat the
 * generated file on commit and the parity test would fail. Emitting biome's
 * canonical form makes the formatter a no-op over generated output.
 *
 * Exported so tests assert against this transform rather than re-deriving it.
 */
export function formatSelectorList(selector: string): string {
  return selector
    .split(',')
    .map((s) => s.trim())
    .join(',\n')
}

/**
 * `dark` is the reserved spelling for the dark theme — it has its own
 * dual-keyed selector, so a `themes.dark` entry would emit a second, colliding
 * `[data-theme="dark"]` block.
 */
const RESERVED_THEME_NAMES = new Set(['dark'])

/** Input to {@link defineStylePack}. */
export interface StylePackInput {
  /** Pack name, e.g. `'acme'` (used for registration / debugging). */
  name: string
  /** Light-theme tokens (the `:root` block). Names without the `--` prefix. */
  tokens: TokenMap
  /**
   * Optional dark-theme overrides. Emitted under {@link DARK_SELECTOR} — i.e.
   * both `.dark` and `[data-theme="dark"]`.
   */
  dark?: TokenMap
  /**
   * Optional named themes, each emitted as its own `[data-theme="<name>"]`
   * block. This is the dimension a swappable theme catalog (daisyUI's `light`/
   * `cupcake`/`dracula`/… set) transcribes into.
   *
   * Each entry is an OVERRIDE layer over `tokens`, not a standalone theme: only
   * the names that differ from the base need listing, exactly as `dark` works
   * today. A theme is selected by putting `data-theme="<name>"` on an ancestor
   * (per Founder-decision #3, `<html>`).
   *
   * `'dark'` is reserved — use the `dark` field, which is dual-keyed.
   */
  themes?: Record<string, TokenMap>
}

/** A registered, validated style-pack descriptor. */
export interface StylePack {
  readonly name: string
  readonly tokens: TokenMap
  readonly dark: TokenMap
  /** Named themes, keyed by theme name. Empty when the pack declares none. */
  readonly themes: Record<string, TokenMap>
  /** The named themes this pack offers, in declaration order. */
  readonly themeNames: readonly string[]
  /**
   * Serialize the pack to a `:root { … }` (+ dark, + named-theme) CSS string —
   * the same shape as the shipped `styles/*.css` bundles.
   */
  toCss(): string
}

/** Normalize a token name to its `--`-prefixed custom-property form. */
function asCustomProp(name: string): string {
  return name.startsWith('--') ? name : `--${name}`
}

function emitBlock(selector: string, tokens: TokenMap): string {
  const decls = Object.entries(tokens)
    .map(([name, value]) => `  ${asCustomProp(name)}: ${value};`)
    .join('\n')
  return `${formatSelectorList(selector)} {\n${decls}\n}\n`
}

/**
 * A theme name must be safe to inline into an unquoted-ish attribute selector
 * and to set as an attribute value. Restrict to the CSS-ident-ish alphabet
 * daisyUI's own catalog uses rather than escaping arbitrary input.
 */
const THEME_NAME_RE = /^[a-z][a-z0-9-]*$/

/**
 * Define a style pack from a token map.
 *
 * @example
 * const acme = defineStylePack({
 *   name: 'acme',
 *   tokens: { 'color-primary': '#0a7', 'radius-md': '6px' },
 *   dark: { 'color-primary': '#3fc' },
 *   themes: { cupcake: { 'color-primary': '#65c3c8' } },
 * })
 * acme.toCss()
 * // :root { --color-primary: #0a7; … }
 * // .dark, [data-theme="dark"] { --color-primary: #3fc; }
 * // [data-theme="cupcake"] { --color-primary: #65c3c8; }
 */
export function defineStylePack(input: StylePackInput): StylePack {
  if (!input.name) {
    throw new Error('defineStylePack: `name` is required')
  }
  if (!input.tokens || Object.keys(input.tokens).length === 0) {
    throw new Error(`defineStylePack("${input.name}"): tokens must be a non-empty map`)
  }

  const tokens = { ...input.tokens }
  const dark = { ...(input.dark ?? {}) }
  const themes: Record<string, TokenMap> = {}

  for (const [themeName, themeTokens] of Object.entries(input.themes ?? {})) {
    if (RESERVED_THEME_NAMES.has(themeName)) {
      throw new Error(
        `defineStylePack("${input.name}"): theme name "${themeName}" is reserved — ` +
          'use the `dark` field, which emits both `.dark` and `[data-theme="dark"]`',
      )
    }
    if (!THEME_NAME_RE.test(themeName)) {
      throw new Error(
        `defineStylePack("${input.name}"): invalid theme name "${themeName}" — ` +
          'theme names must match /^[a-z][a-z0-9-]*$/ (they become `[data-theme="…"]` selectors)',
      )
    }
    if (!themeTokens || Object.keys(themeTokens).length === 0) {
      throw new Error(
        `defineStylePack("${input.name}"): theme "${themeName}" must declare at least one token`,
      )
    }
    themes[themeName] = { ...themeTokens }
  }

  const themeNames = Object.freeze(Object.keys(themes))

  return {
    name: input.name,
    tokens,
    dark,
    themes,
    themeNames,
    toCss(): string {
      // Emission order is the cascade order — `:root`, `.dark`/`[data-theme]`,
      // and each named theme all weigh (0,1,0), so later blocks win. Named
      // themes must therefore come last: `<html class="dark" data-theme="x">`
      // resolves to theme `x`, which is what an explicit selection should mean.
      let css = emitBlock(':root', tokens)
      if (Object.keys(dark).length > 0) {
        css += emitBlock(DARK_SELECTOR, dark)
      }
      for (const [themeName, themeTokens] of Object.entries(themes)) {
        css += emitBlock(`[data-theme="${themeName}"]`, themeTokens)
      }
      return css
    },
  }
}
