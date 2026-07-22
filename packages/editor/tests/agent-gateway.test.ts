// AgentGateway — acceptance A7 at the core level plus the equal-governance
// invariants G1–G4 (spec §7). The gateway is exactly what the SFC's GX
// actions delegate to; the live-binding wiring is exercised by the
// component-compile test.

import { describe, expect, it } from 'vitest'
import type { AgentAccess } from '../src/agent-gateway.ts'
import { AgentGateway } from '../src/agent-gateway.ts'
import { EditorCore } from '../src/core.ts'
import { containerText } from '../src/doc.ts'
import { doc, para, run, tid } from './helpers.ts'

function setup(access: AgentAccess) {
  const p = tid()
  const core = new EditorCore(doc(para(p, run('base'))))
  let current = access
  const events: string[] = []
  const gateway = new AgentGateway(
    core,
    () => current,
    (kind) => events.push(kind),
  )
  return { p, core, gateway, events, setAccess: (a: AgentAccess) => (current = a) }
}

const paragraphNode = {
  id: 'ignored',
  type: 'paragraph' as const,
  content: [{ text: 'agent!', mark: null }],
}

describe('A7 — access tiers', () => {
  it("'write': insertBlock mutates the doc through the same apply() door", () => {
    const { core, gateway } = setup('write')
    const res = gateway.call('insertBlock', { after: null, node: paragraphNode }, 'insertBlock')
    expect(res.ok).toBe(true)
    expect(core.doc().children).toHaveLength(2)
    expect(containerText(core.doc().children[0] as never)).toBe('agent!')
  })

  it("'read': same call is a structured denial and the doc is unchanged", () => {
    const { core, gateway } = setup('read')
    const res = gateway.call('insertBlock', { after: null, node: paragraphNode })
    expect(res).toEqual({ ok: false, code: 'access_denied' })
    expect(core.doc().children).toHaveLength(1)
    // reads still work at 'read'
    expect(gateway.call('docMarkdown', {}).ok).toBe(true)
  })

  it("'none': even reads are denied and the binding surface is dark", () => {
    const { gateway } = setup('none')
    expect(gateway.call('doc', {})).toEqual({ ok: false, code: 'access_denied' })
  })

  it("'suggest': doc unchanged until accept; human undo after accept reverts (G2)", () => {
    const { core, gateway, events } = setup('suggest')
    const res = gateway.call('insertBlock', { after: null, node: paragraphNode }, 'insertBlock')
    expect(res.ok).toBe(true)
    expect(res.proposalId).toBeDefined()
    expect(core.doc().children).toHaveLength(1) // staged, not applied
    expect(events).toEqual(['staged'])

    const applied = gateway.accept(res.proposalId as string)
    expect(applied.ok).toBe(true)
    expect(core.doc().children).toHaveLength(2)
    if (applied.ok) expect(applied.tr.origin).toBe('agent:insertBlock') // attribution preserved (G3)

    expect(core.undo()).toBe(true) // human Ctrl-Z reverts the accepted agent edit
    expect(core.doc().children).toHaveLength(1)
  })

  it("'suggest': reject discards without touching the doc", () => {
    const { core, gateway, events } = setup('suggest')
    const res = gateway.call('replaceRange', {
      from: { block: core.doc().children[0]?.id, offset: 0 },
      to: { block: core.doc().children[0]?.id, offset: 4 },
      text: 'nope',
    })
    expect(res.ok).toBe(true)
    expect(gateway.reject(res.proposalId as string)).toBe(true)
    expect(gateway.pendingProposals()).toHaveLength(0)
    expect(containerText(core.doc().children[0] as never)).toBe('base')
    expect(events).toEqual(['staged', 'rejected'])
  })
})

describe('G1/G4 — one door, fail closed', () => {
  it('unknown actions are structured errors', () => {
    const { gateway } = setup('write')
    expect(gateway.call('formatHardDrive', {})).toEqual({ ok: false, code: 'unknown_action' })
  })

  it('invalid params and invalid targets are structured errors, never partial application', () => {
    const { core, gateway } = setup('write')
    expect(gateway.call('insertBlock', {}).ok).toBe(false)
    expect(
      gateway.call('replaceRange', {
        from: { block: 'nope', offset: 0 },
        to: { block: 'nope', offset: 1 },
        text: 'x',
      }),
    ).toEqual({ ok: false, code: 'unknown_block' })
    expect(containerText(core.doc().children[0] as never)).toBe('base')
  })

  it('applyMark with a javascript: href is rejected by the SAME validator as keystrokes (T6)', () => {
    const { p, gateway } = setup('write')
    const res = gateway.call('applyMark', {
      from: { block: p, offset: 0 },
      to: { block: p, offset: 4 },
      mark: { type: 'link', attrs: { href: 'javascript:alert(1)' } },
    })
    expect(res).toEqual({ ok: false, code: 'bad_href' })
  })

  it('an unknown access value fails closed to read (G4)', () => {
    const { gateway, setAccess } = setup('write')
    setAccess('admin' as AgentAccess)
    expect(gateway.call('insertBlock', { after: null, node: paragraphNode })).toEqual({
      ok: false,
      code: 'access_denied',
    })
    expect(gateway.call('doc', {}).ok).toBe(true)
  })

  it('applyTransaction is the same validated, atomic path', () => {
    const { p, core, gateway } = setup('write')
    const res = gateway.call('applyTransaction', {
      steps: [
        { t: 'insertText', at: { block: p, offset: 4 }, text: '!', mark: null },
        {
          t: 'deleteRange',
          from: { block: 'missing', offset: 0 },
          to: { block: 'missing', offset: 1 },
        },
      ],
    })
    expect(res.ok).toBe(false)
    expect(containerText(core.doc().children[0] as never)).toBe('base') // atomic
  })
})

describe('read tier', () => {
  it('doc / docMarkdown / docOutline / selectionContext', () => {
    const { p, core, gateway } = setup('read')
    expect((gateway.call('doc', {}).result as unknown as { schema: string }).schema).toBe(
      'aihu-editor/doc',
    )
    expect(gateway.call('docMarkdown', {}).result).toBe('base')
    const outline = gateway.call('docOutline', {}).result as unknown as {
      id: string
      type: string
      text: string
    }[]
    expect(outline).toEqual([{ id: p, type: 'paragraph', text: 'base' }])
    core.setSelection({ type: 'caret', at: { block: p, offset: 2 } })
    const ctx = gateway.call('selectionContext', {}).result as unknown as {
      textAround: { before: string; after: string }
    }
    expect(ctx.textAround).toEqual({ before: 'ba', after: 'se' })
  })
})
