/**
 * `<aihu-code>` — a vanilla custom element that renders runtime
 * syntax-highlighted code. No framework lock-in: it is a standard
 * `HTMLElement` subclass that works in any DOM, with or without aihu.
 *
 * Usage (declarative):
 *   <aihu-code lang="typescript">const x: number = 1</aihu-code>
 *
 * Usage (signal-driven):
 *   const el = document.createElement('aihu-code') as AihuCodeElement
 *   el.language = lang    // a string, OR a zero-arg signal reader () => string
 *   el.code = source      // a string, OR a zero-arg signal reader () => string
 *
 * The JS property is `language` (not `lang`) so it does not clobber the native
 * `HTMLElement.lang`. The declarative `lang="…"` attribute still works.
 *
 * When `language`/`code` are set to signal readers, the element subscribes via
 * an aihu `effect()` and re-highlights automatically whenever either changes —
 * the "signal-aware" half of the deliverable. Plain string assignment works
 * too (single render, no subscription).
 *
 * The language tokenizer is lazy-loaded on first render (see ./highlight.ts);
 * highlighting is async, so the element shows the escaped raw source
 * immediately and swaps in the scoped-span markup when the language resolves.
 *
 * SCOPE NOTE: this is the highlighting element only. `<aihu-markdown>` /
 * `renderMarkdown` are out of scope (blocked on the unbuilt
 * `@kindly-note/emitters-markdown` + kindly-note repo org access).
 */

import { type Dispose, effect } from '@aihu/signals'
import { highlight } from './highlight.ts'

/** A value that is either a plain string or a zero-arg signal reader. */
type StringOrReader = string | (() => string)

function readValue(v: StringOrReader | undefined): string {
  return typeof v === 'function' ? v() : (v ?? '')
}

/** The `<aihu-code>` tag name. */
export const AIHU_CODE_TAG = 'aihu-code'

/**
 * The public shape of an `<aihu-code>` instance. The concrete class extends the
 * ambient `HTMLElement`, which only exists in a DOM. Exposing the type
 * separately keeps this module import-safe on the server (SSR / node tests):
 * the class is created lazily inside {@link getAihuCodeElement}, so merely
 * importing the package never touches `HTMLElement`.
 */
export interface AihuCodeElement extends HTMLElement {
  /**
   * Language id. Accepts a string or a signal reader `() => string`.
   *
   * Named `language` (not `lang`) so it does not collide with the native
   * `HTMLElement.lang` reflected attribute, whose type is `string`. The
   * declarative `lang="…"` *attribute* still works and feeds this property.
   */
  language: StringOrReader
  /** Source code. Accepts a string or a signal reader `() => string`. */
  code: StringOrReader
}

/** Constructor type for the lazily-created `<aihu-code>` class. */
export type AihuCodeElementConstructor = (new () => AihuCodeElement) & {
  readonly tagName: string
  readonly observedAttributes: readonly string[]
}

let _ctor: AihuCodeElementConstructor | undefined

/**
 * Lazily build (and memoize) the `<aihu-code>` class. Subclassing `HTMLElement`
 * happens here, NOT at module scope, so importing `@aihu-plugin/kindly-note` is
 * safe in environments without a DOM (SSR, node test runners). Throws if called
 * where `HTMLElement` is unavailable.
 */
