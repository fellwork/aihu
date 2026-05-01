import { beforeEach, describe, expect, it } from 'vitest'
import {
  __resetRegistryForTesting,
  type ActionSchema,
  type AgentMetadata,
  type InputSchema,
  getAgentMetadata,
  registerAgentMetadata,
} from '../src/registry.ts'

/**
 * Spec §4 Task 23 — 7 unit tests for the agent metadata registry.
 *
 * Tests share module-level state (the registry `Map`); we reset between tests
 * via `__resetRegistryForTesting`, which is exported from `registry.ts` but
 * intentionally NOT re-exported from `index.ts` (spec §5).
 *
 * Each test uses a unique tag name (`x-test-N`) for defence-in-depth against
 * registry pollution if reset is ever skipped.
 */
describe('@scribe/agent registry', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  // 1. Unknown tag returns undefined
  it('returns undefined for an unknown tag', () => {
    expect(getAgentMetadata('x-test-1-missing')).toBeUndefined()
  })

  // 2. Registered tag returns the metadata object
  it('returns the registered metadata object for a known tag', () => {
    const meta: AgentMetadata = {
      tag: 'x-test-2',
      describes: 'a hello-scribe component',
    }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-2')
    expect(result).toEqual(meta)
  })

  // 3. Returned object is the same reference that was registered (no copy)
  it('returns the same object reference that was registered (no copy)', () => {
    const meta: AgentMetadata = { tag: 'x-test-3' }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-3')
    expect(result).toBe(meta)
  })

  // 4. describes/state/actions all optional — minimal `{ tag }` round-trips
  it('round-trips a minimal AgentMetadata with only `tag`', () => {
    const meta: AgentMetadata = { tag: 'x-test-4' }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-4')
    expect(result).toEqual({ tag: 'x-test-4' })
  })

  // 5. Unknown extra fields are preserved (spec §9.1 / §1.1 index signature)
  it('preserves unknown extra fields on the metadata object', () => {
    const meta: AgentMetadata = { tag: 'x-test-5', customField: 42 }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-5')
    expect(result).toBeDefined()
    expect(result?.customField).toBe(42)
    expect(result?.tag).toBe('x-test-5')
  })

  // 6. Re-registering the same tag overwrites — last-write-wins (HMR behaviour)
  it('overwrites an existing entry when the same tag is registered again', () => {
    const first: AgentMetadata = { tag: 'x-test-6', describes: 'first' }
    const second: AgentMetadata = { tag: 'x-test-6', describes: 'second' }
    registerAgentMetadata(first)
    registerAgentMetadata(second)
    const result = getAgentMetadata('x-test-6')
    expect(result).toBe(second)
    expect(result?.describes).toBe('second')
  })

  // 7. Multiple distinct tags coexist independently
  it('keeps multiple distinct tags retrievable independently', () => {
    const a: AgentMetadata = { tag: 'x-test-7-a', describes: 'A' }
    const b: AgentMetadata = { tag: 'x-test-7-b', describes: 'B' }
    registerAgentMetadata(a)
    registerAgentMetadata(b)
    expect(getAgentMetadata('x-test-7-a')).toBe(a)
    expect(getAgentMetadata('x-test-7-b')).toBe(b)
  })
})

describe('@scribe/agent registry — RC-2 ActionSchema/InputSchema', () => {
  beforeEach(() => {
    __resetRegistryForTesting()
  })

  // 8. ActionSchema-typed actions field round-trips correctly
  it('accepts ActionSchema-typed actions field', () => {
    const quoteAction: ActionSchema = {
      returns: {
        plan: { type: 'enum', values: ['basic', 'pro', 'enterprise'] },
      },
    }
    const meta: AgentMetadata = {
      tag: 'x-test-8',
      actions: { quote: quoteAction },
    }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-8')
    expect(result?.actions?.quote?.returns.plan?.type).toBe('enum')
    expect(result?.actions?.quote?.returns.plan?.values).toEqual(['basic', 'pro', 'enterprise'])
  })

  // 9. InputSchema without default is valid
  it('InputSchema without default is valid', () => {
    const action: ActionSchema = {
      returns: {
        name: { type: 'string' },
      },
    }
    const meta: AgentMetadata = {
      tag: 'x-test-9',
      actions: { describe: action },
    }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-9')
    const field: InputSchema | undefined = result?.actions?.describe?.returns.name
    expect(field).toBeDefined()
    expect(field?.default).toBeUndefined()
  })

  // 10. Multiple actions coexist on one component
  it('multiple actions coexist on one component', () => {
    const meta: AgentMetadata = {
      tag: 'x-test-10',
      actions: {
        quote: { returns: { plan: { type: 'string' } } },
        reset: { returns: {} },
      },
    }
    registerAgentMetadata(meta)
    const result = getAgentMetadata('x-test-10')
    expect(Object.keys(result?.actions ?? {}).length).toBe(2)
    expect(result?.actions?.reset?.returns).toEqual({})
  })
})
