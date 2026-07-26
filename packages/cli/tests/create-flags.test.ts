/**
 * create-aihu non-interactive flag/default resolution (FIX 2).
 *
 * `resolveCreateOptions` is the pure resolver used by the non-interactive
 * path (`--yes`/`-y` or non-TTY stdin) so piped/scripted invocations resolve
 * deterministically instead of hanging on a prompt that can never be answered.
 */

import { describe, expect, it } from 'vitest'
import { resolveCreateOptions } from '../src/create.ts'

describe('resolveCreateOptions — documented defaults', () => {
  it('uses minimal/detected-pm/none/git-on when nothing is passed', () => {
    const r = resolveCreateOptions({ detected: 'pnpm' })
    expect(r).toEqual({
      template: 'minimal',
      pm: 'pnpm',
      css: 'none',
      // FEL-425: no fabricated shadow choice — undefined means the scaffold
      // emits no shadowMode and the DA4 framework defaults apply.
      shadowMode: undefined,
      initGit: true,
      agentTooling: true,
    })
  })

  it('honors an explicit template/pm/css/shadow/git', () => {
    const r = resolveCreateOptions({
      template: 'full',
      pm: 'npm',
      css: 'engine',
      shadow: 'light',
      git: false,
      detected: 'bun',
    })
    expect(r).toEqual({
      template: 'full',
      pm: 'npm',
      css: 'engine',
      shadowMode: 'light',
      initGit: false,
      agentTooling: true,
    })
  })

  it('agent tooling defaults on; --no-agent-tooling (agentTooling: false) turns it off', () => {
    expect(resolveCreateOptions({ detected: 'bun' }).agentTooling).toBe(true)
    expect(resolveCreateOptions({ agentTooling: false, detected: 'bun' }).agentTooling).toBe(false)
  })

  it('ignores shadow when css is none (nothing to pin)', () => {
    const r = resolveCreateOptions({ css: 'none', shadow: 'light', detected: 'bun' })
    expect(r.shadowMode).toBeUndefined()
  })

  it('css engine with no shadow flag resolves to undefined — framework defaults (FEL-425)', () => {
    const r = resolveCreateOptions({ css: 'engine', detected: 'bun' })
    expect(r.css).toBe('engine')
    expect(r.shadowMode).toBeUndefined()
  })

  it('css engine with an explicit shadow choice keeps it (deliberate-choice path)', () => {
    expect(
      resolveCreateOptions({ css: 'engine', shadow: 'shadow', detected: 'bun' }).shadowMode,
    ).toBe('shadow')
    expect(
      resolveCreateOptions({ css: 'engine', shadow: 'light', detected: 'bun' }).shadowMode,
    ).toBe('light')
  })

  it('git defaults on; --no-git (git:false) turns it off', () => {
    expect(resolveCreateOptions({ detected: 'bun' }).initGit).toBe(true)
    expect(resolveCreateOptions({ git: false, detected: 'bun' }).initGit).toBe(false)
  })

  it('falls back to detected pm when --pm is unset', () => {
    expect(resolveCreateOptions({ detected: 'yarn' }).pm).toBe('yarn')
    expect(resolveCreateOptions({ pm: 'bun', detected: 'yarn' }).pm).toBe('bun')
  })
})
