/**
 * `defineStylePack()` — the export hook for external orgs (Plan 3 Task 10).
 *
 * Lets an external org declare its own token bundle against the SAME token-name
 * contract as the built-in `aihu-default` / `aihu-graphite` packs (see
 * `styles/*.css`), so a custom pack slots into the engine exactly like the
 * built-ins. Returns a `StylePack` descriptor the engine can register and emit
 * as `:root` / `.dark` token blocks.
 *
 * The built-in packs are expressible through this same API — `defineStylePack`
 * is just the typed, programmatic form of the shipped CSS bundles.
 */

/** A design-token map: `name` → CSS value. Names omit the leading `--`. */
export type TokenMap = Record<string, string>

/** Input to {@link defineStylePack}. */
export interface StylePackInput {
  /** Pack name, e.g. `'acme'` (used for registration / debugging). */
  name: string
  /** Light-theme tokens (the `:root` block). Names without the `--` prefix. */
  tokens: TokenMap
  /** Optional dark-theme overrides (the `.dark` block). */
  dark?: TokenMap
}

/** A registered, validated style-pack descriptor. */
export interface StylePack {
  readonly name: string
  readonly tokens: TokenMap
  readonly dark: TokenMap
  /**
   * Serialize the pack to a `:root { … }` (+ `.dark { … }`) CSS string — the
   * same shape as the shipped `styles/*.css` bundles.
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
  return `${selector} {\n${decls}\n}\n`
}

/**
 * Define a style pack from a token map.
 *
 * @example
 * const acme = defineStylePack({
 *   name: 'acme',
 *   tokens: { 'color-primary': '#0a7', 'radius-md': '6px' },
 *   dark: { 'color-primary': '#3fc' },
 * })
 * acme.toCss() // => ":root { --color-primary: #0a7; … } .dark { … }"
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

  return {
    name: input.name,
    tokens,
    dark,
    toCss(): string {
      let css = emitBlock(':root', tokens)
      if (Object.keys(dark).length > 0) {
        css += emitBlock('.dark', dark)
      }
      return css
    },
  }
}
