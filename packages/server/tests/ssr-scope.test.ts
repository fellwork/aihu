/**
 * SSR ownership (effect-scope plan §3): every `component()` factory call the
 * server makes runs the component's full setup body — effects/computeds
 * created there (directly or via composables) MUST be disposed when the
 * render terminates, on every terminal path:
 *
 *   - walk done / last boundary closed (normal completion)
 *   - sync factory throw
 *   - walk / boundary error
 *   - consumer cancel() with a boundary still PENDING (the D1 case: client
 *     disconnect or streaming timeout — no completion path ever runs)
 *
 * The wrap changes LIFECYCLE only — rendered bytes are identical with and
 * without setup-created effects.
 *
 * The compiled ssr-string fast path (`__aihu_ssr_string__`) renders HTML
 * from props WITHOUT calling `component()`/setup — it creates no reactive
 * tree and deliberately has no scope wrap (nothing here tests it).
 */

import { effect, signal } from '@aihu/signals'
import { afterEach, describe, expect, it } from 'vitest'
import type { NativeAddon, NativeState } from '../src/native.ts'
import { _resetNativeState, _setNativeState, renderToStringNative } from '../src/native.ts'
import { renderToStream, renderToString } from '../src/ssr.ts'
import type { DataSource } from '../src/stream-types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function drain(stream: ReadableStream<string>): Promise<string> {
  const chunks: string[] = []
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return chunks.join('')
}

/** A modern-dialect tree the TS walker renders. */
function tree(text: string): unknown {
  return {
    kind: 'branch',
    tag: 'div',
    attrs: {},
    children: [{ kind: 'leaf', leafKind: 'text', value: text }],
  }
}

/** A manually-controlled pending DataSource (same shape ssr-stream.test.ts
 * uses). `resolve` is a stable forwarder — the real resolver only exists
 * after the walk registers onReady, so it must be read through indirection,
 * not captured by value at construction. */
function pendingSource(): { source: DataSource<null>; resolve: () => void } {
  let inner: () => void = () => {
    throw new Error('resolve() called before the walk registered onReady')
  }
  const source: DataSource<null> = {
    status: 'pending' as 'pending' | 'ready' | 'error',
    value: undefined,
    error: undefined,
    onReady(cb) {
      inner = () => {
        ;(source as unknown as Record<string, unknown>).status = 'ready'
        cb()
      }
      return () => {}
    },
  }
  return { source, resolve: () => inner() }
}

// ---------------------------------------------------------------------------
// TS path — renderToStream / renderToString
// ---------------------------------------------------------------------------

