/**
 * Playground preset snippets — Directive 1 §6 acceptance criterion.
 *
 * Presets are GENERATED from the cookbook corpus (`cookbook/*.aihu`): every
 * recipe whose `<!-- @cookbook -->` frontmatter carries a `playground:` label
 * becomes a preset (id = recipe id, label = the frontmatter value, source =
 * the recipe body). This file is the thin stable API over the generated data
 * in `presets.generated.ts` — regenerate with
 * `bun packages/mcp/scripts/build-cookbook-index.ts`; CI fails when the
 * generated file drifts from the corpus (scripts/check-cookbook-index.ts).
 *
 * The preset id is what gets written to the URL hash as `#preset=<id>`.
 * When the editor's value diverges from a preset, the URL switches to
 * `#src=<encodeURIComponent(source)>` so the in-progress draft is shareable.
 *
 * Spec: docs/roadmap/_user-directives.md §Directive 1.
 */

import { GENERATED_PRESETS } from './presets.generated.ts'

export interface Preset {
  readonly id: string
  readonly label: string
  readonly source: string
}

export const PRESETS: readonly Preset[] = GENERATED_PRESETS

export const DEFAULT_PRESET_ID = 'aihu-counter'

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
