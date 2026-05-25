/**
 * `<aihu-collection>` — descendant-registration substrate (the Radix
 * `Collection` pattern) implemented over the DOM-walk context. Descendants call
 * `register(el)` on connect (getting back an unregister disposer for
 * disconnect); the collection keeps its `items` signal in DOM order. The
 * substrate `roving-focus`, menu-style, and future list primitives build on.
 * Structural — no ARIA, no CSS.
 *
 * Owned signals: `items` — ordered signal array of registered descendants.
 * Context: provides `collectionContext` exposing `{ register, items }`.
 */

import { type Read, signal } from '@aihu/signals'
import { createDomContext, provideContext } from '../dom-context.ts'

export interface CollectionContextValue {
  /** Register `el`; returns a disposer that unregisters it. */
  register(el: Element): () => void
  /** Registered descendants, kept in DOM order. */
  readonly items: Read<Element[]>
}

export const collectionContext = createDomContext<CollectionContextValue>('collection')

/** Sort a set of elements into DOM (document) order. */
function sortDomOrder(els: Set<Element>): Element[] {
  return [...els].sort((a, b) => {
    const rel = a.compareDocumentPosition(b)
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1
    if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1
    return 0
  })
}

/** The registration mechanism, usable standalone (roving-focus reuses it). */
export function createCollection(): CollectionContextValue {
  const members = new Set<Element>()
  const [items, setItems] = signal<Element[]>([])
  const resync = (): void => {
    setItems(sortDomOrder(members))
  }
  return {
    items,
    register(el: Element): () => void {
      members.add(el)
      resync()
      return () => {
        members.delete(el)
        resync()
      }
    },
  }
}

export class AihuCollection extends HTMLElement {
  private readonly _collection = createCollection()

  /** Registered descendants in DOM order. */
  get items(): Read<Element[]> {
    return this._collection.items
  }

  /** Register `el` into this collection; returns an unregister disposer. */
  register(el: Element): () => void {
    return this._collection.register(el)
  }

  constructor() {
    super()
    provideContext(this, collectionContext, this._collection)
  }
}

let _defined = false
/** Register `<aihu-collection>` (idempotent). */
export function defineCollection(tag = 'aihu-collection'): void {
  if (_defined || customElements.get(tag)) {
    _defined = true
    return
  }
  customElements.define(tag, AihuCollection)
  _defined = true
}
