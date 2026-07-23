/**
 * Unit tests for `useMouse` — the reference sensor composable (effect-scope
 * plan §5): mousemove tracking through the named-getter return shape,
 * `initialValue`, coordinate `type`, scope cleanup, and the SSR-static
 * path (simulated `!isClient` via module re-evaluation). jsdom environment
 * (root vitest config).
 */
import { effect, effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useMouse } from '../src/useMouse/index.ts'
import { withSSR } from './_ssr.ts'

function move(x: number, y: number, target: EventTarget = window): void {
  target.dispatchEvent(
    new MouseEvent('mousemove', { clientX: x, clientY: y, screenX: x + 1000, screenY: y + 1000 }),
  )
}

describe('@aihu/use/useMouse', () => {
  it('starts at the default initial value (0,0)', () => {
    const { x, y } = useMouse()
    expect(x()).toBe(0)
    expect(y()).toBe(0)
  })

  it('respects a custom initialValue', () => {
    const { x, y } = useMouse({ initialValue: { x: 10, y: 20 } })
    expect(x()).toBe(10)
    expect(y()).toBe(20)
  })

  it('tracks mousemove on window: getters update', () => {
    const { x, y } = useMouse()
    move(33, 44)
    expect(x()).toBe(33)
    expect(y()).toBe(44)
    move(55, 66)
    expect(x()).toBe(55)
    expect(y()).toBe(66)
  })

  it('the getters are reactive — an effect reading them re-runs on mousemove', () => {
    const { x, y } = useMouse()
    const seen: Array<[number, number]> = []
    const dispose = effect(() => {
      seen.push([x(), y()])
    })
    move(7, 8)
    expect(seen).toEqual([
      [0, 0],
      [7, 8],
    ])
    dispose()
  })

  it("type: 'screen' reports screen coordinates", () => {
    const { x, y } = useMouse({ type: 'screen' })
    move(5, 6)
    expect(x()).toBe(1005)
    expect(y()).toBe(1006)
  })

  it("type: 'page' reports page coordinates", () => {
    const { x, y } = useMouse({ type: 'page' })
    // jsdom computes pageX/Y from the event; assert against the event's own
    // values so the test is independent of jsdom's scroll model.
    const ev = new MouseEvent('mousemove', { clientX: 12, clientY: 34 })
    window.dispatchEvent(ev)
    expect(x()).toBe(ev.pageX)
    expect(y()).toBe(ev.pageY)
  })

  it('explicit target: null registers NO listener (null-vs-undefined rule)', () => {
    // Only an OMITTED target falls back to window; explicit null = nothing.
    const { x, y } = useMouse({ target: null, initialValue: { x: 5, y: 6 } })
    move(50, 60) // window mousemove must NOT be observed
    expect(x()).toBe(5)
    expect(y()).toBe(6)
  })

  it('initialValue is snapshotted — later mutation of the passed object has no effect', () => {
    const initial = { x: 1, y: 2 }
    const { x, y } = useMouse({ target: null, initialValue: initial })
    initial.x = 999
    initial.y = 999
    expect(x()).toBe(1)
    expect(y()).toBe(2)
  })

  it('listens on a custom element target', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { x, y } = useMouse({ target: el })
    // A move elsewhere does not reach the element target.
    move(1, 2, document.createElement('span'))
    expect(x()).toBe(0)
    move(9, 9, el)
    expect(x()).toBe(9)
    expect(y()).toBe(9)
  })

  it('scope.stop() removes the listener (getters freeze)', () => {
    const scope = effectScope()
    const mouse = scope.run(() => useMouse()) as ReturnType<typeof useMouse>
    move(1, 2)
    expect(mouse.x()).toBe(1)

    scope.stop()
    move(100, 200)
    expect(mouse.x()).toBe(1)
    expect(mouse.y()).toBe(2)
  })
})

describe('@aihu/use/useMouse — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns static getters of the initial value and registers nothing', () =>
    withSSR(
      () => import('../src/useMouse/index.ts'),
      (mod) => {
        let mouse: { x: () => number; y: () => number } | undefined
        expect(() => {
          mouse = mod.useMouse({ initialValue: { x: 3, y: 4 } })
        }).not.toThrow()
        expect(mouse?.x()).toBe(3)
        expect(mouse?.y()).toBe(4)

        // Default initial value under SSR.
        const zero = mod.useMouse()
        expect(zero.x()).toBe(0)
        expect(zero.y()).toBe(0)
      },
    ))
})
