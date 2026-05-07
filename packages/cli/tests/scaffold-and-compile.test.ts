/**
 * scaffold-and-compile harness — arch-6 §5 + §8.7 acceptance gate for v0.2.0.
 *
 * For each of the 3 auth providers `[better-auth, kinde, supabase]`:
 *   1. Scaffold a cf-team app via the wired bin.ts dispatch (D1).
 *   2. Assert the correct provider-specific files landed (and the wrong
 *      ones did NOT — conditionalFiles `when` evaluation gate).
 *   3. Assert the default-on conditional files are present (.mcp.json,
 *      live-counter.aihu).
 *   4. Best-effort `bun install --frozen-lockfile` + `bun run typecheck`
 *      + `bun run build`. Skipped on Windows per R-CT-01 and skipped
 *      generally when AIHU_SCAFFOLD_COMPILE is not set, because the
 *      `@aihu/*` peer deps emitted by the template resolve to ^0.2.0
 *      which is not yet on npm (state §3.1; published versions are 0.1.x).
 *      CI sets AIHU_SCAFFOLD_COMPILE=1 + uses the local workspace via
 *      bun's `workspace:` protocol to flip these to live assertions.
 *
 * Per arch-6 §8.7 the file-presence assertions are the acceptance core:
 * they prove the pipeline wiring (D1) emits the right shape per provider.
 * The compile phase is a stronger downstream check that depends on
 * package-publication readiness orthogonal to bin.ts dispatch correctness.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI_BIN = resolve(HERE, '..', 'src', 'bin.ts')
const REPO_ROOT = resolve(HERE, '..', '..', '..')

// Compile assertions are gated behind an env flag because the template's
// emitted package.json deps point at @aihu/* ^0.2.0 which is not yet on
// npm (see state §3.1, R-CT-01). CI flips this on once the workspace
// resolution path is wired. Without the flag, the file-presence assertions
// still gate D1 acceptance; they are the deterministic core.
const RUN_COMPILE = process.env.AIHU_SCAFFOLD_COMPILE === '1'
const ON_WINDOWS = process.platform === 'win32'

const PROVIDERS = ['better-auth', 'kinde', 'supabase'] as const
type Provider = (typeof PROVIDERS)[number]

interface ScaffoldedApp {
  /** Absolute path to the scaffolded app root (under tmp). */
  appRoot: string
  /** Absolute path to the parent tmp dir (cleaned up in afterEach). */
  parentDir: string
}

let parentDir: string

beforeEach(() => {
  parentDir = mkdtempSync(join(tmpdir(), 'aihu-scaffold-compile-'))
})

afterEach(() => {
  if (parentDir !== '') rmSync(parentDir, { recursive: true, force: true })
})

function scaffoldCfTeam(appName: string, auth: Provider): ScaffoldedApp {
  const appRoot = join(parentDir, appName)
  const optionsJson = JSON.stringify({ auth })
  // We always pass --no-install: the post-install pm-install step would
  // otherwise fail against the @aihu/* ^0.2.0 peer deps that aren't yet
  // published to npm. The compile-gate test below drives install
  // explicitly (under AIHU_SCAFFOLD_COMPILE) once the workspace
  // resolution path lands.
  const argv = [
    CLI_BIN,
    'app',
    appName,
    '--template',
    'cf-team',
    '--no-interactive',
    '--use-defaults',
    '--options-json',
    optionsJson,
    '--no-git',
    '--no-install',
  ]

  const result = spawnSync('bun', argv, {
    cwd: parentDir,
    encoding: 'utf8',
    // Inherit environment so import.meta.resolve / workspace fallback works.
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(
      `scaffold failed (status=${result.status}):\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    )
  }
  return { appRoot, parentDir }
}

describe('scaffold-and-compile · cf-team · 3-auth-provider matrix', () => {
  it.each(PROVIDERS)('auth=%s — scaffolds correct conditional file set', (auth) => {
    const appName = `myapp-${auth}`
    const { appRoot } = scaffoldCfTeam(appName, auth)

    // App root must exist after scaffold.
    expect(existsSync(appRoot)).toBe(true)

    // ── Provider-specific auth file: only the chosen one is present. ──
    for (const p of PROVIDERS) {
      const authFile = join(appRoot, 'apps', 'web', 'src', 'auth', `${p}.ts`)
      if (p === auth) {
        expect(existsSync(authFile), `expected auth file ${p}.ts to be present`).toBe(true)
      } else {
        expect(existsSync(authFile), `expected auth file ${p}.ts to be absent`).toBe(false)
      }
    }

    // ── F-5b: .env.example (renamed from .env.example.<provider>) is present;
    //    the provider-suffixed filenames are never written to disk. ──
    const envExample = join(appRoot, 'apps', 'web', '.env.example')
    expect(existsSync(envExample), 'expected apps/web/.env.example to be present').toBe(true)
    // The raw provider-suffixed filenames must NOT appear on disk (rename applied).
    for (const p of PROVIDERS) {
      const suffixed = join(appRoot, 'apps', 'web', `.env.example.${p}`)
      expect(existsSync(suffixed), `expected .env.example.${p} to be absent (F-5b rename)`).toBe(
        false,
      )
    }

    // ── Default-on conditionals (agentSurface=minimal, starter=live-counter). ──
    expect(existsSync(join(appRoot, '.mcp.json'))).toBe(true)
    expect(existsSync(join(appRoot, 'apps', 'web', 'src', 'components', 'live-counter.aihu'))).toBe(
      true,
    )

    // ── Sanity: top-level package.json + apps/web/package.json emitted. ──
    expect(existsSync(join(appRoot, 'package.json'))).toBe(true)
    expect(existsSync(join(appRoot, 'apps', 'web', 'package.json'))).toBe(true)
    // Ensure .tmpl was stripped on emit.
    expect(existsSync(join(appRoot, 'package.json.tmpl'))).toBe(false)
  })

  // The compile phase is gated; see file header for why. When run, it
  // exercises the full bun-install + typecheck + build chain on the
  // scaffolded output. CI sets AIHU_SCAFFOLD_COMPILE=1 once the workspace
  // resolution path lands (state §3.1 follow-up).
  it.skipIf(ON_WINDOWS || !RUN_COMPILE).each(PROVIDERS)(
    'auth=%s — scaffolded app installs + typechecks + builds',
    (auth) => {
      const appName = `compile-${auth}`
      const { appRoot } = scaffoldCfTeam(appName, auth)

      const install = spawnSync('bun', ['install', '--frozen-lockfile'], {
        cwd: appRoot,
        encoding: 'utf8',
        env: { ...process.env, BUN_INSTALL_CACHE_DIR: join(REPO_ROOT, '.bun-install-cache') },
      })
      expect(install.status, `bun install stderr: ${install.stderr}`).toBe(0)

      const typecheck = spawnSync('bun', ['run', 'typecheck'], {
        cwd: appRoot,
        encoding: 'utf8',
      })
      expect(typecheck.status, `bun run typecheck stderr: ${typecheck.stderr}`).toBe(0)

      const build = spawnSync('bun', ['run', 'build'], {
        cwd: appRoot,
        encoding: 'utf8',
      })
      expect(build.status, `bun run build stderr: ${build.stderr}`).toBe(0)
    },
    180_000,
  )
})
