/**
 * scaffold-compile-clean — the guard that the §8.2 harness was missing.
 *
 * For EVERY scaffolder/template path that emits `.aihu` SFCs, generate the
 * project and run the CURRENT `aihu-compile` binary on each emitted `.aihu`
 * file, asserting ZERO compile errors (exit 0, no `C###` diagnostic on
 * stderr). This is what catches stale scaffolder grammar: prior to r2 the
 * default `create-aihu`/`aihu app` scaffolder emitted `$on:click` (C305) and
 * `{{ count }}`, and the cf-team templates used the removed
 * `@agent { $expose/$describe }` form (C440) — all of which the existing
 * file-presence harness (scaffold-and-compile.test.ts) silently passed.
 *
 * Binary resolution: prefer a pre-built workspace binary at
 * `target/release/aihu-compile[.exe]`; if absent, build it from source with
 * `cargo build --release -p aihu-compiler --bin aihu-compile`. The compiler
 * is the v0→v1 gate, so this never `--no-verify`s — it runs the real Rust
 * compiler the project ships.
 *
 * The `@route` block carries a path-scoped check (C500: `@route` only valid
 * in `src/pages/`). Emitted files are compiled IN PLACE at their real project
 * paths, so that check is satisfied exactly as it would be for a real build.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { scaffoldApp, scaffoldComponent, scaffoldPage } from '../src/index.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_BIN = resolve(HERE, '..', 'src', 'bin.ts')
const REPO_ROOT = resolve(HERE, '..', '..', '..')
const BIN_EXT = process.platform === 'win32' ? '.exe' : ''
const COMPILE_BIN = join(REPO_ROOT, 'target', 'release', `aihu-compile${BIN_EXT}`)

/** Recursively collect absolute paths of every `.aihu` file under `root`. */
function collectAihu(root: string): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const cur = stack.pop()!
    for (const entry of readdirSync(cur)) {
      const abs = join(cur, entry)
      const st = statSync(abs)
      if (st.isDirectory()) stack.push(abs)
      else if (st.isFile() && abs.endsWith('.aihu')) out.push(abs)
    }
  }
  return out.sort()
}

/**
 * Run the compiler on one `.aihu` file. Returns a structured result so the
 * test can assert exit 0 AND the absence of any `C###` diagnostic (the binary
 * exits non-zero on hard errors, but we also scan stderr to be defensive
 * about any future soft-error path).
 */
function compileFile(file: string): { ok: boolean; status: number | null; stderr: string } {
  const res = spawnSync(COMPILE_BIN, [file], { encoding: 'utf8' })
  const stderr = res.stderr ?? ''
  // Hard error codes are emitted as `C<digits>:`; the `[SECURITY]` $scope
  // advisory is intentionally NOT treated as a failure.
  const hasErrorCode = /\bC\d{3,}\b/.test(stderr)
  return { ok: res.status === 0 && !hasErrorCode, status: res.status, stderr }
}

/**
 * The router only mounts a route whose `name` is a valid (hyphenated)
 * custom-element tag; the compiler warns `does not contain a hyphen` for any
 * page registered under a non-hyphenated stem, which then never mounts (blank
 * `#outlet`). Every scaffolded PAGE (`src/pages/`) now carries a
 * `@route { name }` with a hyphenated tag, so this warning MUST be absent for
 * page files. Asserting its absence is the regression guard for the blank-page
 * bug. Layouts (`src/layouts/`) and components (`src/components/`) are
 * author-mounted (not router-mounted) and legitimately keep their filename
 * stem as the tag, so the warning is benign for them and is not asserted.
 */
function assertNoHyphenWarning(stderr: string, file: string): void {
  if (!file.includes(`${join('src', 'pages')}${sep}`)) return
  expect(
    stderr.includes('does not contain a hyphen'),
    `scaffolded page emitted a non-hyphenated tag warning (would render blank #outlet) for ${file}\nstderr:\n${stderr}`,
  ).toBe(false)
}

let parentDir: string

