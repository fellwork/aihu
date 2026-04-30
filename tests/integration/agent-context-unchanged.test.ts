import { leaf, mount } from '@scribe/arbor'
import { describe, expect, it } from 'vitest'

describe('agent-readiness integration', () => {
  it('AC-8: MountScope.agent shape unchanged by agent-readiness', () => {
    const host = document.createElement('div')
    const scope = mount(leaf('test'), host)
    expect(scope.agent._brand).toBe('AgentContext')
    expect(Object.isFrozen(scope.agent)).toBe(true)
    expect(Object.keys(scope.agent)).toEqual(['_brand'])
    scope.dispose()
  })
})
