// @vitest-environment node
//
// NOT jsdom (the repo default). The whole claim under test is what happens
// when `HTMLElement` does NOT exist, and jsdom provides it — under the default
// environment every assertion here would pass vacuously against the very bug
// it is meant to catch.

/**
 * Every `@aihu/primitives` entry must be IMPORTABLE without a DOM.
 *
 * ## What broke
 *
 * `class AihuSwitchRoot extends HTMLElement {}` is evaluated at module LOAD,
 * not at construction or registration. Every primitive was written that way,
 * so `import '@aihu/primitives/switch'` threw
 * `ReferenceError: HTMLElement is not defined` in any runtime without a DOM.
 *
 * That is not a Node-test artifact. workerd — the real Cloudflare Workers
 * runtime this framework's `output: 'ssr'` mode targets — exposes
 * `HTMLRewriter` but NOT `HTMLElement`, `customElements`, `CSSStyleSheet`,
 * `document`, `Element` or `ElementInternals`. Probed against workerd
 * directly rather than assumed. So a `.aihu` component using the
 * `$extends`/`base:` recipe (`packages/ui/registry/switch/switch.aihu` and
 * friends) killed the whole request in a deployed Worker: the base import
 * happens inside the router's registry walk, which is not fail-soft.
 *
 * ## Why this file is a unit test and not only the e2e gate
 *
 * `packages/app/tests/workers-ssr-e2e.test.ts` assertion 15 covers the real
 * consumer path (a built Worker, driven). It is also a ~10s vite build that
 * only exercises the ONE primitive that fixture happens to extend. This file
 * covers every published entry in milliseconds, so a primitive added later
 * that forgets `HTMLElementBase` fails here immediately rather than only if
 * someone thinks to extend the fixture.
 *
 * ## Why `src/`, not `dist/`
 *
 * A `dist/` test would silently validate the last build. Vitest transforms the
 * TypeScript sources directly, so this runs against what is actually checked
 * in.
 */

import { describe, expect, it } from 'vitest'

/**
 * Every subpath in `packages/primitives/package.json#exports`, as its SOURCE
 * module. Kept as a literal list rather than derived from `exports`: the point
 * is that adding a primitive is a deliberate act that should also add a row
 * here, and a self-deriving list cannot fail when the package grows.
 *
 * `parity` below proves the list has not drifted from `exports`.
 */
const ENTRIES = [
  ['.', () => import('../src/index.ts')],
  ['./context', () => import('../src/dom-context.ts')],
  ['./presence-gate', () => import('../src/presence-gate/index.ts')],
  ['./form-control', () => import('../src/form-control/index.ts')],
  ['./config-provider', () => import('../src/config-provider/index.ts')],
  ['./roving-focus', () => import('../src/roving-focus/index.ts')],
  ['./collection', () => import('../src/collection/index.ts')],
  ['./dialog', () => import('../src/dialog/index.ts')],
  ['./focus-trap', () => import('../src/dialog/focus-trap.ts')],
  ['./tooltip', () => import('../src/tooltip/index.ts')],
  ['./button', () => import('../src/button/index.ts')],
  ['./separator', () => import('../src/separator/index.ts')],
  ['./label', () => import('../src/label/index.ts')],
  ['./input', () => import('../src/input/index.ts')],
  ['./textarea', () => import('../src/textarea/index.ts')],
  ['./checkbox', () => import('../src/checkbox/index.ts')],
  ['./switch', () => import('../src/switch/index.ts')],
  ['./radio-group', () => import('../src/radio-group/index.ts')],
  ['./slider', () => import('../src/slider/index.ts')],
  ['./popover', () => import('../src/popover/index.ts')],
] as const satisfies ReadonlyArray<readonly [string, () => Promise<unknown>]>

