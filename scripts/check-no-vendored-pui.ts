#!/usr/bin/env bun
/**
 * CI guard for the performativeUI port: enforces "transcribe in spirit, never
 * vendor" (docs/plans/2026-08-01-performative-ui-port.md, binding provenance
 * rule). performativeUI ships with no LICENSE file — only an SPDX field and a
 * one-line README statement — so this port never copies its `pui-` prefixed
 * class names or literal source text. If either string shows up anywhere
 * outside the design doc itself, something got copy-pasted instead of
 * reimplemented.
 *
 * Usage: bun scripts/check-no-vendored-pui.ts
 * Exit 0 = clean, 1 = a `pui-`/`--pui-` string was found outside the allowlist.
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// The design doc is allowed to name the pattern it forbids everywhere else.
const ALLOWLIST = [
  'docs/plans/2026-08-01-performative-ui-port.md',
  'scripts/check-no-vendored-pui.ts',
]

// Structural usage patterns that indicate an ACTUAL `pui-` class was copied
// into markup/CSS — not prose mentioning the convention. Attribution comments
// in this port always reference the pattern inside backticks (`` `pui-` ``),
// which none of these match: a real vendored class shows up as a CSS
// selector (`.pui-foo`), an HTML/JSX class attribute value, or the
// `--pui-*` custom-property namespace.
const USAGE_PATTERNS = ['--pui-[a-zA-Z]', String.raw`\.pui-[a-zA-Z]`, 'class(Name)?=.pui-']

function grep(): string[] {
  try {
    const out = execSync(
      // examples/js13k-ascii-hero is pre-existing, untracked scratch work with
      // its own unrelated `pui-` naming choice — not part of this port, not
      // vendored performativeUI source. Excluded rather than allowlisted
      // file-by-file since it's not tracked in this repo's history.
      `grep -rlIE --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=vendor --exclude-dir=js13k-ascii-hero -- '${USAGE_PATTERNS.join('|')}' .`,
      { cwd: ROOT, encoding: 'utf8' },
    )
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch (err) {
    // grep exits 1 when there are no matches — that's the success case here.
    const e = err as { status?: number }
    if (e.status === 1) return []
    throw err
  }
}

if (import.meta.main) {
  const hits = grep()
    .map((f) => f.replace(/^\.\//, ''))
    .filter((f) => !ALLOWLIST.includes(f))

  if (hits.length > 0) {
    console.error('check-no-vendored-pui: found `pui-`/`--pui-` outside the allowlist:')
    for (const f of hits) console.error(`  ${f}`)
    console.error(
      '\nThe performativeUI port transcribes design/behavior in aihu-native code — it never ' +
        'copies pui- prefixed class names or source text. If this is a false positive, add the ' +
        'file to ALLOWLIST in this script with a comment explaining why.',
    )
    process.exit(1)
  }
  console.log('check-no-vendored-pui: ok')
}
