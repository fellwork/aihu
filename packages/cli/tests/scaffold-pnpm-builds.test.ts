import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type AppTemplate, scaffoldApp } from '../src/index.ts'

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
 * templates still shipped the defect. `agent` was in exactly that hole here: it
 * is the one template whose file list never included `pnpm-workspace.yaml`, so
 * `create-aihu --template agent` + `pnpm install` failed outright.
 */

const TEMPLATES: readonly AppTemplate[] = ['minimal', 'docs', 'full', 'agent']

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
          new RegExp(`^\\s+'?${pkg.replace(/[/@]/g, '\\$&')}'?:\\s*true$`, 'm'),
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
      expect(yaml).toMatch(new RegExp(`^\\s+'?${pkg.replace(/[/@]/g, '\\$&')}'?:\\s*true$`, 'm'))
    }
    expect(yaml).not.toMatch(/onlyBuiltDependencies:/)
  })
})
