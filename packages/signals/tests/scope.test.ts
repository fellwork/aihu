import { describe, expect, it, vi } from 'vitest'
import { computed } from '../src/computed.ts'
import { type Dispose, effect } from '../src/effect.ts'
import {
  type EffectScope,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  runWithScope,
} from '../src/scope.ts'
import { type Read, signal } from '../src/signal.ts'

describe('effectScope', () => {
  it('collects effects created inside run() and disposes them on stop()', () => {
    const [n, setN] = signal(0)
    let runs = 0
    const scope = effectScope()
    scope.run(() => {
      effect(() => {
        n()
        runs++
      })
    })
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(2)
    scope.stop()
    setN(2)
    expect(runs).toBe(2)
  })

  it('parent stop() cascades to child scopes and their effects', () => {
    const [n, setN] = signal(0)
    const parent = effectScope()
    let parentRuns = 0
    let childRuns = 0
    let child!: EffectScope
    parent.run(() => {
      effect(() => {
        n()
        parentRuns++
      })
      child = effectScope()
      child.run(() => {
        effect(() => {
          n()
          childRuns++
        })
      })
    })
    expect(parentRuns).toBe(1)
    expect(childRuns).toBe(1)
    setN(1)
    expect(parentRuns).toBe(2)
    expect(childRuns).toBe(2)
    parent.stop()
    expect(parent.active).toBe(false)
    expect(child.active).toBe(false)
    setN(2)
    expect(parentRuns).toBe(2)
    expect(childRuns).toBe(2)
  })

  it('detached scope is not stopped by the parent cascade', () => {
    const [n, setN] = signal(0)
    const parent = effectScope()
    let detachedRuns = 0
    let det!: EffectScope
    parent.run(() => {
      det = effectScope(true)
      det.run(() => {
        effect(() => {
          n()
          detachedRuns++
        })
      })
    })
    parent.stop()
    expect(det.active).toBe(true)
    setN(1)
    expect(detachedRuns).toBe(2)
    det.stop()
    setN(2)
    expect(detachedRuns).toBe(2)
  })

  it('onScopeDispose callbacks run in LIFO (reverse-registration) order', () => {
    const order: string[] = []
    const scope = effectScope()
    scope.run(() => {
      onScopeDispose(() => order.push('first'))
      onScopeDispose(() => order.push('second'))
      onScopeDispose(() => order.push('third'))
    })
    scope.stop()
    expect(order).toEqual(['third', 'second', 'first'])
  })

  it('computed created in a scope is disposed (unlinked) on stop()', () => {
    const [n, setN] = signal(1)
    const scope = effectScope()
    let c!: Read<number> & { dispose(): void }
    scope.run(() => {
      c = computed(() => n() * 2)
    })
    expect(c()).toBe(2)
    setN(2)
    expect(c()).toBe(4)
    scope.stop()
    // Disposed: unlinked from its source — later writes no longer mark it,
    // so the read serves the last cached value.
    setN(5)
    expect(c()).toBe(4)
  })

  it('run() after stop() returns undefined and does not execute fn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const scope = effectScope()
    scope.stop()
    let ran = false
    const result = scope.run(() => {
      ran = true
      return 42
    })
    expect(result).toBeUndefined()
    expect(ran).toBe(false)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('stop() is idempotent and re-entrant stop() from a cleanup is a no-op', () => {
    const scope = effectScope()
    let calls = 0
    scope.run(() => {
      onScopeDispose(() => {
        calls++
        scope.stop() // re-entrant: must not loop or re-drain
      })
    })
    expect(() => scope.stop()).not.toThrow()
    expect(calls).toBe(1)
    expect(scope.active).toBe(false)
    expect(() => scope.stop()).not.toThrow()
    expect(calls).toBe(1)
  })

  it('a child stopped before the parent cascade reaches it is a no-op', () => {
    const parent = effectScope()
    let childDisposes = 0
    let child!: EffectScope
    parent.run(() => {
      child = effectScope()
      child.run(() => onScopeDispose(() => childDisposes++))
    })
    child.stop()
    expect(childDisposes).toBe(1)
    expect(() => parent.stop()).not.toThrow()
    expect(childDisposes).toBe(1)
  })

  it('throwing disposer: remaining disposers still run; first error rethrown', () => {
    const scope = effectScope()
    const ran: string[] = []
    scope.run(() => {
      onScopeDispose(() => {
        ran.push('c')
      })
      onScopeDispose(() => {
        ran.push('b')
        throw new Error('boom-b')
      })
      onScopeDispose(() => {
        ran.push('a')
        throw new Error('boom-a')
      })
    })
    // LIFO: a runs first (throws first), then b (also throws), then c.
    expect(() => scope.stop()).toThrow('boom-a')
    expect(ran).toEqual(['a', 'b', 'c'])
  })

  it('manually-disposed effect inside a scope: stop() does not re-fire it', () => {
    const [n, setN] = signal(0)
    const scope = effectScope()
    let runs = 0
    let cleanups = 0
    let d!: Dispose
    scope.run(() => {
      d = effect((onCleanup) => {
        n()
        runs++
        onCleanup(() => cleanups++)
      })
    })
    d() // manual dispose swap-removes the scope entry
    expect(cleanups).toBe(1)
    setN(1)
    expect(runs).toBe(1)
    expect(() => scope.stop()).not.toThrow()
    expect(cleanups).toBe(1)
  })

  it('manually-disposed computed inside a scope: stop() is a no-op for it (swap-remove)', () => {
    const [n, setN] = signal(1)
    const scope = effectScope()
    let c!: Read<number> & { dispose(): void }
    scope.run(() => {
      c = computed(() => n() * 2)
    })
    expect(c()).toBe(2)
    c.dispose() // swap-removes its scope entry
    setN(3)
    expect(c()).toBe(2) // disposed: unlinked, serves last cache
    expect(() => scope.stop()).not.toThrow()
    expect(c()).toBe(2)
  })

  it('first-run-throw of a scoped effect removes its scope entry', () => {
    const scope = effectScope()
    let cleanupFires = 0
    let disposerRuns = 0
    scope.run(() => {
      onScopeDispose(() => disposerRuns++)
      expect(() =>
        effect((onCleanup) => {
          onCleanup(() => cleanupFires++)
          throw new Error('boom')
        }),
      ).toThrow('boom')
    })
    // Recovery dispose already drained the cleanup and swap-removed the
    // scope entry; stop() must not touch the dead effect again.
    expect(cleanupFires).toBe(1)
    expect(() => scope.stop()).not.toThrow()
    expect(cleanupFires).toBe(1)
    expect(disposerRuns).toBe(1)
  })

  it('runWithScope against a stopped scope: fn runs; registrations are unowned', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const [n, setN] = signal(0)
    const scope = effectScope()
    scope.stop()
    let runs = 0
    let d!: Dispose
    const result = runWithScope(scope, () => {
      onScopeDispose(() => {}) // unowned: dev-warns, dropped
      d = effect(() => {
        n()
        runs++
      })
      return 7
    })
    expect(result).toBe(7) // unlike run(), fn always executes
    expect(warn).toHaveBeenCalledOnce()
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(2) // unowned: nothing stopped it
    d()
    setN(2)
    expect(runs).toBe(2)
    warn.mockRestore()
  })

  it("an effect created inside a scoped effect's OWN first run is unowned (P0-1 corollary)", () => {
    // The blanket per-run scope clear cannot distinguish an owned first
    // run from a re-entered foreign run — so lazily-created nested
    // effects are always unowned; the author must dispose them manually
    // (e.g. onCleanup(innerDispose)).
    const [n, setN] = signal(0)
    const scope = effectScope()
    const innerRuns: number[] = []
    let innerDispose: Dispose | null = null
    scope.run(() => {
      effect(() => {
        if (innerDispose === null) {
          innerDispose = effect(() => {
            innerRuns.push(n())
          })
        }
      })
    })
    expect(innerRuns).toEqual([0])
    scope.stop()
    setN(1)
    expect(innerRuns).toEqual([0, 1]) // unowned: survived the scope
    innerDispose!()
    setN(2)
    expect(innerRuns).toEqual([0, 1])
  })

  it('getCurrentScope() reflects run() nesting and restores on exit', () => {
    expect(getCurrentScope()).toBeUndefined()
    const outer = effectScope()
    const inner = effectScope(true)
    outer.run(() => {
      expect(getCurrentScope()).toBe(outer)
      inner.run(() => {
        expect(getCurrentScope()).toBe(inner)
      })
      expect(getCurrentScope()).toBe(outer)
    })
    expect(getCurrentScope()).toBeUndefined()
  })

  it('onScopeDispose with no active scope is a safe no-op (dev-warns)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => onScopeDispose(() => {})).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('P0-1: an effect created inside a foreign effect re-run during a scoped block is NOT scope-owned', () => {
    // Synchronous push: the unbatched setTrigger(1) below drains the effect
    // queue inline at the write site, re-running the foreign effect while
    // scope A is current. The effect that the foreign body creates must not
    // be adopted by A (runEffect clears the current scope for the run).
    const [trigger, setTrigger] = signal(0)
    const [n, setN] = signal(0)
    const innerRuns: number[] = []
    let innerDispose: Dispose | null = null
    // Foreign effect, created OUTSIDE any scope; its body lazily creates a
    // new effect when trigger flips.
    const foreignDispose = effect(() => {
      if (trigger() === 1 && innerDispose === null) {
        innerDispose = effect(() => {
          innerRuns.push(n())
        })
      }
    })
    const scopeA = effectScope()
    scopeA.run(() => {
      // setup-like block: this write synchronously re-runs the foreign
      // effect at the write site while scope A is current.
      setTrigger(1)
    })
    expect(innerRuns).toEqual([0])
    scopeA.stop()
    // Not owned by A: the foreign-created effect still runs after A stops.
    setN(1)
    expect(innerRuns).toEqual([0, 1])
    // Manual dispose is the correct owner action for the unowned effect.
    innerDispose!()
    setN(2)
    expect(innerRuns).toEqual([0, 1])
    foreignDispose()
  })

  it('pool reuse across scope stop: recycled effect nodes never fire stale cleanups', () => {
    // Exceed MAX_POOL (8) create+stop cycles so later effects are certain
    // to reuse pooled nodes from earlier, cleanup-registering lifecycles.
    const [n, setN] = signal(0)
    let cleanupFires = 0
    for (let i = 0; i < 12; i++) {
      const scope = effectScope()
      scope.run(() => {
        effect((onCleanup) => {
          n()
          onCleanup(() => {
            cleanupFires++
          })
        })
      })
      scope.stop() // drains the pending cleanup exactly once
    }
    expect(cleanupFires).toBe(12)
    // Fresh effects on recycled nodes register no cleanups; a write must
    // not fire any cleanup left over from a prior lifecycle.
    const runs: number[] = []
    const d = effect(() => {
      runs.push(n())
    })
    setN(1)
    expect(cleanupFires).toBe(12)
    expect(runs).toEqual([0, 1])
    d()
  })

  it('runWithScope: registrations from an async boundary land in the captured scope', async () => {
    const scope = effectScope()
    let captured: EffectScope | undefined
    scope.run(() => {
      captured = getCurrentScope()
    })
    expect(captured).toBe(scope)
    await Promise.resolve() // async boundary — no scope is current here
    expect(getCurrentScope()).toBeUndefined()
    const fired: string[] = []
    const [n, setN] = signal(0)
    let runs = 0
    runWithScope(captured as EffectScope, () => {
      expect(getCurrentScope()).toBe(scope)
      onScopeDispose(() => fired.push('async-cleanup'))
      effect(() => {
        n()
        runs++
      })
    })
    expect(getCurrentScope()).toBeUndefined()
    setN(1)
    expect(runs).toBe(2)
    expect(fired).toEqual([])
    scope.stop()
    expect(fired).toEqual(['async-cleanup'])
    setN(2)
    expect(runs).toBe(2)
  })
})
