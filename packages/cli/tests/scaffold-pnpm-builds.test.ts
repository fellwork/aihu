import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AppTemplate, scaffoldApp } from '../src/index.ts'

/** Escape every regex-special char — REQUIRED_BUILDS below is a fixed
 * literal array, but the full escape (vs. the [/@]-only version this
 * replaces) removes the ambiguity CodeQL's js/incomplete-sanitization
 * flags. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * C-FEL-SCAFFOLD-PM-COMPAT — every scaffold must ship a `pnpm-workspace.yaml`
 * carrying the **v11** build-allow spelling.
 *
 * pnpm blocks lifecycle scripts by default and — unlike bun, which blocks them
 * silently — exits NON-ZERO doing it, so a scaffold missing this setting dies
 * on its very first `pnpm install`, before the user reaches a build. Both
 * entries postinstall an arch-specific native binary; a blocked script leaves
 * the wrong one in place to resurface later as ENOEXEC.
 *
 * WHY THE KEY NAME IS ASSERTED, not just the file's presence. pnpm v11 replaced
 * `onlyBuiltDependencies` with `allowBuilds`, and it does not warn about the
 * old one — it reads it with nothing and says nothing. Measured on pnpm 11.17.0
 * (the runner's exact version), one package depending on esbuild@0.25.12:
 *
 *   no pnpm-workspace.yaml        rc=1  ERR_PNPM_IGNORED_BUILDS: esbuild@0.25.12
 *   onlyBuiltDependencies: [...]  rc=1  ERR_PNPM_IGNORED_BUILDS: esbuild@0.25.12
 *   allowBuilds: {esbuild: true}  rc=0  esbuild postinstall$ node install.js Done
 *
 * The middle row is the whole point: the legacy spelling is indistinguishable
 * in effect from having no file, so "the file is emitted" is not the property
 * worth testing. That measurement is the read-side evidence this test cannot
 * itself provide — an emitter assertion proves the bytes were written, never
 * that anything reads them.
 *
 * Table-driven over EVERY template because the previous round of this contract
 * was a guard that covered one of two emitters and read as coverage while two
 * templates still shipped the defect.
 *
 * WHICH TREE THIS LIVED IN, stated because the first version of this comment got
 * it wrong: `pnpm-workspace.yaml` is emitted by NO template on `main` — it is
 * introduced by this branch. Measured on `45df25ba`: 22 files under
 * `packages/cli/src`, 8475 lines read, ZERO matches for `pnpm-workspace`. So
 * `agent` was never a pre-existing repo defect; it was the one of four file
 * lists this branch initially missed while adding the file to the other three.
 * The guard below is worth exactly as much either way — a file list is a fourth
 * place the setting has to be repeated, and repetition is what this test covers
 * — but "I found a bug" and "I missed one of my own four edits" are different
 * claims, and only the second one is true.
 */

const TEMPLATES: readonly AppTemplate[] = ['minimal', 'docs', 'full', 'agent', 'ssr']

/** The packages whose postinstall must be allowed to run. */
const REQUIRED_BUILDS = ['@aihu/compiler', 'esbuild'] as const

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'aihu-pnpm-builds-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('every scaffold unblocks pnpm lifecycle scripts', () => {
  for (const template of TEMPLATES) {
    it(`emits pnpm-workspace.yaml with allowBuilds — ${template}`, () => {
      const result = scaffoldApp('demo', tmpDir, { template })

      expect(
        result.created,
        `${template} does not emit pnpm-workspace.yaml — \`pnpm install\` on a fresh scaffold exits 1 with ERR_PNPM_IGNORED_BUILDS`,
      ).toContain('pnpm-workspace.yaml')

      const yaml = readFileSync(join(tmpDir, 'demo', 'pnpm-workspace.yaml'), 'utf8')

      // The v11 spelling, in the map shape it requires. A list under this key
      // is a different setting and pnpm will not accept it.
      expect(yaml).toMatch(/^allowBuilds:$/m)
      for (const pkg of REQUIRED_BUILDS) {
        expect(yaml, `${template} does not allow builds for ${pkg}`).toMatch(
          new RegExp(`^\\s+'?${escapeRegex(pkg)}'?:\\s*true$`, 'm'),
        )
      }

      // The legacy key is worse than absent: it looks like the setting is
      // handled while pnpm ignores it in silence.
      expect(
        yaml,
        `${template} still emits the pre-v11 key, which pnpm reads with nothing and warns about with nothing`,
      ).not.toMatch(/onlyBuiltDependencies:/)
    })
  }

  it('`aihu app --pm pnpm` does not stamp the project as bun', () => {
    // Spawns the real CLI rather than calling scaffoldApp() directly, because
    // the defect was in bin.ts's ARGUMENT HANDLING and not in the scaffold:
    // `--pm` was parsed for the template-package path and nowhere at all for
    // the built-in one, so the flag was silently dropped and every built-in
    // scaffold got the `pm` default. A test that calls scaffoldApp({pm}) passes
    // either way — it never touches the code that was broken.
    //
    // The consequence is not cosmetic. pnpm reads `packageManager` and REFUSES:
    //   ERROR: This project is configured to use bun
    // so `aihu app x --template agent --pm pnpm && pnpm install` died before
    // resolving a single dependency. Measured end-to-end against pnpm 11.17.0:
    // rc=1 before this fix, rc=0 after (with esbuild's postinstall running,
    // which is what the allowBuilds above buys).
    const cliBin = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'bin.ts')

    const run = (pm: string) => {
      const r = spawnSync('bun', [cliBin, 'app', 'pm-probe', '--pm', pm], {
        cwd: tmpDir,
        encoding: 'utf8',
        env: process.env,
      })
      expect(r.status, `scaffold --pm ${pm} failed: ${r.stdout}${r.stderr}`).toBe(0)
      const pkg = JSON.parse(readFileSync(join(tmpDir, 'pm-probe', 'package.json'), 'utf8'))
      rmSync(join(tmpDir, 'pm-probe'), { recursive: true, force: true })
      return pkg as { packageManager?: string }
    }

    expect(
      run('pnpm').packageManager,
      '`--pm pnpm` emitted a bun packageManager — pnpm refuses to install such a project outright',
    ).toBeUndefined()
    expect(run('yarn').packageManager).toBeUndefined()
    expect(run('npm').packageManager).toBeUndefined()

    // The bun default is unchanged — `packageManager` is how a bun project
    // pins its own toolchain, and the legacy-snapshot golden freezes it.
    expect(run('bun').packageManager).toMatch(/^bun@/)
  })

  it('the cf-team workspace template carries the same spelling', () => {
    // A checked-in file rather than a generator, so it drifts independently of
    // pnpmWorkspaceYaml() and has to be asserted separately. It is a real
    // workspace file — `packages:` beside the settings — which is why it cannot
    // simply reuse the generator.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
    const yaml = readFileSync(
      join(repoRoot, 'packages', 'templates', 'cf-team', 'template', 'pnpm-workspace.yaml'),
      'utf8',
    )

    expect(yaml).toMatch(/^packages:$/m)
    expect(yaml).toMatch(/^allowBuilds:$/m)
    for (const pkg of REQUIRED_BUILDS) {
      expect(yaml).toMatch(new RegExp(`^\\s+'?${escapeRegex(pkg)}'?:\\s*true$`, 'm'))
    }
    expect(yaml).not.toMatch(/onlyBuiltDependencies:/)
  })
})
