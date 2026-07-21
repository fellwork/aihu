/**
 * GX Phase 1 (#437-GX) — unit tests for the extract-marker census helpers
 * (`_parseExtractMarker` / `_formatExtractCensus`).
 *
 * The Rust compiler emits a `// @aihu:extract read=<v> call=<v>` marker on
 * every server/universal artifact (the resolved policy, ratified default
 * included). The Vite plugin parses it per file and prints the per-value
 * distribution at buildEnd — the DA-e census pattern from #437, applied to
 * the governed-extractability posture so the default-vs-declared migration
 * story is visible in every build.
 *
 * Tests hand-craft the compiled module shape so they do not require the
 * Rust binary to be built — they exercise the JS-side helpers in isolation.
 */

import { describe, expect, it } from 'vitest'
import { _formatExtractCensus, _parseExtractMarker } from '../js/index.ts'

const COMPILED_DEFAULT = `// @aihu:extract read=agents call=anonymous
import { branch, leaf } from '@aihu/arbor'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('x-msg', defineComponent((_ctx) => {
  return branch('p', undefined, [leaf('hello')])
}))
`

const COMPILED_SCOPED = `// @aihu:shadow none
// @aihu:extract read=scope:reports:read call=verified
import { defineComponent, defineElement } from '@aihu/runtime'
`

describe('_parseExtractMarker', () => {
  it('parses the default-posture marker', () => {
    expect(_parseExtractMarker(COMPILED_DEFAULT)).toEqual({
      read: 'agents',
      call: 'anonymous',
    })
  })

  it('parses scope-shape values and tolerates a preceding shadow marker', () => {
    expect(_parseExtractMarker(COMPILED_SCOPED)).toEqual({
      read: 'scope:reports:read',
      call: 'verified',
    })
  })

  it('returns null when no marker is present (client-target artifacts)', () => {
    expect(_parseExtractMarker('// [client build] @agent block elided\nconst x = 1\n')).toBeNull()
  })
})

describe('_formatExtractCensus', () => {
  it('is silent for an empty census', () => {
    expect(_formatExtractCensus(new Map())).toEqual([])
  })

  it('prints per-value counts across both axes', () => {
    const census = new Map([
      ['/src/pages/a.aihu', { read: 'agents', call: 'anonymous' }],
      ['/src/pages/b.aihu', { read: 'agents', call: 'anonymous' }],
      ['/src/pages/reports.aihu', { read: 'scope:reports:read', call: 'verified' }],
    ])
    expect(_formatExtractCensus(census)).toEqual([
      '[aihu] extract census — 3 surface(s)',
      '  read=agents: 2',
      '  read=scope:reports:read: 1',
      '  call=anonymous: 2',
      '  call=verified: 1',
    ])
  })
})
