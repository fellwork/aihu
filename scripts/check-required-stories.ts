#!/usr/bin/env bun
/**
 * Required-story-set CI gate (Plan 6, master spec §10.2).
 *
 * Reads the BUILT Storybook index (`apps/storybook/storybook-static/index.json`
 * — the ground truth of what actually rendered, immune to source-parse drift)
 * and asserts every recipe + primitive carries its mandated stories.
 *
 * Requirements derive from metadata:
 *  - recipes: `packages/ui/registry.json` items + each item's
 *    `meta.capabilities` flags ({ interactive, keyboard, form, overlay,
 *    directional }) authored in `registry/<name>/meta.json`.
 *  - primitives: the static table below (primitives have no meta.json; the
 *    table is reviewed against spec §10.2).
 *
 * Mapping (spec §10.2):
 *   Default, DarkMode                          — always
 *   Variants                                   — iff variants declared
 *   States, Hover, Focus, Disabled             — iff interactive
 *   KeyboardActivation                         — iff keyboard
 *   FormParticipation                          — iff form
 *   Open, OpenWithLongContent, FocusManagement — iff overlay
 *   RTLBehavior                                — iff directional
 *
 * Run after `bun run build-storybook`:  bun scripts/check-required-stories.ts
 * Exits 1 listing EVERY gap when a mandated story is missing.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

interface Capabilities {
  interactive?: boolean
  keyboard?: boolean
  form?: boolean
  overlay?: boolean
  /** FocusManagement applies only to focus-TRAPPING overlays (dialog, sheet,
   * alert-dialog) — not to tooltips/popovers that never steal focus
   * (spec §10.2: "focus trap on open, return on close"). Defaults to the
   * overlay flag when omitted. */
  trapsFocus?: boolean
  directional?: boolean
}

interface Requirement {
  /** Storybook title, e.g. `UI/Button` or `Primitives/Dialog`. */
  title: string
  caps: Capabilities
  hasVariants: boolean
  /** Overlay primitives swap States for Open coverage; see mapping. */
}

const ROOT = join(import.meta.dirname, '..')
const INDEX_PATH = join(ROOT, 'apps', 'storybook', 'storybook-static', 'index.json')
const REGISTRY_PATH = join(ROOT, 'packages', 'ui', 'registry.json')

/** Primitives capability table (spec §10.2; primitives have no meta.json).
 * Extend when a Phase 2+ primitive lands — the gate fails loudly if a listed
 * primitive has no stories at all. */
const PRIMITIVES: Array<{ name: string; title: string; caps: Capabilities }> = [
  { name: 'button', title: 'Primitives/Button', caps: { interactive: true, keyboard: true } },
  {
    name: 'dialog',
    title: 'Primitives/Dialog',
    caps: { interactive: true, keyboard: true, overlay: true },
  },
  {
    name: 'tooltip',
    title: 'Primitives/Tooltip',
    caps: { interactive: true, keyboard: true, overlay: true, trapsFocus: false },
  },
]

function requiredStories(req: Requirement): string[] {
  const out = ['Default', 'DarkMode']
  if (req.hasVariants) out.push('Variants')
  if (req.caps.interactive) out.push('States', 'Hover', 'Focus', 'Disabled')
  if (req.caps.keyboard) out.push('KeyboardActivation')
  if (req.caps.form) out.push('FormParticipation')
  if (req.caps.overlay) {
    out.push('Open', 'OpenWithLongContent')
    if (req.caps.trapsFocus !== false) out.push('FocusManagement')
  }
  if (req.caps.directional) out.push('RTLBehavior')
  return out
}

/** Overlay primitives are open/closed state machines — `Open` IS their state
 * coverage, and hover/disabled don't apply to the root contract. Narrow the
 * interactive set for overlays to keep requirements honest. */
function narrowForOverlay(stories: string[], caps: Capabilities): string[] {
  if (!caps.overlay) return stories
  return stories.filter((s) => !['Hover', 'Focus', 'Disabled'].includes(s))
}

function main(): void {
  if (!existsSync(INDEX_PATH)) {
    console.error(
      `check-required-stories: ${INDEX_PATH} not found — run \`bun run build-storybook\` first.`,
    )
    process.exit(1)
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf8')) as {
    entries: Record<string, { type: string; title: string; name: string; exportName?: string }>
  }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as {
    items: Array<{
      name: string
      variants?: Record<string, string[]>
      meta?: { capabilities?: Capabilities }
    }>
  }

  // title → set of story EXPORT names that actually rendered. (The index's
  // `name` is the start-cased display name — "Dark Mode" — while requirements
  // are authored as export identifiers — "DarkMode".)
  const rendered = new Map<string, Set<string>>()
  for (const entry of Object.values(index.entries)) {
    if (entry.type !== 'story') continue
    let set = rendered.get(entry.title)
    if (!set) rendered.set(entry.title, (set = new Set()))
    set.add(entry.exportName ?? entry.name)
  }

  const requirements: Requirement[] = [
    ...registry.items.map((item) => ({
      title: `UI/${item.name[0]?.toUpperCase()}${item.name.slice(1)}`,
      caps: item.meta?.capabilities ?? {},
      hasVariants: item.variants !== undefined && Object.keys(item.variants).length > 0,
    })),
    ...PRIMITIVES.map((p) => ({ title: p.title, caps: p.caps, hasVariants: false })),
  ]

  const gaps: string[] = []
  for (const req of requirements) {
    const have = rendered.get(req.title)
    const need = narrowForOverlay(requiredStories(req), req.caps)
    if (!have) {
      gaps.push(`${req.title}: NO stories rendered (need: ${need.join(', ')})`)
      continue
    }
    for (const story of need) {
      if (!have.has(story)) gaps.push(`${req.title}: missing required story "${story}"`)
    }
  }

  if (gaps.length > 0) {
    console.error('check-required-stories: required-story-set gate FAILED (spec §10.2):\n')
    for (const gap of gaps) console.error(`  ✗ ${gap}`)
    console.error(
      `\n${gaps.length} gap(s). Add the missing stories or update the capability flags.`,
    )
    process.exit(1)
  }

  console.log(
    `check-required-stories: OK — ${requirements.length} components, ${[...rendered.values()].reduce((n, s) => n + s.size, 0)} stories indexed.`,
  )
}

main()
