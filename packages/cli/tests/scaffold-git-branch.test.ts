/**
 * The scaffold's git repo must be on `main`, whatever the machine thinks.
 *
 * This runs REAL git through `realSpawner` rather than asserting a command
 * list. The unit assertion in `scaffold-pipeline.test.ts` covers the shape;
 * this covers the property, and only this one would have caught the defect —
 * the command list was correct-looking (`git init` + add + commit) the whole
 * time it was producing repos moon could not resolve.
 *
 * The ambient config is made HOSTILE on purpose (`init.defaultBranch = trunk`).
 * A test that leaves it alone passes on any developer box whose global config
 * already says `main`, which is precisely why nobody saw this until the
 * scaffold matrix ran it on a runner — cf-team FAILED at `typecheck` on all
 * four package managers in run 30404220223, with
 * `fatal: ambiguous argument 'main'` out of moon's `base="main" head="HEAD"`.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeOptions, realSpawner, runPostInstall } from '../src/scaffold-pipeline.ts'
import type { TemplateManifest } from '../src/template-manifest.ts'

/** git-init only — `pm-install` would download the internet for no signal. */
function gitOnlyManifest(): TemplateManifest {
  return {
    name: '@aihu/templates-cf-team',
    displayName: 'Cloudflare · team-ready',
    description: 'CF Workers + monorepo',
    contractVersion: 1,
    cliRange: '^0.2.0',
    fixed: { vendor: 'cloudflare', persona: 'team' },
    overridable: { initGit: { choices: [true, false], default: true } },
    conditionalFiles: [],
    placeholders: [],
    postInstall: [{ kind: 'git-init', when: 'initGit' }],
    appPeerDeps: {},
  }
}

function git(cwd: string, ...args: string[]): { status: number | null; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false })
  return { status: r.status, out: (r.stdout ?? '').trim() }
}

describe('scaffolded git repo', () => {
  let dir: string
  let savedGlobal: string | undefined
  let savedSystem: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aihu-cli-gitbranch-'))
    writeFileSync(join(dir, 'package.json'), '{"name":"demo"}\n')

    // Point git at a config that names a branch which is NOT `main`, so a
    // scaffold that simply inherits the ambient default cannot pass by luck.
    const hostile = join(dir, 'hostile.gitconfig')
    writeFileSync(hostile, '[init]\n\tdefaultBranch = trunk\n')
    savedGlobal = process.env.GIT_CONFIG_GLOBAL
    savedSystem = process.env.GIT_CONFIG_SYSTEM
    process.env.GIT_CONFIG_GLOBAL = hostile
    process.env.GIT_CONFIG_SYSTEM = '/dev/null'
  })

  afterEach(() => {
    if (savedGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL
    else process.env.GIT_CONFIG_GLOBAL = savedGlobal
    if (savedSystem === undefined) delete process.env.GIT_CONFIG_SYSTEM
    else process.env.GIT_CONFIG_SYSTEM = savedSystem
    rmSync(dir, { recursive: true, force: true })
  })

  it('is on `main` even when the machine defaults to another branch', () => {
    const m = gitOnlyManifest()
    const res = runPostInstall({
      manifest: m,
      options: mergeOptions(m, { appName: 'demo', userOverrides: {} }),
      targetDir: dir,
      spawner: realSpawner,
    })
    expect(res.failures).toEqual([])

    // Positive control on the fixture itself: if the hostile config were not
    // in effect, this test would prove nothing about the pin.
    expect(
      git(dir, 'config', 'init.defaultBranch').out,
      'the hostile ambient config did not reach git — the assertion below would be vacuous',
    ).toBe('trunk')

    expect(git(dir, 'symbolic-ref', '--short', 'HEAD').out).toBe('main')
  })

  it('resolves `main` as a revision, which is the thing moon actually asks', () => {
    const m = gitOnlyManifest()
    runPostInstall({
      manifest: m,
      options: mergeOptions(m, { appName: 'demo', userOverrides: {} }),
      targetDir: dir,
      spawner: realSpawner,
    })

    // `rev-parse main` is the question that exited 128 in the matrix. Naming
    // the branch is necessary but not sufficient — it must also be BORN, i.e.
    // carry the commit, or `main` is still an unknown revision.
    expect(git(dir, 'rev-parse', '--verify', 'main').status).toBe(0)
    expect(git(dir, 'rev-parse', 'HEAD').status).toBe(0)
    expect(git(dir, 'rev-list', '--count', '--all').out).toBe('1')
  })
})
