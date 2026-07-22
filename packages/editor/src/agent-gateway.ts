/**
 * AgentGateway — the GX write surface (spec §7). Every agent action takes
 * steps/nodes, is validated by `EditorCore.apply` EXACTLY as human input
 * (G1: no agent-only door), and lands in the shared undo history with
 * `origin: 'agent:<tool>'` (G2: symmetric undo, G3: total attribution).
 *
 * Host scoping (§7.2): the `agentAccess` knob is checked FIRST on every
 * call, fail-closed (G4): unknown action → error; missing access → 'read'.
 * In `'suggest'` mode write actions are accepted, validated, but STAGED as
 * accept/reject proposals — the human governs; the agent proposes through
 * the same typed channel it would use to write.
 */

import { EditorCore } from './core.ts'
import { containerText, findContainer, markAt } from './doc.ts'
import { freshId } from './id.ts'
import { toJSON, toMarkdown } from './markdown.ts'
import type { ApplyResult, BlockNode, DocNode, Mark, Point, SelectionState, Step } from './types.ts'

export type AgentAccess = 'none' | 'read' | 'suggest' | 'write'

export interface AgentCallResult {
  ok: boolean
  code?: string
  /** For suggest mode: the staged proposal id. */
  proposalId?: string
  result?: unknown
}

export interface AgentProposal {
  id: string
  action: string
  origin: `agent:${string}`
  steps: Step[]
  createdAt: number
}

export interface SelectionContext {
  selection: SelectionState | null
  /** Up to 80 code units either side of the caret/range, for grounding "insert here". */
  textAround: { before: string; after: string } | null
}

export interface DocOutlineEntry {
  id: string
  type: BlockNode['type']
  level?: number
  text: string
}

const WRITE_ACTIONS = new Set(['insertBlock', 'replaceRange', 'applyMark', 'applyTransaction'])

export class AgentGateway {
  private core: EditorCore
  private getAccess: () => AgentAccess
  private proposals = new Map<string, AgentProposal>()
  private onProposalChange:
    | ((kind: 'staged' | 'accepted' | 'rejected', proposal: AgentProposal) => void)
    | null

  constructor(
    core: EditorCore,
    getAccess: () => AgentAccess,
    onProposalChange?: (kind: 'staged' | 'accepted' | 'rejected', proposal: AgentProposal) => void,
  ) {
    this.core = core
    this.getAccess = getAccess
    this.onProposalChange = onProposalChange ?? null
  }

  // ----- read tier (§7.1) --------------------------------------------------

  doc(): DocNode {
    return toJSON(this.core.doc())
  }

  docMarkdown(): string {
    return toMarkdown(this.core.doc())
  }

  docOutline(): DocOutlineEntry[] {
    const out: DocOutlineEntry[] = []
    for (const b of this.core.doc().children) {
      if (b.type === 'hr') {
        out.push({ id: b.id, type: b.type, text: '' })
      } else if (b.type === 'list') {
        out.push({
          id: b.id,
          type: b.type,
          text: b.children.map((i) => containerText(i)).join(' · '),
        })
      } else {
        const entry: DocOutlineEntry = { id: b.id, type: b.type, text: containerText(b) }
        if (b.type === 'heading') entry.level = b.attrs.level
        out.push(entry)
      }
    }
    return out
  }

  selectionContext(): SelectionContext {
    const selection = this.core.selection()
    if (!selection || selection.type === 'node') return { selection, textAround: null }
    const at = selection.type === 'caret' ? selection.at : selection.head
    const loc = findContainer(this.core.doc(), at.block)
    if (!loc) return { selection, textAround: null }
    const text = containerText(loc.node)
    return {
      selection,
      textAround: {
        before: text.slice(Math.max(0, at.offset - 80), at.offset),
        after: text.slice(at.offset, at.offset + 80),
      },
    }
  }

  // ----- write tier (§7.1/§7.2) -------------------------------------------

