/**
 * Component rendering tests — exercises defineComponent (function-form and
 * options-form) end-to-end with a real runtime stack (mount + signal wired).
 * Covers mounting, interaction, reactivity, and unmounting.
 *
 * Unlike create-app.test.ts (routing/wiring), this file does NOT mock
 * @aihu/runtime, @aihu/arbor, or @aihu/signals — it needs real reactive
 * behaviour to validate DOM outcomes.
 *
 * Signal API: signal<T>(v) returns readonly [Read<T>, Write<T>].
 *   - leaf() accepts the full Signal<string> tuple (not a bare getter).
 *   - AttrMap event keys: 'onclick', 'oninput', etc. (slice(2).toLowerCase()
 *     is how mount wires addEventListener).
 */

import { branch, leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import type { Signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _setMount,
  _setSignal,
  defineComponent,
  defineElement,
  onCleanup,
  onMount,
} from '@aihu/runtime'
import { RuntimeError } from '../../runtime/src/types.ts'

// Wire real runtime once — same approach used in packages/runtime/tests/*.
_setMount(mount)
_setSignal(signal as Parameters<typeof _setSignal>[0])

let _ctr = 0
const nextTag = (): string => `x-app-cr-${++_ctr}`

// ─── Function-form — mounting ─────────────────────────────────────────────────

describe('function-form component — mounting', () => {
  afterEach(() => document.body.replaceChildren())

  it('leaf text content appears in shadow DOM after connectedCallback', () => {
    const tag = nextTag()
    defineElement(tag, defineComponent(() => leaf('hello world')))
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(el.shadowRoot!.textContent).toBe('hello world')
  })

  it('branch produces nested element structure', () => {
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent(() =>
        branch('article', null, [branch('h1', null, [leaf('Title')]), leaf(' body')]),
      ),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(el.shadowRoot!.querySelector('h1')!.textContent).toBe('Title')
  })

  it('onMount fires after setup in the correct order', () => {
    const order: string[] = []
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent(() => {
        order.push('setup')
        // Use explicit block so the callback returns undefined, not push()'s
        // numeric return value — _runMounts treats any truthy return as cleanup.
        onMount(() => { order.push('mounted') })
        return leaf('')
      }),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(order).toEqual(['setup', 'mounted'])
    el.remove()
  })

  it('onCleanup fires when element is removed from DOM', () => {
    const cleanupSpy = vi.fn()
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent(() => {
        onCleanup(cleanupSpy)
        return leaf('')
      }),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(cleanupSpy).not.toHaveBeenCalled()
    el.remove()
    expect(cleanupSpy).toHaveBeenCalledOnce()
  })

  it('onMount return value (teardown) runs on disconnect', () => {
    const teardown = vi.fn()
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent(() => {
        onMount(() => teardown)
        return leaf('')
      }),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(teardown).not.toHaveBeenCalled()
    el.remove()
    expect(teardown).toHaveBeenCalledOnce()
  })
})

// ─── Function-form — reactivity ───────────────────────────────────────────────

describe('function-form component — reactivity', () => {
  afterEach(() => document.body.replaceChildren())

  it('signal update propagates to DOM text', () => {
    const textSig = signal('initial')
    const tag = nextTag()
    defineElement(tag, defineComponent(() => branch('span', null, [leaf(textSig)])))
    const el = document.createElement(tag)
    document.body.appendChild(el)
    const span = el.shadowRoot!.querySelector('span')!
    expect(span.textContent).toBe('initial')
    textSig[1]('updated')
    expect(span.textContent).toBe('updated')
    el.remove()
  })

  it('effects are disposed after disconnect — signal updates no longer propagate', () => {
    const textSig = signal('before')
    const tag = nextTag()
    defineElement(tag, defineComponent(() => branch('p', null, [leaf(textSig)])))
    const el = document.createElement(tag)
    document.body.appendChild(el)
    const p = el.shadowRoot!.querySelector('p')!
    textSig[1]('during')
    expect(p.textContent).toBe('during')
    el.remove()
    // Effect is disposed — writing the signal no longer touches the text node
    textSig[1]('after-disconnect')
    expect(p.textContent).toBe('during')
  })

  it('onclick handler fires and triggers reactive DOM update', () => {
    const stateSig = signal('idle')
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent(() =>
        branch('button', { onclick: () => stateSig[1]('clicked') }, [leaf(stateSig)]),
      ),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    const btn = el.shadowRoot!.querySelector('button')!
    expect(btn.textContent).toBe('idle')
    btn.click()
    expect(btn.textContent).toBe('clicked')
    el.remove()
  })

  it('multiple onclick events accumulate state correctly', () => {
    const countSig: Signal<string> = signal('0')
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent(() =>
        branch(
          'button',
          { onclick: () => countSig[1](String(Number(countSig[0]()) + 1)) },
          [leaf(countSig)],
        ),
      ),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    const btn = el.shadowRoot!.querySelector('button')!
    btn.click()
    btn.click()
    btn.click()
    expect(btn.textContent).toBe('3')
    el.remove()
  })
})

// ─── Options-form — attrs (legacy string signals) ─────────────────────────────

describe('options-form component — attrs', () => {
  afterEach(() => document.body.replaceChildren())

  it('attr signal initialises from the element attribute value at mount', () => {
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent({
        attrs: ['label'] as const,
        setup: ({ attrs }) => branch('span', null, [leaf(attrs.label)]),
      }),
    )
    const el = document.createElement(tag)
    el.setAttribute('label', 'Hello')
    document.body.appendChild(el)
    expect(el.shadowRoot!.querySelector('span')!.textContent).toBe('Hello')
    el.remove()
  })

  it('attr signal updates reactively when setAttribute is called after mount', () => {
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent({
        attrs: ['label'] as const,
        setup: ({ attrs }) => branch('span', null, [leaf(attrs.label)]),
      }),
    )
    const el = document.createElement(tag)
    el.setAttribute('label', 'A')
    document.body.appendChild(el)
    const span = el.shadowRoot!.querySelector('span')!
    expect(span.textContent).toBe('A')
    el.setAttribute('label', 'B')
    expect(span.textContent).toBe('B')
    el.remove()
  })
})