beforeAll(() => {
  // Ensure the compiler binary exists; build from source if not. The compiler
  // is the v1 gate — we must run the real binary, never skip the check.
  if (!existsSync(COMPILE_BIN)) {
    const build = spawnSync(
      'cargo',
      ['build', '--release', '-p', 'aihu-compiler', '--bin', 'aihu-compile'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: 'inherit' },
    )
    if (build.status !== 0) {
      throw new Error(
        `failed to build aihu-compile (status=${build.status}). ` +
          'Install the Rust toolchain or set up the prebuilt binary at ' +
          `${COMPILE_BIN}.`,
      )
    }
  }
  expect(existsSync(COMPILE_BIN), `compiler binary missing at ${COMPILE_BIN}`).toBe(true)
}, 600_000)

beforeAll(() => {
  parentDir = mkdtempSync(join(tmpdir(), 'aihu-scaffold-clean-'))
})

afterAll(() => {
  if (parentDir) rmSync(parentDir, { recursive: true, force: true })
})

describe('scaffold-compile-clean · every emitted .aihu compiles under current aihu-compile', () => {
  it('create-aihu / legacy `aihu app` scaffolder emits compiler-clean .aihu', () => {
    const root = join(parentDir, 'legacy-app')
    scaffoldApp('legacy-app', parentDir)

    const files = collectAihu(root)
    expect(files.length, 'legacy scaffold must emit at least one .aihu file').toBeGreaterThan(0)

    for (const f of files) {
      const r = compileFile(f)
      expect(r.ok, `compile failed for ${f}\nstatus=${r.status}\nstderr:\n${r.stderr}`).toBe(true)
      assertNoHyphenWarning(r.stderr, f)
    }
  })

  it('full + docs templates emit compiler-clean .aihu (FIX 3 hard constraint)', () => {
    for (const template of ['full', 'docs'] as const) {
      const appName = `tpl-${template}`
      const root = join(parentDir, appName)
      scaffoldApp(appName, parentDir, { template })

      const files = collectAihu(root)
      expect(
        files.length,
        `${template} scaffold must emit at least one .aihu file`,
      ).toBeGreaterThan(0)

      for (const f of files) {
        const r = compileFile(f)
        expect(
          r.ok,
          `${template}: compile failed for ${f}\nstatus=${r.status}\nstderr:\n${r.stderr}`,
        ).toBe(true)
        assertNoHyphenWarning(r.stderr, f)
      }
    }
  })

  it('`aihu page` + `aihu component` scaffolders emit compiler-clean .aihu', () => {
    const root = join(parentDir, 'gen')
    // page lands at src/pages/about.aihu (carries a @route block, so it must
    // be compiled at a src/pages/ path — C500 — which scaffoldPage emits).
    scaffoldPage('/about', root)
    scaffoldComponent('Card', root)

    const files = collectAihu(root)
    expect(files.length, 'page+component scaffold must emit .aihu files').toBe(2)

    for (const f of files) {
      const r = compileFile(f)
      expect(r.ok, `compile failed for ${f}\nstatus=${r.status}\nstderr:\n${r.stderr}`).toBe(true)
      assertNoHyphenWarning(r.stderr, f)
    }
  })

  it('@aihu/templates-cf-team scaffolder emits compiler-clean .aihu', () => {
    const appName = 'cfteam-clean'
    const root = join(parentDir, appName)
    const argv = [
      CLI_BIN,
      'app',
      appName,
      '--template',
      'cf-team',
      '--no-interactive',
      '--use-defaults',
      '--options-json',
      JSON.stringify({ auth: 'better-auth' }),
      '--no-git',
      '--no-install',
    ]
    const scaffold = spawnSync('bun', argv, { cwd: parentDir, encoding: 'utf8', env: process.env })
    expect(
      scaffold.status,
      `cf-team scaffold failed:\nstdout: ${scaffold.stdout}\nstderr: ${scaffold.stderr}`,
    ).toBe(0)

    const files = collectAihu(root)
    expect(files.length, 'cf-team scaffold must emit at least one .aihu file').toBeGreaterThan(0)

    for (const f of files) {
      const r = compileFile(f)
      expect(r.ok, `compile failed for ${f}\nstatus=${r.status}\nstderr:\n${r.stderr}`).toBe(true)
    }
  })
})
