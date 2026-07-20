/**
 * legacy-snapshot — backward-compat freeze per arch-6 §7.3 + §8.8.
 *
 * Invokes `aihu app legacy-snapshot --pm bun` with NO --template flag,
 * which falls through bin.ts dispatch into the legacy scaffoldApp() path.
 * The produced file tree is byte-compared against a checked-in golden
 * fixture under packages/cli/tests/legacy-snapshot.golden/.
 *
 * If a single byte differs the test fails — preserving R-CT-06 ("the
 * pre-templates `aihu app` workflow keeps producing the same artifact
 * for v0.2.0"). Intentional changes to legacy scaffolding require a
 * deliberate refresh of the golden fixture (delete the directory and
 * re-run; the harness writes a fresh one when none exists).
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_BIN = resolve(HERE, '..', 'src', 'bin.ts')
const GOLDEN_DIR = resolve(HERE, 'legacy-snapshot.golden')
const APP_NAME = 'legacy-snapshot'

let parentDir: string

beforeEach(() => {
  parentDir = mkdtempSync(join(tmpdir(), 'aihu-legacy-snap-'))
})

afterEach(() => {
  if (parentDir !== '') rmSync(parentDir, { recursive: true, force: true })
})

/**
 * Walk a directory recursively; returns POSIX-style relpaths sorted.
 *
 * `.vscode/` files are EXCLUDED from the snapshot: the repo `.gitignore`
 * ignores `.vscode/` globally, so those scaffolded files cannot be committed
 * into the golden fixture. Including them in the comparison made the golden
 * unbootstrappable (the produced tree always had two files the committed
 * golden could not). The legacy scaffold's `.vscode/extensions.json` +
 * `settings.json` content is editor wiring, not part of the runnable-parity
 * contract this freeze guards; they are covered by the pure-generator tests.
 *
 * When walking the GOLDEN dir (`isGolden`), a top-level `README.md` is also
 * skipped: it is the fixture's provenance annotation (why/when/from-what-SHA
 * the golden was regenerated), not scaffold output. The skip is deliberately
 * one-sided — if the scaffold ever starts emitting a top-level README.md the
 * produced walk WILL include it and the file-set comparison fails loud,
 * forcing an explicit harness decision instead of silently un-gating it.
 */
function walkRel(root: string, isGolden = false): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const entry of readdirSync(cur)) {
      const abs = join(cur, entry)
      const st = statSync(abs)
      if (st.isDirectory()) {
        stack.push(abs)
      } else if (st.isFile()) {
        const rel = relative(root, abs).replace(/\\/g, '/')
        if (rel.startsWith('.vscode/')) continue
        if (isGolden && rel === 'README.md') continue
        out.push(rel)
      }
    }
  }
  return out.sort()
}

describe('legacy-snapshot · backward-compat freeze (arch-6 §7.3)', () => {
  it('aihu app <name> --pm bun produces the byte-identical golden tree', () => {
    // 1. Run legacy scaffold.
    const result = spawnSync('bun', [CLI_BIN, 'app', APP_NAME, '--pm', 'bun'], {
      cwd: parentDir,
      encoding: 'utf8',
      env: process.env,
    })
    expect(
      result.status,
      `legacy scaffold failed: stdout=${result.stdout}; stderr=${result.stderr}`,
    ).toBe(0)

    const producedRoot = join(parentDir, APP_NAME)
    expect(existsSync(producedRoot)).toBe(true)

    const produced = walkRel(producedRoot)

    // 2. First-run bootstrap: if the golden tree doesn't exist yet, write
    //    it and report. Subsequent runs diff against it. This mirrors the
    //    common snapshot-test pattern (vitest's __snapshots__ behavior)
    //    while keeping the golden tree as plain files in the source tree
    //    so a reviewer can scan the diff in code review.
    if (!existsSync(GOLDEN_DIR)) {
      // #434 guard: in CI a missing golden means the fixture was deleted (or
      // the checkout is broken) — auto-writing would make the freeze compare
      // the tree against itself and pass vacuously. Fail hard instead; the
      // bootstrap flow is a local-dev affordance only.
      if (process.env.CI) {
        throw new Error(
          'legacy-snapshot.golden/ is missing and this is a CI run (process.env.CI is set). ' +
            'Refusing to auto-write the golden in CI — a self-generated golden would pass ' +
            'vacuously. Regenerate locally (delete the dir, run the test twice) and commit it.',
        )
      }
      mkdirSync(GOLDEN_DIR, { recursive: true })
      for (const rel of produced) {
        const src = join(producedRoot, rel)
        const dst = join(GOLDEN_DIR, rel)
        mkdirSync(dirname(dst), { recursive: true })
        writeFileSync(dst, readFileSync(src))
      }
      // Surface clearly that this run bootstrapped the fixture; don't
      // silently let it pass as if a real diff happened.
      throw new Error(
        `legacy-snapshot.golden/ was missing. Wrote a fresh golden tree (${produced.length} files). ` +
          'Re-run the test to verify the produced tree matches the new golden. ' +
          'If the changes were intentional, commit the new golden directory. ' +
          'If unexpected, investigate before committing.',
      )
    }

    const golden = walkRel(GOLDEN_DIR, true)

    // 3. Compare file lists.
    expect(produced, 'produced file set must match golden file set').toEqual(golden)

    // 4. Byte-by-byte content comparison.
    // package.json normalisation: strip "packageManager" before comparing —
    // the field encodes the runner's bun version (process.versions.bun) which
    // differs between developer machines and CI runners.
    const normalize = (rel: string, buf: Buffer): Buffer => {
      if (rel !== 'package.json') return buf
      try {
        const obj = JSON.parse(buf.toString('utf8')) as Record<string, unknown>
        delete obj.packageManager
        return Buffer.from(`${JSON.stringify(obj, null, 2)}\n`, 'utf8')
      } catch {
        return buf
      }
    }
    for (const rel of produced) {
      const producedBuf = normalize(rel, readFileSync(join(producedRoot, rel)))
      const goldenBuf = normalize(rel, readFileSync(join(GOLDEN_DIR, rel)))
      expect(
        producedBuf.equals(goldenBuf),
        `byte-mismatch in ${rel} — legacy scaffolding regressed. ` +
          'If intentional, delete packages/cli/tests/legacy-snapshot.golden/ ' +
          'and re-run to regenerate.',
      ).toBe(true)
    }
  })
})