describe('SSR effect-scope ownership (TS path)', () => {
  it('disposes a setup-created effect after a completed render (the leak test)', async () => {
    const [get, set] = signal(0)
    let runs = 0
    const component = () => {
      effect(() => {
        runs++
        get()
      })
      return tree('leak')
    }

    const html = await renderToString(component)
    expect(html).toContain('leak')
    expect(runs).toBe(1) // the effect's initial run during setup

    // Without the per-render scope wrap this write re-runs the leaked
    // effect (runs -> 2). With the wrap the effect is disposed at render
    // termination and stays inert.
    set(1)
    expect(runs).toBe(1)
  })

  it('disposes the scope on consumer cancel() with a boundary still pending (D1)', async () => {
    const [get, set] = signal(0)
    let runs = 0
    const { source } = pendingSource()

    const component = () => {
      effect(() => {
        runs++
        get()
      })
      return {
        kind: 'branch',
        tag: 'div',
        attrs: {},
        children: [{ kind: 'leaf', leafKind: 'text', value: 'suspended' }],
        dataSource: source,
      }
    }

    const stream = renderToStream(component, { head: { title: 'D1' } })
    const reader = stream.getReader()
    await reader.read() // preamble — render is underway, boundary pending

    // The scope must stay ALIVE while the boundary is pending (a suspended
    // boundary may still read the tree): a write here re-runs the effect.
    set(1)
    expect(runs).toBe(2)

    // Client disconnects. No completion path will ever run — cancel() is
    // the only terminal left and must dispose the scope.
    await reader.cancel()

    set(2)
    expect(runs).toBe(2) // inert — disposed by cancel()
  })

  it('disposes the scope at the last-boundary NORMAL close (resolved boundary, full drain)', async () => {
    const [get, set] = signal(0)
    let runs = 0
    const { source, resolve } = pendingSource()

    const component = () => {
      effect(() => {
        runs++
        get()
      })
      return {
        kind: 'branch',
        tag: 'div',
        attrs: {},
        children: [{ kind: 'leaf', leafKind: 'text', value: 'boundary content' }],
        dataSource: source,
      }
    }

    const stream = renderToStream(component, { head: { title: 'Close' } })
    const reader = stream.getReader()

    // Preamble arrives while the boundary is still pending; the scope is
    // alive (a write re-runs the effect).
    const first = await reader.read()
    expect(first.value).toContain('<!DOCTYPE html>')
    set(1)
    expect(runs).toBe(2)

    // Resolve the boundary and drain to completion — this exercises the
    // last-boundary-close terminal (onReady -> count 0 && walkDone ->
    // emitStateScriptAndClose -> dispose), NOT cancel and NOT any error.
    resolve()
    const chunks: string[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    reader.releaseLock()
    expect(chunks.join('')).toContain('boundary content')

    set(2)
    expect(runs).toBe(2) // inert — disposed at the normal boundary close
  })

  it('disposes the scope on the sync-walk dataSource error terminal', async () => {
    const [get, set] = signal(0)
    let runs = 0
    const errorSource: DataSource<null> = {
      status: 'error',
      value: undefined,
      error: new Error('data source failed'),
      onReady: () => () => {},
    }

    const component = () => {
      effect(() => {
        runs++
        get()
      })
      return {
        kind: 'branch',
        tag: 'div',
        attrs: {},
        children: [{ kind: 'leaf', leafKind: 'text', value: 'never rendered' }],
        dataSource: errorSource,
      }
    }

    // The sync walk hits status === 'error' -> controller.error(...) -> the
    // stream settles as errored. NOTE: this terminal's dispose() site is
    // backstopped by the walk's .catch (the .then's emit throws against the
    // errored controller and the chained .catch disposes), so this test
    // guards the error-terminal FAMILY — it fails when both the site and the
    // .catch backstop are removed, not the site alone. The isolatable error
    // terminal is the async boundary-error test below.
    await expect(drain(renderToStream(component))).rejects.toThrow('data source failed')
    expect(runs).toBe(1)

    set(1)
    expect(runs).toBe(1) // inert — disposed on the error terminal
  })

  it('disposes the scope when a PENDING boundary resolves to error (onReady error terminal)', async () => {
    const [get, set] = signal(0)
    let runs = 0

    // A pending source that later transitions to ERROR. This is the one
    // error terminal with NO backstop: the walk promise already resolved
    // with count === 1 (so .then emitted nothing and .catch never fires) —
    // only the onReady handler's own dispose() covers it.
    let failNow: () => void = () => {
      throw new Error('failNow() called before the walk registered onReady')
    }
    const source: DataSource<null> = {
      status: 'pending' as 'pending' | 'ready' | 'error',
      value: undefined,
      error: undefined,
      onReady(cb) {
        failNow = () => {
          ;(source as unknown as Record<string, unknown>).status = 'error'
          ;(source as unknown as Record<string, unknown>).error = new Error('boundary failed late')
          cb()
        }
        return () => {}
      },
    }

    const component = () => {
      effect(() => {
        runs++
        get()
      })
      return {
        kind: 'branch',
        tag: 'div',
        attrs: {},
        children: [{ kind: 'leaf', leafKind: 'text', value: 'never streamed' }],
        dataSource: source,
      }
    }

    const stream = renderToStream(component)
    const reader = stream.getReader()
    await reader.read() // walk is past the boundary; scope alive, boundary pending

    failNow()
    await expect(async () => {
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
    }).rejects.toThrow('boundary failed late')
    reader.releaseLock()

    set(1)
    expect(runs).toBe(1) // inert — disposed by the onReady error terminal
  })

  it('isolates scopes across two sequential renders', async () => {
    const [getA, setA] = signal(0)
    const [getB, setB] = signal(0)
    let runsA = 0
    let runsB = 0

    const htmlA = await renderToString(() => {
      effect(() => {
        runsA++
        getA()
      })
      return tree('same')
    })
    setA(1)
    expect(runsA).toBe(1) // render A's effect already disposed

    const htmlB = await renderToString(() => {
      effect(() => {
        runsB++
        getB()
      })
      return tree('same')
    })
    setB(1)
    expect(runsB).toBe(1) // render B got a FRESH scope, also disposed

    setA(2)
    expect(runsA).toBe(1) // still inert — B's render did not revive A

    expect(htmlA).toBe(htmlB)
  })

  it('produces byte-identical output with and without setup-created effects', async () => {
    const [get] = signal(0)
    const withEffect = () => {
      effect(() => {
        get()
      })
      return tree('bytes')
    }
    const withoutEffect = () => tree('bytes')

    expect(await renderToString(withEffect)).toBe(await renderToString(withoutEffect))
    expect(await renderToString(withEffect, { hydratable: true })).toBe(
      await renderToString(withoutEffect, { hydratable: true }),
    )
    expect(await renderToString(withEffect, { head: { title: 'B' } })).toBe(
      await renderToString(withoutEffect, { head: { title: 'B' } }),
    )
  })

  it('disposes effects created before a sync factory throw', async () => {
    const [get, set] = signal(0)
    let runs = 0
    const component = () => {
      effect(() => {
        runs++
        get()
      })
      throw new Error('setup exploded')
    }

    await expect(drain(renderToStream(component))).rejects.toThrow('setup exploded')
    expect(runs).toBe(1)

    set(1)
    expect(runs).toBe(1) // disposed on the factory-throw terminal
  })
})

// ---------------------------------------------------------------------------
// Native path — renderToStringNative with a stub addon
// ---------------------------------------------------------------------------

describe('SSR effect-scope ownership (native path)', () => {
  afterEach(() => {
    _resetNativeState()
  })

  function stubNativeLoaded(): void {
    const addon: NativeAddon = {
      renderTree: () => '<div>native</div>',
      renderDocument: () => '<!DOCTYPE html><html><body><div>native</div></body></html>',
    }
    const state: NativeState = {
      kind: 'native-loaded',
      addon,
      descriptor: { platformId: 'test', packageName: 'test', nodeFile: 'test.node' },
    }
    _setNativeState(state)
  }

  it('disposes a setup-created effect after a native render', async () => {
    stubNativeLoaded()
    const [get, set] = signal(0)
    let runs = 0
    const component = () => {
      effect(() => {
        runs++
        get()
      })
      // Legacy-dialect tree (no `value`/`leafKind`) so the stub addon is
      // actually reached instead of the dialect-guard TS fallback.
      return { kind: 'leaf', text: 'native' }
    }

    const html = await renderToStringNative(component)
    expect(html).toContain('native')
    expect(runs).toBe(1)

    set(1)
    expect(runs).toBe(1) // disposed by the finally-phase scope.stop()
  })

  it('disposes effects when the factory throws under the native path', async () => {
    stubNativeLoaded()
    const [get, set] = signal(0)
    let runs = 0
    const component = () => {
      effect(() => {
        runs++
        get()
      })
      throw new Error('native setup exploded')
    }

    await expect(renderToStringNative(component)).rejects.toThrow('native setup exploded')
    set(1)
    expect(runs).toBe(1)
  })

  it('keeps the scope alive through the dialect-guard TS fallback, then disposes', async () => {
    stubNativeLoaded()
    const [get, set] = signal(0)
    let runs = 0
    const component = () => {
      effect(() => {
        runs++
        get()
      })
      // MODERN-dialect tree -> _nativeDialectSupports() is false -> the
      // async TS walker renders it; the scope must survive that walk.
      return tree('fallback')
    }

    const html = await renderToStringNative(component)
    expect(html).toContain('fallback')

    set(1)
    expect(runs).toBe(1) // disposed after the awaited fallback completed
  })
})