export function getAihuCodeElement(): AihuCodeElementConstructor {
  if (_ctor) return _ctor
  if (typeof HTMLElement === 'undefined') {
    throw new TypeError(
      '<aihu-code> requires a DOM (HTMLElement). Call getAihuCodeElement()/defineCodeElement() in the browser, not during SSR.',
    )
  }

  class AihuCode extends HTMLElement implements AihuCodeElement {
    static readonly tagName = AIHU_CODE_TAG
    static get observedAttributes(): readonly string[] {
      return ['lang']
    }

    // Backing fields. Either may hold a signal reader; reading them inside the
    // render effect establishes the reactive subscription.
    #lang: StringOrReader = ''
    #code: StringOrReader = ''
    #codeExplicit = false

    #pre: HTMLPreElement
    #codeEl: HTMLElement
    #dispose: Dispose | undefined
    // Monotonic render token — guards against a slow lazy-load resolving after
    // a newer render has already painted (stale async write).
    #renderId = 0

    constructor() {
      super()
      this.#pre = document.createElement('pre')
      this.#codeEl = document.createElement('code')
      this.#pre.appendChild(this.#codeEl)
    }

    connectedCallback(): void {
      // If `code` was never set explicitly, seed from the light-DOM text content
      // (declarative usage: <aihu-code lang="ts">source here</aihu-code>).
      if (!this.#codeExplicit) {
        this.#code = this.textContent ?? ''
      }
      // Replace any light-DOM text with our <pre><code> shell once.
      if (this.#pre.parentNode !== this) {
        this.textContent = ''
        this.appendChild(this.#pre)
      }
      this.#startRender()
    }

    disconnectedCallback(): void {
      this.#dispose?.()
      this.#dispose = undefined
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      if (name === 'lang' && typeof this.#lang !== 'function') {
        this.#lang = value ?? ''
        if (this.isConnected) this.#startRender()
      }
    }

    set language(v: StringOrReader) {
      this.#lang = v
      if (this.isConnected) this.#startRender()
    }
    get language(): StringOrReader {
      return this.#lang
    }

    set code(v: StringOrReader) {
      this.#code = v
      this.#codeExplicit = true
      if (this.isConnected) this.#startRender()
    }
    get code(): StringOrReader {
      return this.#code
    }

    // Establish (or re-establish) the reactive render. effect() runs the body
    // synchronously now and re-runs whenever any signal read inside it changes —
    // this is what makes <aihu-code> signal-aware.
    #startRender(): void {
      this.#dispose?.()
      this.#dispose = effect(() => {
        const lang = readValue(this.#lang)
        const source = readValue(this.#code)
        this.#render(source, lang)
      })
    }

    #render(source: string, lang: string): void {
      const id = ++this.#renderId
      // Reflect the active language on the <code> element for theming hooks.
      if (lang) this.#codeEl.setAttribute('data-lang', lang)
      else this.#codeEl.removeAttribute('data-lang')

      // Show plain source immediately (synchronous, no flash of empty content),
      // then swap in highlighted markup once the (possibly lazy-loaded) language
      // resolves. The render-id guard drops the async write if superseded.
      this.#paintText(id, source)
      if (!lang || !source) return

      highlight(source, lang).then(
        (out) => {
          if (out.fallback) return // keep the plain-text paint
          this.#paintHtml(id, out.html)
        },
        () => {
          /* highlight() never rejects; defensive no-op */
        },
      )
    }

    // Plain-text paint. Uses nodeValue on a single text node when possible
    // (122x faster targeted update, per aihu convention); the DOM escapes the
    // text natively, so no manual entity handling is needed.
    #paintText(id: number, text: string): void {
      if (id !== this.#renderId) return
      const node = this.#codeEl.firstChild
      if (node && node.nodeType === 3 /* TEXT_NODE */ && this.#codeEl.childNodes.length === 1) {
        node.nodeValue = text
      } else {
        this.#codeEl.textContent = text
      }
    }

    // Highlighted paint — scoped-span markup from the kindly-note emitter.
    #paintHtml(id: number, html: string): void {
      if (id !== this.#renderId) return
      this.#codeEl.innerHTML = html
    }
  }

  _ctor = AihuCode as unknown as AihuCodeElementConstructor
  return _ctor
}

/**
 * Register the `<aihu-code>` custom element. Idempotent and SSR-safe: a no-op
 * when `customElements` is unavailable (server) or the tag is already defined.
 * Returns the resolved tag name.
 */
export function defineCodeElement(): string {
  if (typeof customElements === 'undefined') return AIHU_CODE_TAG
  if (!customElements.get(AIHU_CODE_TAG)) {
    customElements.define(AIHU_CODE_TAG, getAihuCodeElement())
  }
  return AIHU_CODE_TAG
}
