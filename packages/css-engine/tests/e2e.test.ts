import { describe, expect, it } from 'vitest'
import { compile } from '../src/index.ts'

describe('@aihu/css-engine — end-to-end', () => {
  it('compiles the fixture class list to CSS', () => {
    const css = compile(['bg-primary', 'text-primary-foreground', 'rounded-md', 'p-4'])

    expect(css).toContain('.bg-primary')
    expect(css).toContain('background-color: var(--color-primary)')
    expect(css).toContain('.p-4')
    expect(css).toContain('padding: 1rem')
  })

  it('skips unknown classes silently', () => {
    const css = compile(['bg-primary', 'this-class-does-not-exist'])
    expect(css).toContain('.bg-primary')
    expect(css).not.toContain('this-class-does-not-exist')
  })

  it('returns empty string for empty input', () => {
    expect(compile([])).toBe('')
  })
})
