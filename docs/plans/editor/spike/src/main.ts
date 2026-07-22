// Phase-0 spike harness bootstrap. Exposes window.__spike for the Playwright
// scenarios and for manual poking (see FINDINGS.md manual IME script).

import { blockText, type Doc, EditorCore, freshId, type Mark } from './model.ts'
import { readDomSelection, writeDomSelection } from './position-map.ts'
import { EditorView } from './view.ts'

declare global {
  interface Window {
    __spike: SpikeApi
  }
}

interface SpikeApi {
  core: EditorCore
  view: EditorView
  reset(paragraphs: Array<Array<{ text: string; mark: Mark }>>): void
  getDoc(): Array<{ id: string; runs: Array<{ text: string; mark: Mark }> }>
  getText(): string[]
  getDomText(): string[]
  trCount(): number
  trOrigins(): string[]
  setCaret(blockIndex: number, offset: number): void
  setRange(blockIndex: number, from: number, to: number): void
  toggleBold(): void
  modelSelection(): unknown
  viewLog(): Array<{ kind: string; detail?: string }>
}

function boot() {
  const root = document.getElementById('editor') as HTMLElement
  const status = document.getElementById('status') as HTMLElement

  let core = new EditorCore()
  let view = new EditorView(root, core)

  const render = () => {
    status.textContent = JSON.stringify(
      {
        trs: core.transactions.length,
        doc: core.doc.blocks.map((b) => ({ id: b.id, runs: b.runs })),
      },
      null,
      1,
    )
  }
  core.onTransaction(render)
  render()

  const api: SpikeApi = {
    get core() {
      return core
    },
    get view() {
      return view
    },
    reset(paragraphs) {
      const doc: Doc = {
        blocks: paragraphs.map((runs) => ({
          id: freshId(),
          runs: runs.map((r) => ({ text: r.text, mark: r.mark })),
        })),
      }
      view.destroy()
      core = new EditorCore(doc.blocks.length > 0 ? doc : undefined)
      view = new EditorView(root, core)
      core.onTransaction(render)
      render()
    },
    getDoc() {
      return core.doc.blocks.map((b) => ({ id: b.id, runs: b.runs.map((r) => ({ ...r })) }))
    },
    getText() {
      return core.doc.blocks.map((b) => blockText(b))
    },
    getDomText() {
      return Array.from(root.querySelectorAll('[data-block-id]')).map((el) => el.textContent ?? '')
    },
    trCount() {
      return core.transactions.length
    },
    trOrigins() {
      return core.transactions.map((t) => t.origin)
    },
    setCaret(blockIndex, offset) {
      root.focus()
      const b = core.doc.blocks[blockIndex]
      writeDomSelection(root, { block: b.id, offset }, { block: b.id, offset })
    },
    setRange(blockIndex, from, to) {
      root.focus()
      const b = core.doc.blocks[blockIndex]
      writeDomSelection(root, { block: b.id, offset: from }, { block: b.id, offset: to })
    },
    toggleBold() {
      // Read the DOM selection directly: the document's `selectionchange`
      // event is async, so core.selection may lag a just-written range.
      const sel = readDomSelection(root)
      if (!sel || sel.anchor.block !== sel.head.block) return
      view.toggleBold(
        sel.anchor.block,
        Math.min(sel.anchor.offset, sel.head.offset),
        Math.max(sel.anchor.offset, sel.head.offset),
      )
    },
    modelSelection() {
      return core.selection
    },
    viewLog() {
      return view.log.map((e) => ({ kind: e.kind, detail: e.detail }))
    },
  }
  window.__spike = api
}

boot()
