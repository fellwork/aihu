/**
 * `create-aihu --options-json` — end-to-end against a real template package.
 *
 * The flag was listed in `create.ts`'s `VALUE_FLAGS` (so its value was
 * correctly skipped when hunting for the project name) and read by nobody: the
 * `package`-kind scaffold call passed no `userOverrides`, so
 * `create-aihu my-app --template cf-team --options-json '{"auth":"supabase"}'`
 * scaffolded better-auth and exited 0. `bin.ts` threaded the same flag, with
 * validation, the whole time — and `create-aihu` is the ONLY entry point npm
 * users can reach (`npx @aihu/cli app` cannot work; see create.ts's docblock).
 *
 * Driven as a real process rather than by calling the pipeline, because the
 * defect was entirely in argv handling: a test that calls
 * `scaffoldFromTemplatePackage({ userOverrides })` passes either way.
 *
 * `cf-team` resolves from `packages/templates/cf-team` on disk (the pipeline's
 * workspace fallback), and `--no-install --no-git` keeps the run offline and
 * under a second.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CREATE_BIN = resolve(HERE, '..', 'src', 'create.ts')

let cwd: string

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'aihu-options-json-'))
})

afterEach(() => {
  if (cwd !== '') rmSync(cwd, { recursive: true, force: true })
})

function create(...args: string[]) {
  const r = spawnSync('bun', [CREATE_BIN, ...args], { cwd, encoding: 'utf8', env: process.env })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

const BASE = ['--template', 'cf-team', '--no-install', '--no-git', '--yes'] as const

describe('create-aihu --options-json', () => {
  it('applies the overrides to the manifest’s overridable cells', () => {
    const r = create('app', ...BASE, '--options-json', '{"auth":"supabase","starter":"empty"}')
    expect(r.status, r.stderr).toBe(0)

    const web = join(cwd, 'app', 'apps', 'web')
    // The chosen provider, and ONLY the chosen provider.
    expect(existsSync(join(web, 'src', 'auth', 'supabase.ts'))).toBe(true)
    expect(existsSync(join(web, 'src', 'auth', 'better-auth.ts'))).toBe(false)
    expect(existsSync(join(web, 'src', 'auth', 'kinde.ts'))).toBe(false)
    // `starter: empty` drops the live-counter component.
    expect(existsSync(join(web, 'src', 'components', 'live-counter.aihu'))).toBe(false)
    // The override also drives the conditional peer dep (F-3b).
    const pkg = JSON.parse(readFileSync(join(web, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies).toHaveProperty('@supabase/supabase-js')
    expect(pkg.dependencies).not.toHaveProperty('better-auth')
  })

  it('falls back to manifest defaults when the flag is absent', () => {
    const r = create('app', ...BASE)
    expect(r.status, r.stderr).toBe(0)
    const web = join(cwd, 'app', 'apps', 'web')
    expect(existsSync(join(web, 'src', 'auth', 'better-auth.ts'))).toBe(true)
    expect(existsSync(join(web, 'src', 'auth', 'supabase.ts'))).toBe(false)
  })

  it('rejects invalid JSON instead of scaffolding the defaults', () => {
    const r = create('app', ...BASE, '--options-json', '{not json}')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('--options-json')
    expect(existsSync(join(cwd, 'app'))).toBe(false)
  })

  it('rejects a non-object payload', () => {
    const r = create('app', ...BASE, '--options-json', '["auth"]')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('must be a JSON object')
  })

  it('rejects a value that is not a string or boolean', () => {
    // ChoiceValue is `string | boolean`; a number could never match a
    // manifest's declared choices, so it is a mistake worth naming.
    const r = create('app', ...BASE, '--options-json', '{"auth":3}')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('value must be string or boolean')
  })

  it('is documented in the help text', () => {
    const r = create('--help')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--options-json')
  })
})
