// Browser harness for the e2e suite: a real EditorCore + EditorView with a
// window.__editor control surface the specs drive. Blocks are addressed by
// ORDINAL inline-container index (tests don't know generated ids).

import type { AgentAccess } from '../src/agent-gateway.ts'
import { AgentGateway } from '../src/agent-gateway.ts'
import type { Command } from '../src/commands.ts'
import { EditorCore } from '../src/core.ts'
import { inlineContainers } from '../src/doc.ts'
import { fromMarkdown, toJSON, toMarkdown } from '../src/markdown.ts'
import { writeDomSelection } from '../src/position-map.ts'
import type { DocNode, Transaction } from '../src/types.ts'
import { EditorView } from '../src/view.ts'

const surface = document.getElementById('surface') as HTMLElement
const status = document.getElementById('status') as HTMLElement

let core: EditorCore
let view: EditorView
let gateway: AgentGateway
let access: AgentAccess = 'read'
let transactions: Transaction[] = []

function boot(initial?: DocNode): void {
  view?.destroy()
  transactions = []
  core = new EditorCore(initial)
  view = new EditorView(surface, core)
  gateway = new AgentGateway(core, () => access)
  core.onTransaction((tr) => {
    transactions.push(tr)
    render()
  })
  render()
}

function render(): void {
  status.textContent = `trs: ${transactions.length}\n${JSON.stringify(toJSON(core.doc()))}`
}

function containerId(index: number): string {
  const c = inlineContainers(core.doc())[index]
  if (!c) throw new Error(`no inline container at index ${index}`)
  return c.id
}

declare global {
  interface Window {
    __editor: Record<string, unknown>
  }
}

window.__editor = {
  reset(markdown?: string) {
    boot(markdown ? fromMarkdown(markdown) : undefined)
  },
  getJSON: () => toJSON(core.doc()),
  getMarkdown: () => toMarkdown(core.doc()),
  getDomText: () =>
    Array.from(surface.querySelectorAll('[data-block-id]')).map((el) => el.textContent ?? ''),
  trCount: () => transactions.length,
  trOrigins: () => transactions.map((t) => t.origin),
  setCaret(block: number, offset: number) {
    surface.focus()
    writeDomSelection(surface, { type: 'caret', at: { block: containerId(block), offset } })
  },
  setRange(block: number, from: number, to: number) {
    surface.focus()
    writeDomSelection(surface, {
      type: 'range',
      anchor: { block: containerId(block), offset: from },
      head: { block: containerId(block), offset: to },
    })
  },
  exec: (command: Command) => view.exec(command),
  can: (command: Command) => view.can(command),
  activeState: () => {
    const st = view.activeState()
    return { ...st, marks: [...st.marks] }
  },
  setAccess(a: AgentAccess) {
    access = a
  },
  agentCall: (action: string, params: unknown) => gateway.call(action, params, action),
  pendingProposals: () => gateway.pendingProposals().map((p) => ({ id: p.id, action: p.action })),
  acceptProposal: (id: string) => gateway.accept(id),
  rejectProposal: (id: string) => gateway.reject(id),
  undo: () => core.undo(),
  containerId,
}

boot()
