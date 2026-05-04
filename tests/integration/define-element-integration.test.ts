/**
 * Integration tests — `@scribe/runtime` x `@scribe/arbor` x
 * `@scribe/signals`.
 *
 * Per `.team/phase-4/spec-runtime.md` §4 Task 22.
 *
 * These are the first tests to exercise all three packages composed
 * together: runtime registers a custom element whose connectedCallback
 * uses arbor primitives backed by signals reactivity.
 */

import { branch, leaf, type MountScope, mount } from '@scribe/arbor'
import { defineElement } from '@scribe/runtime'
import { signal } from '@scribe/signals'
import { describe, expect, it } from 'vitest'

describe('runtime + arbor + signals integration', () => {
  it('full mount: signal write through arbor updates DOM via runtime-registered element (#1)', () => {
    const sig = signal('hello')
    const setText = sig[1]

    class XInt1 extends HTMLElement {
      #scope: MountScope | null = null
      connectedCallback() {
        const tree = branch('p', undefined, [leaf(sig)])
        this.#scope = mount(tree, this.shadowRoot ?? this)
      }
      disconnectedCallback() {
        this.#scope?.dispose()
        this.#scope = null
      }
    }
    defineElement('x-int-1', XInt1)

    const el = document.createElement('x-int-1')
    document.body.appendChild(el)
    const p = el.shadowRoot?.querySelector('p') as HTMLElement
    expect(p.textContent).toBe('hello')

    setText('world')
    expect(p.textContent).toBe('world')

    el.remove()
  })

  it('dispose on disconnect: scope effects torn down after el.remove() (#2)', () => {
    const sig = signal('first')
    const setText = sig[1]

    class XInt2 extends HTMLElement {
      #scope: MountScope | null = null
      connectedCallback() {
        const tree = branch('span', undefined, [leaf(sig)])
        this.#scope = mount(tree, this.shadowRoot ?? this)
      }
      disconnectedCallback() {
        this.#scope?.dispose()
        this.#scope = null
      }
    }
    defineElement('x-int-2', XInt2)

    const el = document.createElement('x-int-2')
    document.body.appendChild(el)
    const span = el.shadowRoot?.querySelector('span') as HTMLElement
    expect(span.textContent).toBe('first')

    // Capture the live text node reference; assert post-remove writes
    // do not update it (effect was disposed).
    const captured = span
    el.remove()

    setText('second')
    expect(captured.textContent).toBe('first')
  })
})
