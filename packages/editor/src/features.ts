/**
 * FeaturesConfig (spec §9.1): off ⇒ commands rejected, paste content degrades
 * to text, input rules pruned. `codeBlock`/`table` exist in the type for
 * forward compatibility but v1 has no model for them — they are always
 * treated as off.
 */
export interface FeaturesConfig {
  headings?: boolean
  lists?: boolean
  blockquote?: boolean
  codeBlock?: boolean
  table?: boolean
  link?: boolean
  inputRules?: boolean | { disable?: string[] }
}

export const defaultFeatures: Required<
  Pick<FeaturesConfig, 'headings' | 'lists' | 'blockquote' | 'link'>
> &
  FeaturesConfig = {
  headings: true,
  lists: true,
  blockquote: true,
  link: true,
  inputRules: true,
}

export function resolveFeatures(f?: FeaturesConfig | null): FeaturesConfig {
  return { ...defaultFeatures, ...(f ?? {}) }
}
