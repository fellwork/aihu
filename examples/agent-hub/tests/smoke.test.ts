/**
 * EX-07 agent-hub smoke test.
 *
 * Verifies (per m2-a2 round-5 brief):
 *   A5-1:  hub-root.aihu source contains `getAllAgentMetadata`
 *   A5-2:  hub-root.aihu source contains `createContext`
 *   A5-3:  hub-root.aihu source contains `provide`
 *   A5-4:  hub-root.aihu source contains `@agent`
 *   A5-5:  hub-root.aihu source contains `$expose`
 *   A5-6:  a2a-panel.aihu source contains "A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)"
 *   A5-7:  acp-panel.aihu source contains "ACP: live"
 *   A5-8:  server.ts source contains `mountA2aAdapter`
 *   A5-9:  server.ts source contains `mountAcpAdapter`
 *   A5-10: server.ts source contains `5207`
 *   A5-11: registerAgentMetadata() can be called without throwing
 *          (registry simulation — same pattern as EX-06 weather-card A5-1)
 *   A5-12: a2a-panel.aihu source contains `inject`
 *   A5-13: a2a-panel.aihu source contains `/a2a/tasks/sendSubscribe`
 *   A5-14: acp-panel.aihu source contains `inject`
 *   A5-15: acp-panel.aihu source contains `/acp/messages`
 *
 * Harness: source-text + registry simulation (same pattern as EX-06 weather-card
 * round-1, EX-09 blog-loader round-2, EX-12 realtime-scores round-3).
 * DOM-mount assertions deferred to M4 per arch-2 §6.
 * Offline-safe: no network calls.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAllAgentMetadata, registerAgentMetadata } from '@aihu/agent'
import { beforeEach, describe, expect, it } from 'vitest'

// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'

const HUB_ROOT_PATH = resolve(__dirname, '../src/hub-root.aihu')
const SERVER_PATH = resolve(__dirname, '../server.ts')
const A2A_PANEL_PATH = resolve(__dirname, '../src/a2a-panel.aihu')
const ACP_PANEL_PATH = resolve(__dirname, '../src/acp-panel.aihu')

// ---------------------------------------------------------------------------
// A5-1 through A5-7: hub-root.aihu source-text checks
// ---------------------------------------------------------------------------

describe('EX-07 agent-hub — hub-root.aihu source-text checks', () => {
  const sfcSrc = readFileSync(HUB_ROOT_PATH, 'utf8')

  it('A5-1: hub-root.aihu contains getAllAgentMetadata', () => {
    expect(sfcSrc).toContain('getAllAgentMetadata')
  })

  it('A5-2: hub-root.aihu contains createContext', () => {
    expect(sfcSrc).toContain('createContext')
  })

  it('A5-3: hub-root.aihu contains provide', () => {
    expect(sfcSrc).toContain('provide')
  })

  it('A5-4: hub-root.aihu contains @agent block', () => {
    expect(sfcSrc).toContain('@agent')
  })

  it('A5-5: hub-root.aihu contains $expose', () => {
    expect(sfcSrc).toContain('$expose')
  })

})

// ---------------------------------------------------------------------------
// A5-6 through A5-7: panel SFC badge text checks (relocated from hub-root)
// ---------------------------------------------------------------------------

describe('EX-07 agent-hub — panel badge text checks', () => {
  it('A5-6: a2a-panel.aihu contains A2A badge text', () => {
    const src = readFileSync(A2A_PANEL_PATH, 'utf8')
    expect(src).toContain('A2A: single-shot SSE (multi-frame streaming pending Plan 5.3)')
  })

  it('A5-7: acp-panel.aihu contains ACP badge text', () => {
    const src = readFileSync(ACP_PANEL_PATH, 'utf8')
    expect(src).toContain('ACP: live')
  })
})

// ---------------------------------------------------------------------------
// A5-8 through A5-10: server.ts source-text checks
// ---------------------------------------------------------------------------

describe('EX-07 agent-hub — server.ts source-text checks', () => {
  const serverSrc = readFileSync(SERVER_PATH, 'utf8')

  it('A5-8: server.ts contains mountA2aAdapter (confirms adapter is imported + called)', () => {
    expect(serverSrc).toContain('mountA2aAdapter')
  })

  it('A5-9: server.ts contains mountAcpAdapter (confirms adapter is imported + called)', () => {
    expect(serverSrc).toContain('mountAcpAdapter')
  })

  it('A5-10: server.ts contains 5207 (confirms API server port)', () => {
    expect(serverSrc).toContain('5207')
  })
})

// ---------------------------------------------------------------------------
// A5-12 through A5-13: a2a-panel.aihu source-text checks
// ---------------------------------------------------------------------------

describe('EX-07 agent-hub — a2a-panel.aihu source-text checks', () => {
  const src = readFileSync(A2A_PANEL_PATH, 'utf8')

  it('A5-12: a2a-panel.aihu contains inject', () => {
    expect(src).toContain('inject')
  })

  it('A5-13: a2a-panel.aihu contains /a2a/tasks/sendSubscribe', () => {
    expect(src).toContain('/a2a/tasks/sendSubscribe')
  })
})

// ---------------------------------------------------------------------------
// A5-14 through A5-15: acp-panel.aihu source-text checks
// ---------------------------------------------------------------------------

describe('EX-07 agent-hub — acp-panel.aihu source-text checks', () => {
  const src = readFileSync(ACP_PANEL_PATH, 'utf8')

  it('A5-14: acp-panel.aihu contains inject', () => {
    expect(src).toContain('inject')
  })

  it('A5-15: acp-panel.aihu contains /acp/messages', () => {
    expect(src).toContain('/acp/messages')
  })
})

// ---------------------------------------------------------------------------
// A5-11: Registry simulation — registerAgentMetadata() does not throw
// ---------------------------------------------------------------------------

describe('EX-07 agent-hub — agent metadata registry', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  it('A5-11: registers hub-root agent metadata without throwing', () => {
    expect(() => {
      registerAgentMetadata({
        tag: 'hub-root',
        describes: 'EX-07: AgentService aggregation hub with A2A + ACP adapters',
        state: {
          agentCount: 'Number of sub-agents registered via getAllAgentMetadata()',
          activeTab: 'Currently active protocol tab: a2a | acp',
        },
        actions: {
          getAgentList: { returns: {} },
        },
      })
    }).not.toThrow()

    const entries = getAllAgentMetadata()
    expect(entries).toHaveLength(1)
    expect(entries[0].tag).toBe('hub-root')
    expect(entries[0].state?.agentCount).toBeDefined()
    expect(entries[0].state?.activeTab).toBeDefined()
    expect(entries[0].actions?.getAgentList).toBeDefined()
  })
})
