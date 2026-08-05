#!/usr/bin/env bun
/**
 * One Rust pin, enforced.
 *
 * `rust-toolchain.toml`'s `channel` is the SOURCE OF TRUTH — rustup reads it
 * automatically for every `cargo` invocation, so it is the value that actually
 * governs a local build. Everything else exists only because a tool cannot see
 * it: `.prototools` drives `moonrepo/setup-toolchain`, and the workflows'
 * `dtolnay/rust-toolchain` steps + `RUSTUP_TOOLCHAIN` env drive CI.
 *
 * WHY THIS GUARD EXISTS. Those copies drifted in FORM, not just value. The
 * workflows pinned `"1.95"` while the toml pinned `"1.95.0"`. Those are not the
 * same specifier: `1.95` is a minor SERIES that rustup resolves to the latest
 * 1.95.x, so the moment a 1.95.1 ships, CI installs a toolchain the repo never
 * declared — alongside the 1.95.0 proto installs from `.prototools`. Two
 * toolchains on one runner, silently, and `Swatinem/rust-cache` folds every
 * installed version into its cache key, so the Rust cache quietly invalidates
 * too. Nothing fails; builds just get slower and less reproducible.
 *
 * So: exact match, everywhere, checked.
 *
 * TO BUMP RUST: change `rust-toolchain.toml` alone, then run this script. It
 * names every file still carrying the old value, so the bump is mechanical
 * rather than a grep-and-hope.
 *
 * Usage: bun scripts/check-rust-pin.ts
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKFLOW_DIR = '.github/workflows'

/** The declared truth: `channel = "x.y.z"` in rust-toolchain.toml. */
function sourceOfTruth(): string {
  const toml = readFileSync('rust-toolchain.toml', 'utf8')
  const m = /^\s*channel\s*=\s*"([^"]+)"/m.exec(toml)
  if (!m?.[1]) {
    console.error('check-rust-pin: rust-toolchain.toml has no `channel = "..."`.')
    process.exit(1)
  }
  return m[1]
}

interface Mismatch {
  file: string
  line: number
  found: string
  context: string
}

const expected = sourceOfTruth()
const mismatches: Mismatch[] = []

/** Scan one file for Rust-version specifiers and record any that disagree. */
function scan(file: string, patterns: RegExp[]): void {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return
  }
  text.split('\n').forEach((line, i) => {
    for (const re of patterns) {
      const m = re.exec(line)
      if (m?.[1] && m[1] !== expected) {
        mismatches.push({ file, line: i + 1, found: m[1], context: line.trim() })
      }
    }
  })
}

// `.prototools` — what `moonrepo/setup-toolchain` installs.
scan('.prototools', [/^\s*rust\s*=\s*"([^"]+)"/])

// Workflows — `dtolnay/rust-toolchain`'s input and the RUSTUP_TOOLCHAIN env.
// Deliberately NOT matched: `targets:` (wasm32 etc.) and action SHAs.
for (const f of readdirSync(WORKFLOW_DIR)) {
  if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue
  scan(join(WORKFLOW_DIR, f), [/^\s*toolchain:\s*"([^"]+)"/, /^\s*RUSTUP_TOOLCHAIN:\s*"([^"]+)"/])
}

if (mismatches.length > 0) {
  console.error(`check-rust-pin: ${mismatches.length} pin(s) disagree with rust-toolchain.toml.\n`)
  console.error(`  rust-toolchain.toml declares: ${expected}\n`)
  for (const m of mismatches) {
    console.error(`  ${m.file}:${m.line}  found "${m.found}"`)
    console.error(`      ${m.context}`)
  }
  console.error(
    '\n  A minor-series spec like "1.95" is NOT the same as "1.95.0": rustup\n' +
      '  resolves it to the latest patch, so CI can install a toolchain the repo\n' +
      '  never declared, alongside the one proto installs. Make every pin the\n' +
      '  exact value above.',
  )
  process.exit(1)
}

console.log(`check-rust-pin: ok — every Rust pin matches rust-toolchain.toml (${expected}).`)
