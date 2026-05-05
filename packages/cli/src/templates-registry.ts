/**
 * @aihu/cli/templates-registry — the v0.2.0 hardcoded set of known template
 * package names per arch-6 §3.5.
 *
 * Intentionally NOT registry-search at runtime: that adds 500-2000ms to the
 * first prompt and `create-next-app` doesn't do it either. Each `@aihu/cli`
 * minor publish stamps the supported template set.
 */

export const KNOWN_TEMPLATES = [
  '@aihu/templates-cf-team',
  '@aihu/templates-vercel-team',
  '@aihu/templates-fly-team',
  '@aihu/templates-cf-solo',
  '@aihu/templates-cf-full-agent',
] as const

export type KnownTemplate = (typeof KNOWN_TEMPLATES)[number]

const SHORT_PREFIX = '@aihu/templates-'

/**
 * Resolve a short template name (e.g. `'cf-team'`) to its full package name
 * (e.g. `'@aihu/templates-cf-team'`).
 *
 * Accepts both the short form and the full form. Returns `undefined` if the
 * name does not match any KNOWN_TEMPLATES entry.
 */
export function resolveTemplateName(short: string): KnownTemplate | undefined {
  const candidate = short.startsWith(SHORT_PREFIX) ? short : `${SHORT_PREFIX}${short}`
  return (KNOWN_TEMPLATES as ReadonlyArray<string>).includes(candidate)
    ? (candidate as KnownTemplate)
    : undefined
}
