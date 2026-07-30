/**
 * `compileSidecar({ target })` — proof the flag actually reaches the Rust
 * binary, not just that the TS-side option type accepts it.
 *
 * Without this, `aihu-tsc`/the language server always type-checked against
 * the binary's own `universal` default regardless of the project's
 * `AihuConfig.compiler.target`, since `compileSidecar` never forwarded
 * `--target` at all — see its doc comment in js/index.ts for the full
 * rationale (target changes what `sidecar_ts` is derived from; `islands`/
 * `shadowMode` deliberately do not, so they are not parameters here).
 */
import { describe, expect, it } from 'vitest'
import { compileSidecar } from '../js/index.ts'

const SOURCE = '@template {\n  <p>hi</p>\n}\n'

describe('compileSidecar({ target })', () => {
  it('accepts a valid target and compiles normally', () => {
    expect(() => compileSidecar(SOURCE, 'x.aihu', { target: 'client' })).not.toThrow()
    expect(() => compileSidecar(SOURCE, 'x.aihu', { target: 'server' })).not.toThrow()
    expect(() => compileSidecar(SOURCE, 'x.aihu', { target: 'universal' })).not.toThrow()
  })

  it('omitting target behaves exactly as before (no --target forwarded)', () => {
    const withoutTarget = compileSidecar(SOURCE, 'x.aihu')
    const withUniversal = compileSidecar(SOURCE, 'x.aihu', { target: 'universal' })
    // universal is the binary's own default, so the two should agree.
    expect(withoutTarget).toBe(withUniversal)
  })

  it("a bogus target surfaces the binary's own CLI validation error — proof the flag reaches it", () => {
    // @ts-expect-error deliberately invalid, to prove --target is actually
    // forwarded to the binary (which rejects it) rather than silently no-op'd
    // on the JS side.
    expect(() => compileSidecar(SOURCE, 'x.aihu', { target: 'bogus' })).toThrow(
      /unknown --target|expected: client\|server\|universal/,
    )
  })
})
