/**
 * GX Phase 4 (#466) — the build-layer governed-loader conflict checks
 * (spec §4.7; G7i build half). The router Vite integration is the layer that
 * can SEE sibling loader files, so C486/W487 live here:
 *
 *   C486 (ERROR) — `data:` + a plain sibling loader: one data source per
 *     route; a declared contradiction fails the BUILD (R2), never resolves by
 *     silent precedence.
 *   W487 (WARN)  — a plain loader on a hard-tier `read:` route without
 *     `data:`: the generated contract is declined; runtime falls back to
 *     route-level T4 withholding.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RouteSidecar } from '../src/vite-plugin.ts'
import { checkGovernedLoaderConflicts } from '../src/vite-plugin.ts'

let dir: string | null = null

function page(loaderSource?: string): string {
  dir = mkdtempSync(join(tmpdir(), 'aihu-governed-vite-'))
  const pageFile = join(dir, '[slug].aihu')
  writeFileSync(pageFile, '@route { path: "/lexicon/[slug]" }\n@template { <article/> }\n')
  if (loaderSource !== undefined) writeFileSync(join(dir, '[slug].loader.ts'), loaderSource)
  return pageFile
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = null
})

const GOVERNED_META: RouteSidecar = {
  data: { type: 'LexiconEntry', preview: ['headword'] },
  extract: { read: { scope: 'members' }, call: 'anonymous' },
}

describe('C486 — data: + sibling loader fails the build', () => {
  it('a plain defineLoader sibling on a data: route throws C486', () => {
    const f = page(
      "import { defineLoader } from '@aihu/server'\nexport const loader = defineLoader(async () => ({}))\n",
    )
    expect(() => checkGovernedLoaderConflicts(f, GOVERNED_META)).toThrowError(/C486/)
  })

  it('a defineGovernedFetch sibling is the sanctioned escape hatch — no error', () => {
    const f = page(
      "import { defineGovernedFetch } from '@aihu/server'\nexport const loader = defineGovernedFetch({ fetch: async () => ({}) })\n",
    )
    expect(() => checkGovernedLoaderConflicts(f, GOVERNED_META)).not.toThrow()
  })

  it('no sibling loader at all — no error (the generated default path)', () => {
    const f = page()
    expect(() => checkGovernedLoaderConflicts(f, GOVERNED_META)).not.toThrow()
  })
})

describe('W487 — plain loader on a hard-read route without data:', () => {
  it('warns W487 (and does not throw)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const f = page('export const loader = async () => ({})\n')
      const meta: RouteSidecar = { extract: { read: { scope: 'members' }, call: 'anonymous' } }
      expect(() => checkGovernedLoaderConflicts(f, meta)).not.toThrow()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/W487/))
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('a plain loader on a COMPLIANCE-read route stays silent (today’s contract)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const f = page('export const loader = async () => ({})\n')
      const meta: RouteSidecar = { extract: { read: 'all', call: 'anonymous' } }
      checkGovernedLoaderConflicts(f, meta)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('no meta at all (pre-GX route) stays silent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const f = page('export const loader = async () => ({})\n')
      checkGovernedLoaderConflicts(f, null)
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })
})
