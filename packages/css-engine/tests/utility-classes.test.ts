import { describe, expect, it } from 'vitest'
import { compileSfc } from '../src/index.ts'

// Public-API (AST → scoped CSS) coverage for the round-2 group/peer relational
// variants. These mirror the Rust `tests/emit.rs` assertions but exercise the
// full TS bridge (`compileToAst` → native binary → scoped CSS), the same path
// the Vite plugin uses. If the native binary is unavailable these will throw at
// `compileSfc`; the suite follows the existing sfc-e2e.test.ts convention of
// calling `compileSfc` directly (the workspace test run builds the binary).
describe('@aihu/css-engine — group/peer relational variants (round 2)', () => {
  it('group-hover: emits an ancestor `.group:hover` descendant selector', () => {
    const source = `@template {
  <div class="group">
    <span class="group-hover:bg-primary">x</span>
  </div>
}`
    const css = compileSfc(source, 'GroupHover.aihu')
    // `.group:hover .group-hover\:bg-primary { background-color: ... }`
    expect(css).toContain('.group:hover .group-hover\\:bg-primary')
    expect(css).toContain('background-color: var(--color-primary)')
    // Bare `group` marker survives as an empty-body rule.
    expect(css).toContain('.group {')
  })

  it('peer-checked: emits a `.peer:checked ~` sibling selector', () => {
    const source = `@template {
  <input class="peer" type="checkbox" />
  <span class="peer-checked:bg-primary">x</span>
}`
    const css = compileSfc(source, 'PeerChecked.aihu')
    // `.peer:checked ~ .peer-checked\:bg-primary { background-color: ... }`
    expect(css).toContain('.peer:checked ~ .peer-checked\\:bg-primary')
    expect(css).toContain('background-color: var(--color-primary)')
    expect(css).toContain('.peer {')
  })

  it('covers each group-* state', () => {
    const source = `@template {
  <div class="group-focus:bg-primary group-focus-visible:bg-primary group-active:bg-primary group-disabled:bg-primary">x</div>
}`
    const css = compileSfc(source, 'GroupStates.aihu')
    expect(css).toContain('.group:focus ')
    expect(css).toContain('.group:focus-visible ')
    expect(css).toContain('.group:active ')
    expect(css).toContain('.group:disabled ')
  })

  it('covers each peer-* state', () => {
    const source = `@template {
  <span class="peer-hover:bg-primary peer-focus:bg-primary peer-focus-visible:bg-primary peer-disabled:bg-primary">x</span>
}`
    const css = compileSfc(source, 'PeerStates.aihu')
    expect(css).toContain('.peer:hover ~ ')
    expect(css).toContain('.peer:focus ~ ')
    expect(css).toContain('.peer:focus-visible ~ ')
    expect(css).toContain('.peer:disabled ~ ')
  })

  it('does NOT implement aria-*/data-* attribute variants (those belong to P6)', () => {
    const source = `@template { <div class="aria-checked:bg-primary data-open:bg-primary">x</div> }`
    const css = compileSfc(source, 'AriaData.aihu')
    // No rule should be produced for these out-of-track variants.
    expect(css).not.toContain('background-color: var(--color-primary)')
  })
})
