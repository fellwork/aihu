/**
 * `<aihu-markdown>` — a vanilla custom element that renders CommonMark markdown
 * to SAFE semantic HTML at runtime. No framework lock-in: it is a standard
 * `HTMLElement` subclass that works in any DOM, with or without aihu.
 *
 * Usage (declarative):
 *   <aihu-markdown># Hello\n\n**bold** and _italic_</aihu-markdown>
 *
 * Usage (signal-driven):
 *   const el = document.createElement('aihu-markdown') as AihuMarkdownElement
 *   el.source = src      // a string, OR a zero-arg signal reader () => string
 *   // `el.markdown` is an alias of `el.source` for ergonomics.
 *
 * When `source`/`markdown` is set to a signal reader, the element subscribes via
 * an aihu `effect()` and re-renders automatically whenever it changes — the
 * "signal-aware" half of the deliverable. Plain string assignment works too
 * (single render, no subscription). Mirrors the signal-aware <aihu-code>.
 *
 * The rendered HTML is dropped into a SHADOW ROOT (open mode): markdown output
 * carries its own structural markup (headings, lists, links, code), so isolating
 * it behind a shadow boundary keeps the host page's styles from leaking in and
 * vice-versa. Pair with `@kindly-note/themes-default` styles inside the shadow
 * root (e.g. via a `<link>` / adopted stylesheet) for the `kn-*` classes.
 *
 * Security: the HTML comes from `@kindly-note/render-markdown`, whose defaults
 * escape raw HTML and neutralise `javascript:`/unsafe `data:` URLs and `on*`
 * handlers, so it is safe to assign to `innerHTML` (see ./render-markdown.ts).
 *
 * The renderer is lazy-loaded on first render (see ./render-markdown.ts); the
 * render path is async, so a slow first load resolves into the shadow root once
 * the engine is ready. A render-id guard drops stale async writes.
 */

import { type Dispose, effect } from '@aihu/signals'
import { type RenderMarkdownOptions, renderMarkdown } from './render-markdown.ts'

/** A value that is either a plain string or a zero-arg signal reader. */
type StringOrReader = string | (() => string)

function readValue(v: StringOrReader | undefined): string {
  return typeof v === 'function' ? v() : (v ?? '')
}

/** The `<aihu-markdown>` tag name. */
export const AIHU_MARKDOWN_TAG = 'aihu-markdown'

/**
 * The public shape of an `<aihu-markdown>` instance. The concrete class extends
 * the ambient `HTMLElement`, which only exists in a DOM. Exposing the type
 * separately keeps this module import-safe on the server (SSR / node tests):
 * the class is created lazily inside {@link getAihuMarkdownElement}, so merely
 * importing the package never touches `HTMLElement`.
 */
export interface AihuMarkdownElement extends HTMLElement {
  /** Markdown source. Accepts a string or a signal reader `() => string`. */
  source: StringOrReader
  /** Alias of {@link source}, for ergonomics. Same backing field. */
  markdown: StringOrReader
  /**
   * Render options forwarded to `@kindly-note/render-markdown` (e.g.
   * `classPrefix`, `languages`, `urlPolicy`). Defaults to the engine's
   * security-first defaults when unset.
   */
  options: RenderMarkdownOptions | undefined
}

/** Constructor type for the lazily-created `<aihu-markdown>` class. */
export type AihuMarkdownElementConstructor = (new () => AihuMarkdownElement) & {
  readonly tagName: string
}

let _ctor: AihuMarkdownElementConstructor | undefined

/**
 * Lazily build (and memoize) the `<aihu-markdown>` class. Subclassing
 * `HTMLElement` happens here, NOT at module scope, so importing
 * `@aihu-plugin/kindly-note` is safe in environments without a DOM (SSR, node
 * test runners). Throws if called where `HTMLElement` is unavailable.
 */
