/**
 * Unit tests for `@aihu/signals/lifecycle` — the DOM-free ownership
 * CONTRACT between `@aihu/runtime` and `@aihu/use`.
 * docs/plans/2026-07-24-lifecycle-ownership-dx.md §6.
 *
 * These tests exercise the contract standalone (no `@aihu/runtime`, no
 * DOM): a fake `LifecycleHost` is attached directly via
 * `_attachLifecycleHost`, mirroring what `@aihu/runtime`'s `_build()` does
 * at connect time.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { effectScope, getCurrentScope } from '../src/index.ts'
import { _attachLifecycleHost, getLifecycleHost, type LifecycleHost } from '../src/lifecycle.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

function fakeHost(): LifecycleHost {
  return {
    connected: () => true,
    onCommit: () => {},
  }
}

describe('@aihu/signals/lifecycle — getLifecycleHost()', () => {
  it('resolves the host attached to the CURRENT scope', () => {
    const scope = effectScope(true)
    const host = fakeHost()
    _attachLifecycleHost(scope, host)

    let resolved: LifecycleHost | undefined
    scope.run(() => {
      resolved = getLifecycleHost()
    })
    expect(resolved).toBe(host)
  })

  it('returns undefined with no current scope at all', () => {
    expect(getCurrentScope()).toBeUndefined()
    expect(getLifecycleHost()).toBeUndefined()
  })

  it('returns undefined for a scope that exists but has no attached host', () => {
    const scope = effectScope(true)
    let resolved: LifecycleHost | undefined
    scope.run(() => {
      resolved = getLifecycleHost()
    })
    expect(resolved).toBeUndefined()
  })

  it('does not leak a host across DIFFERENT scopes — WeakMap keys are scope-identity, not global', () => {
    const scopeA = effectScope(true)
    const scopeB = effectScope(true)
    _attachLifecycleHost(scopeA, fakeHost())

    let resolved: LifecycleHost | undefined
    scopeB.run(() => {
      resolved = getLifecycleHost()
    })
    expect(resolved).toBeUndefined()
  })

  it('resolves from a NESTED (child) scope only if attached there — attachment is not inherited up the scope tree', () => {
    const parent = effectScope(true)
    _attachLifecycleHost(parent, fakeHost())

    let resolved: LifecycleHost | undefined
    let child: ReturnType<typeof effectScope> | undefined
    parent.run(() => {
      // A non-detached child registers with the parent for disposal
      // cascade, but `getLifecycleHost()` keys strictly off the CURRENT
      // scope (getCurrentScope()), which is the child while its `run` is
      // active — so the parent's host is invisible from inside it.
      child = effectScope(false)
    })
    child!.run(() => {
      resolved = getLifecycleHost()
    })
    expect(resolved).toBeUndefined()
  })

  it('a host is unreachable once its scope has stopped and a new scope is current', () => {
    const scope = effectScope(true)
    _attachLifecycleHost(scope, fakeHost())
    scope.stop()

    const other = effectScope(true)
    let resolved: LifecycleHost | undefined
    other.run(() => {
      resolved = getLifecycleHost()
    })
    expect(resolved).toBeUndefined()
  })
})

describe('@aihu/signals/lifecycle — the guarded-size enforcement (design §6.4)', () => {
  // The design makes this a hard acceptance criterion, not a suggestion:
  // "This must be enforced: a CI assertion that dist/index.js contains no
  // hosts/WeakMap-lifecycle symbols, or simply the existing size row
  // failing if someone cross-imports." No assertion existed — the ONLY
  // backstop was the guarded `@aihu/signals` size row, which is
  // quantitatively insufficient on the numbers this package actually ships
  // (2234 B measured against a 2350 B limit — 116 B headroom — while
  // `lifecycle.ts` alone is 112 B, so a cross-import would land around
  // 2346 B and PASS the row). Guard the source directly instead of relying
  // on that headroom surviving future changes.
  it('src/index.ts never imports src/lifecycle.ts (source-level guard)', () => {
    const indexSrc = readFileSync(join(HERE, '../src/index.ts'), 'utf8')
    expect(indexSrc).not.toMatch(/lifecycle/i)
  })

  it('no source file under src/ OTHER than lifecycle.ts references the hosts WeakMap or LifecycleHost symbols', () => {
    // Belt-and-suspenders: even an indirect import (index.ts -> some other
    // src file -> lifecycle.ts) would eventually surface as a `lifecycle`
    // substring somewhere in the guarded module graph. Scanning every
    // non-lifecycle src file for the actual symbols the contract
    // introduces (rather than just the string "lifecycle") catches a
    // rename-around-the-string-check attempt too.
    const srcDir = join(HERE, '../src')
    const files = readdirSync(srcDir).filter(
      (f: string) => f.endsWith('.ts') && f !== 'lifecycle.ts',
    )
    for (const file of files) {
      const content = readFileSync(join(srcDir, file), 'utf8')
      expect(content).not.toMatch(/_attachLifecycleHost|getLifecycleHost|LifecycleHost/)
    }
  })
})
