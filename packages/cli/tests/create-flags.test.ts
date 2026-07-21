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
      shadowMode: 'shadow',
      initGit: true,
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
    })
  })

  it('ignores shadow when css is none (forces shadow)', () => {
    const r = resolveCreateOptions({ css: 'none', shadow: 'light', detected: 'bun' })
    expect(r.shadowMode).toBe('shadow')
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