export function getAihuMarkdownElement(): AihuMarkdownElementConstructor {
  if (_ctor) return _ctor
  if (typeof HTMLElement === 'undefined') {
    throw new TypeError(
      '<aihu-markdown> requires a DOM (HTMLElement). Call getAihuMarkdownElement()/defineMarkdownElement() in the browser, not during SSR.',
    )
  }

  class AihuMarkdown extends HTMLElement implements AihuMarkdownElement {
    static readonly tagName = AIHU_MARKDOWN_TAG

    // Backing field. May hold a signal reader; reading it inside the render
    // effect establishes the reactive subscription.
    #source: StringOrReader = ''
    #sourceExplicit = false
    #options: RenderMarkdownOptions | undefined

    #root: ShadowRoot
    #host: HTMLDivElement
    #dispose: Dispose | undefined
    // Monotonic render token — guards against a slow lazy-load resolving after
    // a newer render has already painted (stale async write).
    #renderId = 0

    constructor() {
      super()
      // Open shadow root: markdown output is structural HTML, so isolate it
      // behind a shadow boundary. A single <div> host holds the rendered markup
      // so re-renders only touch one subtree.
      this.#root = this.attachShadow({ mode: 'open' })
      this.#host = document.createElement('div')
      this.#host.setAttribute('part', 'markdown')
      this.#root.appendChild(this.#host)
    }

    connectedCallback(): void {
      // If `source` was never set explicitly, seed from the light-DOM text
      // content (declarative usage: <aihu-markdown># Hi</aihu-markdown>).
      if (!this.#sourceExplicit) {
        this.#source = this.textContent ?? ''
      }
      this.#startRender()
    }

    disconnectedCallback(): void {
      this.#dispose?.()
      this.#dispose = undefined
    }

    set source(v: StringOrReader) {
      this.#source = v
      this.#sourceExplicit = true
      if (this.isConnected) this.#startRender()
    }
    get source(): StringOrReader {
      return this.#source
    }

    // `markdown` is an alias of `source` — same backing field.
    set markdown(v: StringOrReader) {
      this.source = v
    }
    get markdown(): StringOrReader {
      return this.#source
    }

    set options(v: RenderMarkdownOptions | undefined) {
      this.#options = v
      if (this.isConnected) this.#startRender()
    }
    get options(): RenderMarkdownOptions | undefined {
      return this.#options
    }

    // Establish (or re-establish) the reactive render. effect() runs the body
    // synchronously now and re-runs whenever any signal read inside it changes —
    // this is what makes <aihu-markdown> signal-aware.
    #startRender(): void {
      this.#dispose?.()
      this.#dispose = effect(() => {
        const source = readValue(this.#source)
        this.#render(source)
      })
    }

    #render(source: string): void {
      const id = ++this.#renderId
      if (!source) {
        this.#paint(id, '')
        return
      }

      renderMarkdown(source, this.#options).then(
        (html) => this.#paint(id, html),
        () => {
          // The lazy import('@kindly-note/render-markdown') rejected — the peer
          // is not installed. Degrade to escaped plain text rather than leaving
          // the element blank or throwing into the effect; never inject the raw
          // source as HTML (it has not been through the safe emitter).
          this.#paintText(id, source)
        },
      )
    }

    // Rendered paint — SAFE semantic HTML from the kindly-note markdown emitter
    // (raw HTML escaped, dangerous URLs/handlers neutralised), so innerHTML is
    // safe here under the engine's default options.
    #paint(id: number, html: string): void {
      if (id !== this.#renderId) return
      this.#host.innerHTML = html
    }

    // Peer-missing fallback. Uses nodeValue/textContent so the DOM escapes the
    // source natively (no manual entity handling) — we never treat unrendered
    // source as trusted HTML.
    #paintText(id: number, text: string): void {
      if (id !== this.#renderId) return
      const node = this.#host.firstChild
      if (node && node.nodeType === 3 /* TEXT_NODE */ && this.#host.childNodes.length === 1) {
        node.nodeValue = text
      } else {
        this.#host.textContent = text
      }
    }
  }

  _ctor = AihuMarkdown as unknown as AihuMarkdownElementConstructor
  return _ctor
}

/**
 * Register the `<aihu-markdown>` custom element. Idempotent and SSR-safe: a
 * no-op when `customElements` is unavailable (server) or the tag is already
 * defined. Returns the resolved tag name.
 */
export function defineMarkdownElement(): string {
  if (typeof customElements === 'undefined') return AIHU_MARKDOWN_TAG
  if (!customElements.get(AIHU_MARKDOWN_TAG)) {
    customElements.define(AIHU_MARKDOWN_TAG, getAihuMarkdownElement())
  }
  return AIHU_MARKDOWN_TAG
}