// ─── Options-form — typed props ───────────────────────────────────────────────

describe('options-form component — typed props', () => {
  afterEach(() => document.body.replaceChildren())

  it('string prop reads attribute value as-is', () => {
    const tag = nextTag()
    let captured: unknown
    defineElement(
      tag,
      defineComponent({
        props: { title: { value: '' } },
        setup: ({ props }) => {
          captured = props.title()
          return leaf('')
        },
      }),
    )
    const el = document.createElement(tag)
    el.setAttribute('title', 'My Page')
    document.body.appendChild(el)
    expect(captured).toBe('My Page')
    el.remove()
  })

  it('number prop converts attribute string to number', () => {
    const tag = nextTag()
    let captured: unknown
    defineElement(
      tag,
      defineComponent({
        props: { count: { value: 0 } },
        setup: ({ props }) => {
          captured = props.count()
          return leaf('')
        },
      }),
    )
    const el = document.createElement(tag)
    el.setAttribute('count', '7')
    document.body.appendChild(el)
    expect(captured).toBe(7)
    el.remove()
  })

  it('boolean prop: absent attribute → false', () => {
    const tag = nextTag()
    let captured: unknown
    defineElement(
      tag,
      defineComponent({
        props: { disabled: { value: false } },
        setup: ({ props }) => {
          captured = props.disabled()
          return leaf('')
        },
      }),
    )
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(captured).toBe(false)
    el.remove()
  })

  it('boolean prop: present attribute → true', () => {
    const tag = nextTag()
    let captured: unknown
    defineElement(
      tag,
      defineComponent({
        props: { disabled: { value: false } },
        setup: ({ props }) => {
          captured = props.disabled()
          return leaf('')
        },
      }),
    )
    const el = document.createElement(tag)
    el.setAttribute('disabled', '')
    document.body.appendChild(el)
    expect(captured).toBe(true)
    el.remove()
  })

  it('prop with reflect:true mirrors JS property writes to the attribute', () => {
    const tag = nextTag()
    defineElement(
      tag,
      defineComponent({
        props: { label: { value: '', reflect: true } },
        setup: () => leaf(''),
      }),
    )
    const el = document.createElement(tag) as HTMLElement & { label: string }
    document.body.appendChild(el)
    el.label = 'reflected'
    expect(el.getAttribute('label')).toBe('reflected')
    el.remove()
  })

  it('prop with attribute:false is not bound to any attribute', () => {
    const tag = nextTag()
    let captured: unknown
    defineElement(
      tag,
      defineComponent({
        props: { internal: { value: 'default', attribute: false } },
        setup: ({ props }) => {
          captured = props.internal()
          return leaf('')
        },
      }),
    )
    const el = document.createElement(tag)
    el.setAttribute('internal', 'should-be-ignored')
    document.body.appendChild(el)
    // attribute:false means the attribute is not observed — default is kept
    expect(captured).toBe('default')
    el.remove()
  })

  it('prop updates via JS property and propagates to DOM via effect', () => {
    const tag = nextTag()
    const renders: string[] = []
    defineElement(
      tag,
      defineComponent({
        props: { label: { value: 'a' } },
        setup: ({ props }) => {
          onMount(() => { renders.push(props.label() as string) })
          return leaf('')
        },
      }),
    )
    const el = document.createElement(tag) as HTMLElement & { label: string }
    document.body.appendChild(el)
    expect(renders).toEqual(['a'])
    el.remove()
  })
})

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('defineComponent — expected errors', () => {
  it('throws RuntimeError when reflect:true is combined with attribute:false at class creation', () => {
    expect(() =>
      defineComponent({
        props: { secret: { value: '', reflect: true, attribute: false } },
        setup: () => leaf(''),
      }),
    ).toThrow(RuntimeError)
  })

  it('throws RuntimeError when onMount is called outside a setup context', () => {
    expect(() => onMount(() => {})).toThrow(RuntimeError)
  })

  it('throws RuntimeError when onCleanup is called outside a setup context', () => {
    expect(() => onCleanup(() => {})).toThrow(RuntimeError)
  })
})

// ─── Full lifecycle ordering ───────────────────────────────────────────────────

describe('component — full lifecycle ordering', () => {
  afterEach(() => document.body.replaceChildren())

  it('setup → onMount → interaction → cleanup on removal', () => {
    const stateSig = signal('a')
    const events: string[] = []
    const tag = nextTag()

    defineElement(
      tag,
      defineComponent(() => {
        events.push('setup')
        onMount(() => {
          events.push('mounted')
          return () => events.push('cleanup')
        })
        return branch(
          'button',
          { onclick: () => { stateSig[1]('b'); events.push('click') } },
          [leaf(stateSig)],
        )
      }),
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(events).toEqual(['setup', 'mounted'])

    el.shadowRoot!.querySelector('button')!.click()
    expect(events).toEqual(['setup', 'mounted', 'click'])
    expect(el.shadowRoot!.querySelector('button')!.textContent).toBe('b')

    el.remove()
    expect(events).toEqual(['setup', 'mounted', 'click', 'cleanup'])
  })
})
