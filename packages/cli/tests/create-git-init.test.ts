/**
 * `create-aihu`'s git-init step — FEL-431 defect 5, second implementation.
 *
 * #632 fixed the `aihu app` pipeline path (`scaffold-pipeline.ts`'s `git-init`
 * step). It did NOT fix `create.ts`, the create-aihu wizard, which is the path
 * most users actually take. That path ran `init`/`add`/`commit` with
 * `stdio: 'ignore'`, discarded all three exit statuses, and then printed a
 * green `✓ git init` unconditionally.
 *
 * The bar these tests assert is USER-VISIBLE and is the one FEL-431 defect 5
 * was filed about: after the wizard says it initialized a repo, `git rev-parse
 * HEAD` must exit 0. An unborn HEAD exits 128, and moon's git integration then
 * fails every command the wizard prints as the next step — `dev`, `build`,
 * `typecheck`. "A commit was attempted" is not the property; "a commit exists"
 * is.
 *
 * Identity has to be stripped for real to test this, because a developer
 * machine resolves `user.name`/`user.email` and hides the whole defect. `git`
 * reads identity from the system config, the global config, and the
 * `GIT_AUTHOR_*`/`GIT_COMMITTER_*` environment — all four are neutralised
 * below. `GIT_CONFIG_SYSTEM`/`GIT_CONFIG_GLOBAL` pointing at an empty file is
 * git's own supported way to do this and does not touch the developer's real
 * config.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { initGitRepo } from '../src/create.ts'

const IDENTITY_ENV = [
  'GIT_AUTHOR_NAME',
  'GIT_AUTHOR_EMAIL',
  'GIT_COMMITTER_NAME',
  'GIT_COMMITTER_EMAIL',
] as const

let sandbox: string
let saved: Record<string, string | undefined>

/** Point git at empty system+global config and drop the identity env vars. */
function stripAmbientIdentity(emptyConfig: string): void {
  process.env.GIT_CONFIG_SYSTEM = emptyConfig
  process.env.GIT_CONFIG_GLOBAL = emptyConfig
  for (const k of IDENTITY_ENV) delete process.env[k]
}

function git(dir: string, ...args: string[]): { status: number | null; out: string } {
  const r = spawnSync('git', ['-C', dir, ...args], {
    stdio: ['ignore', 'pipe', 'ignore'],
    shell: false,
    encoding: 'utf8',
  })
  return { status: r.status, out: (r.stdout ?? '').trim() }
}

/** A scaffolded project directory: `initGitRepo` runs AFTER `scaffoldApp`, so
 * the tree always has files. An EMPTY dir makes `git commit` exit 1 with
 * "nothing to commit" — a failure that has nothing to do with identity, and
 * one that would have made these tests assert the wrong cause. */
function scaffoldedDir(name: string): string {
  const dir = join(sandbox, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), '{"name":"proj"}\n')
  return dir
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'aihu-create-git-'))
  saved = {}
  for (const k of ['GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL', ...IDENTITY_ENV])
    saved[k] = process.env[k]
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  rmSync(sandbox, { recursive: true, force: true })
})

describe('initGitRepo — the scaffold ends with a real commit, not an unborn HEAD', () => {
  it('commits even when NO git identity is resolvable (CI runners, fresh containers)', () => {
    const empty = join(sandbox, 'empty.gitconfig')
    writeFileSync(empty, '')
    stripAmbientIdentity(empty)

    const target = scaffoldedDir('proj')
    const result = initGitRepo(target)
    expect(result).toEqual({ ok: true })

    // THE bar. 128 here is the defect; 0 is the fix.
    expect(git(target, 'rev-parse', 'HEAD').status).toBe(0)
    expect(Number(git(target, 'rev-list', '--count', '--all').out)).toBeGreaterThan(0)
  })

  it('uses the fallback identity only when ambient resolves nothing', () => {
    const empty = join(sandbox, 'empty.gitconfig')
    writeFileSync(empty, '')
    stripAmbientIdentity(empty)

    const target = scaffoldedDir('proj')
    expect(initGitRepo(target)).toEqual({ ok: true })
    expect(git(target, 'log', '-1', '--format=%ae').out).toBe('scaffold@aihu.dev')
  })

  it("PREFERS the developer's own identity when git can resolve it", () => {
    // The wizard is interactive and run by a human on their own machine; their
    // first commit should be authored by them, not by the scaffold's fallback.
    // This is the half that distinguishes this fix from the pipeline path,
    // which always passes the fallback explicitly.
    const configured = join(sandbox, 'configured.gitconfig')
    writeFileSync(configured, '[user]\n\tname = Real Dev\n\temail = dev@example.com\n')
    stripAmbientIdentity(configured)

    const target = scaffoldedDir('proj')
    expect(initGitRepo(target)).toEqual({ ok: true })
    expect(git(target, 'log', '-1', '--format=%ae').out).toBe('dev@example.com')
    expect(git(target, 'log', '-1', '--format=%an').out).toBe('Real Dev')
  })

  it('REPORTS the failing command instead of returning ok', () => {
    // A target whose parent does not exist cannot be init-ed. The property is
    // that the failure is surfaced with the command named — the old code
    // discarded every status and printed a green checkmark regardless.
    const target = join(sandbox, 'no-such-parent', 'proj')
    // `git init` creates leading directories, so make the path un-creatable by
    // putting a FILE where the parent directory would go.
    writeFileSync(join(sandbox, 'no-such-parent'), '')

    const result = initGitRepo(target)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failed).toContain('git init')
    expect(result.status).not.toBe(0)
  })
})
