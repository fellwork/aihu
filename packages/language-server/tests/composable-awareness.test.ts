/**
 * packages/language-server/tests/composable-awareness.test.ts
 *
 * FEL-342 / #427 follow-up — "bare useX() gets no editor completion + shows
 * as undefined". The compiler auto-imports `@aihu/use` composables
 * (use_registry.rs's `USE_COMPOSABLES`), but until this fix the LSP had zero
 * awareness of that list: no completion offered the name, and hover fell
 * through to nothing (the sidecar's ambient `declare const useMouse:
 * (...args: any[]) => any;` already stopped the type-checker from flagging
 * it, but the editor experience — the actual complaint in FEL-342 — still
 * looked broken).
 */
import { describe, expect, it } from 'vitest'
import { COMPOSABLE_COMPLETIONS } from '../src/core/completion.ts'
import { COMPOSABLE_REGISTRY } from '../src/core/composable-registry.ts'
import { getHoverContent, getMacroAtPosition } from '../src/core/hover.ts'

describe('composable registry (generated from use_registry.rs)', () => {
  it('carries every composable the compiler auto-imports', () => {
    expect(COMPOSABLE_REGISTRY.length).toBeGreaterThan(50)
    const names = new Set(COMPOSABLE_REGISTRY.map((e) => e.name))
    expect(names.has('useMouse')).toBe(true)
    expect(names.has('useToggle')).toBe(true)
    expect(names.has('watch')).toBe(true)
  })

  it('every entry has a non-empty description (extracted from its doc comment)', () => {
    for (const entry of COMPOSABLE_REGISTRY) {
      expect(entry.description, `${entry.name} has no description`).not.toBe('')
    }
  })
})

describe('completion offers every composable inside @state', () => {
  it('COMPOSABLE_COMPLETIONS mirrors the registry, one item per composable', () => {
    expect(COMPOSABLE_COMPLETIONS).toHaveLength(COMPOSABLE_REGISTRY.length)
    const useMouse = COMPOSABLE_COMPLETIONS.find((c) => c.label === 'useMouse')
    expect(useMouse).toBeDefined()
    expect(useMouse?.insertText).toBe('useMouse()')
    expect(useMouse?.detail).toContain('@aihu/use/useMouse')
  })
})

describe('hover resolves a bare composable call to its registry entry', () => {
  it('a bare useMouse() call resolves and hovers with its auto-import specifier', () => {
    const line = '  const { x, y } = useMouse()'
    const at = line.indexOf('useMouse') + 2
    const macro = getMacroAtPosition(line, at)
    expect(macro).toBe('useMouse')
    const content = getHoverContent(macro!)
    expect(content).toContain('useMouse')
    expect(content).toContain('@aihu/use/useMouse')
  })

  it('a bare, non-composable identifier call does not falsely resolve', () => {
    const line = '  const result = computeSomething()'
    const at = line.indexOf('computeSomething') + 2
    expect(getMacroAtPosition(line, at)).toBeNull()
  })

  it('a family-namespaced composable (useClamp, math family) still hovers', () => {
    const line = '  const clamped = useClamp(value, 0, 100)'
    const at = line.indexOf('useClamp') + 2
    const macro = getMacroAtPosition(line, at)
    expect(macro).toBe('useClamp')
    expect(getHoverContent(macro!)).toContain('@aihu/use/math/useClamp')
  })
})