  /**
   * Dispatch an agent action. `tool` names the caller for attribution —
   * origin becomes `agent:<tool>` (defaults to the action name).
   */
  call(action: string, params: unknown, tool?: string): AgentCallResult {
    const access = this.accessOrDefault()
    if (access === 'none') return { ok: false, code: 'access_denied' }
    // reads are allowed at every tier ≥ read
    if (action === 'doc') return { ok: true, result: this.doc() }
    if (action === 'docMarkdown') return { ok: true, result: this.docMarkdown() }
    if (action === 'docOutline') return { ok: true, result: this.docOutline() }
    if (action === 'selectionContext') return { ok: true, result: this.selectionContext() }
    if (!WRITE_ACTIONS.has(action)) return { ok: false, code: 'unknown_action' } // G4 fail closed
    if (access === 'read') return { ok: false, code: 'access_denied' }

    const built = this.buildSteps(action, params)
    if ('code' in built) return { ok: false, code: built.code }
    const origin = `agent:${tool ?? action}` as const

    if (access === 'suggest') {
      // Validate WITHOUT applying: dry-run against a scratch core.
      const scratch = new EditorCore(structuredClone(this.core.doc()))
      const dry = scratch.dispatch(origin, built.steps)
      if (!dry.ok) return { ok: false, code: dry.code }
      const proposal: AgentProposal = {
        id: freshId(),
        action,
        origin,
        steps: built.steps,
        createdAt: Date.now(),
      }
      this.proposals.set(proposal.id, proposal)
      this.onProposalChange?.('staged', proposal)
      return { ok: true, proposalId: proposal.id }
    }

    const res = this.core.dispatch(origin, built.steps)
    return res.ok ? { ok: true } : { ok: false, code: res.code }
  }

  private accessOrDefault(): AgentAccess {
    const a = this.getAccess()
    return a === 'none' || a === 'read' || a === 'suggest' || a === 'write' ? a : 'read' // G4
  }

  private buildSteps(action: string, params: unknown): { steps: Step[] } | { code: string } {
    const p = (params ?? {}) as Record<string, unknown>
    switch (action) {
      case 'insertBlock': {
        const node = p.node as BlockNode | undefined
        if (!node || typeof node !== 'object' || typeof node.type !== 'string')
          return { code: 'bad_params' }
        const withIds = assignIds(structuredClone(node))
        const after = (p.after ?? null) as string | null
        return { steps: [{ t: 'insertBlock', after, node: withIds }] }
      }
      case 'replaceRange': {
        const from = p.from as Point | undefined
        const to = p.to as Point | undefined
        const text = p.text
        if (!isPoint(from) || !isPoint(to) || typeof text !== 'string')
          return { code: 'bad_params' }
        if (from.block !== to.block) return { code: 'cross_block' }
        const steps: Step[] = []
        if (to.offset > from.offset) steps.push({ t: 'deleteRange', from, to })
        if (text.length > 0) {
          const loc = findContainer(this.core.doc(), from.block)
          const mark = loc ? markAt(loc.node, from.offset) : null
          steps.push({ t: 'insertText', at: from, text, mark })
        }
        if (steps.length === 0) return { code: 'bad_params' }
        return { steps }
      }
      case 'applyMark': {
        const from = p.from as Point | undefined
        const to = p.to as Point | undefined
        if (!isPoint(from) || !isPoint(to)) return { code: 'bad_params' }
        const mark = (p.mark ?? null) as Mark | null
        return { steps: [{ t: 'setMark', from, to, mark }] }
      }
      case 'applyTransaction': {
        const steps = p.steps as Step[] | undefined
        if (!Array.isArray(steps) || steps.length === 0) return { code: 'bad_params' }
        return { steps: structuredClone(steps) }
      }
      default:
        return { code: 'unknown_action' }
    }
  }

  // ----- suggest-mode lifecycle (§7.2 control 2) ---------------------------

  pendingProposals(): AgentProposal[] {
    return [...this.proposals.values()]
  }

  /** Human accepts: applies with the agent origin PRESERVED (G3). */
  accept(proposalId: string): ApplyResult {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) return { ok: false, code: 'unknown_proposal' }
    this.proposals.delete(proposalId)
    const res = this.core.dispatch(proposal.origin, proposal.steps)
    if (res.ok) this.onProposalChange?.('accepted', proposal)
    return res
  }

  reject(proposalId: string): boolean {
    const proposal = this.proposals.get(proposalId)
    if (!proposal) return false
    this.proposals.delete(proposalId)
    this.onProposalChange?.('rejected', proposal)
    return true
  }
}

function isPoint(v: unknown): v is Point {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Point).block === 'string' &&
    typeof (v as Point).offset === 'number'
  )
}

/** Ensure every inserted node carries a fresh id (I2 — never trust caller ids). */
function assignIds<T extends BlockNode>(node: T): T {
  node.id = freshId()
  if (node.type === 'list') for (const item of node.children) item.id = freshId()
  return node
}