describe('@aihu/primitives imports without a DOM', () => {
  it('the environment really has no HTMLElement — otherwise this file proves nothing', () => {
    expect(typeof HTMLElement).toBe('undefined')
    expect(typeof customElements).toBe('undefined')
  })

  it('the entry list matches package.json#exports', async () => {
    const pkg = (await import('../package.json')) as unknown as {
      default: { exports: Record<string, unknown> }
    }
    expect(Object.keys(pkg.default.exports).sort()).toEqual(ENTRIES.map(([k]) => k).sort())
  })

  for (const [subpath, load] of ENTRIES) {
    it(`${subpath} loads`, async () => {
      // `.resolves` rather than a try/catch: a throw here must surface AS the
      // ReferenceError, so a future regression is self-describing.
      await expect(load()).resolves.toBeTruthy()
    })
  }

  it('the exported classes are real class objects, not undefined', async () => {
    const { AihuSwitchRoot, AihuButton, AihuTextControlBase } = await import('../src/index.ts')
    for (const C of [AihuSwitchRoot, AihuButton, AihuTextControlBase]) {
      expect(typeof C).toBe('function')
      // The prototype chain exists — `@aihu/runtime`'s `defineComponent` reads
      // `base.prototype.connectedCallback` when a `base:` is supplied, so a
      // stub that is not a constructor would break `$extends` at registration.
      expect(C.prototype).toBeTruthy()
    }
  })

  it('CONSTRUCTING one without a DOM throws a message that names the cause', async () => {
    const { AihuSwitchRoot } = await import('../src/switch/index.ts')
    // Deliberate: a silently-inert object would fail later, far from here,
    // with `this.setAttribute is not a function`.
    expect(() => new AihuSwitchRoot()).toThrow(/requires? a DOM|no-DOM placeholder/i)
  })

  /**
   * Importing is half the contract; CALLING `defineX()` is the other half, and
   * it is a SEPARATE bug that survived the import fix.
   *
   * A `.aihu` recipe that composes a primitive instead of extending it
   * (`before-after.aihu` → `defineSlider()`, `temperature.aihu` →
   * `defineRadioGroup()`) registers that primitive from its `@state` block —
   * which the compiler emits into the setup body that every SERVER render
   * executes. So `customElements.get(tag)` ran on a Worker and threw
   * `ReferenceError: customElements is not defined` on every request. Verified
   * on a real built Worker, not inferred.
   *
   * Enumerated from the barrel rather than listed by hand, so a primitive added
   * later cannot ship a registration entry point that skipped the guard.
   */
  describe('every defineX() is a no-op without a DOM', () => {
    it('finds the registration entry points to check', async () => {
      const mod = (await import('../src/index.ts')) as Record<string, unknown>
      const names = Object.keys(mod).filter((k) => /^define[A-Z]/.test(k))
      // 17 today. A LOWER number means the barrel stopped re-exporting them and
      // this suite silently checks less than it claims.
      expect(names.length).toBeGreaterThanOrEqual(17)
    })

    it('calling every one of them registers nothing and throws nothing', async () => {
      const mod = (await import('../src/index.ts')) as Record<string, unknown>
      const entries = Object.entries(mod).filter(
        ([k, v]) => /^define[A-Z]/.test(k) && typeof v === 'function',
      )
      for (const [name, fn] of entries) {
        // A tag argument for the ones that take one; ignored by the rest.
        // `defineButton` REQUIRES one, so this is not optional.
        expect(
          () => (fn as (t?: string) => unknown)(`aihu-nodom-${name.toLowerCase()}`),
          name,
        ).not.toThrow()
      }
      // Called twice: the idempotence memo must not have been poisoned into a
      // state where a later call in a real DOM would be skipped.
      for (const [name, fn] of entries) {
        expect(
          () => (fn as (t?: string) => unknown)(`aihu-nodom-${name.toLowerCase()}`),
          name,
        ).not.toThrow()
      }
      expect(typeof customElements).toBe('undefined')
    })

    it('defineButton still returns the base class, not undefined', async () => {
      const { defineButton, AihuButton } = await import('../src/button/index.ts')
      // Its return value is part of the API (`const Base = defineButton('x')`),
      // so the no-DOM early return has to keep it, not fall off the end.
      expect(defineButton('aihu-nodom-button-return')).toBe(AihuButton)
    })
  })

  it('HTMLElementBase is exported for userland `$extends` base classes', async () => {
    const { HTMLElementBase } = await import('../src/html-element-base.ts')
    expect(typeof HTMLElementBase).toBe('function')
    // Subclassing it is exactly what a userland base does; that must not throw
    // at DECLARATION time, only at construction.
    expect(() => {
      class UserBase extends HTMLElementBase {}
      return UserBase
    }).not.toThrow()
  })
})
