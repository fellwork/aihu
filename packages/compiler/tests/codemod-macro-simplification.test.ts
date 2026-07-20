/**
 * Unit tests for the macro-simplification (v1→v2) codemod — #425 defect (a).
 *
 * The colon forms `$lifecycle.mount: { … }` / `$lifecycle.dispose: { … }`
 * (and the arrow variant `$lifecycle.mount: () => { … }`) previously fell
 * through to the bare-`$macro <ident>` passthrough: the codemod consumed only
 * the header line and left the orphaned body braces to mangle the file.
 * They must migrate into the v2 `$lifecycle: { mount: …, dispose: … }`
 * collection exactly like the call form `$lifecycle.mount(() => { … })`.
 */

import { describe, expect, it } from 'vitest'
import { migrate } from '../js/codemods/macro-simplification/migrate.ts'

describe('macro-simplification — $lifecycle colon form (#425 a)', () => {
  it('migrates $lifecycle.mount colon-block form into the $lifecycle collection', () => {
    const input = `@state {
  import { signal } from '@aihu/signals'
  const [x, setX] = signal(0)

  $lifecycle.mount: {
    setX(1)
  }

  $lifecycle.dispose: {
    setX(0)
  }
}
`
    const { rewritten, warnings } = migrate(input)
    expect(warnings).toEqual([])
    // Both hooks land in one v2 collection …
    expect(rewritten).toContain('$lifecycle: {')
    expect(rewritten).toContain('mount: () => {')
    expect(rewritten).toContain('dispose: () => {')
    expect(rewritten).toContain('setX(1)')
    expect(rewritten).toContain('setX(0)')
    // … and no colon-form residue (headers or orphaned bodies) survives.
    expect(rewritten).not.toContain('$lifecycle.mount')
    expect(rewritten).not.toContain('$lifecycle.dispose')
    // Idempotent: re-running the codemod on its own output is a no-op.
    expect(migrate(rewritten).rewritten).toBe(rewritten)
  })

  it('round-trips async handlers on the v2 idempotency path (no silent drop)', () => {
    // Regression (#425): `parseArrowOrFunctionExpr` did not recognize `async`
    // arrows, so a v2 `$action: { name: { handler: async () => { … } } }`
    // entry was silently DELETED when the codemod re-ran over v2 source.
    const input = `@state {
  const [loading, setLoading] = signal(false)

  $action: {
    send: {
      describe: 'Send a ping',
      expose: { read: true, write: true },
      handler: async () => {
        setLoading(true)
        await fetch('/ping')
        setLoading(false)
      },
    },
  }
}
`
    const { rewritten } = migrate(input)
    expect(rewritten).toContain('handler: async () => {')
    expect(rewritten).toContain("await fetch('/ping')")
    expect(rewritten).toContain("describe: 'Send a ping'")
    // Stable under a second run.
    expect(migrate(rewritten).rewritten).toBe(rewritten)
  })

  it('migrates $lifecycle.mount colon-arrow form into the $lifecycle collection', () => {
    const input = `@state {
  $lifecycle.mount: () => {
    console.log('up')
  }
}
`
    const { rewritten } = migrate(input)
    expect(rewritten).toContain('$lifecycle: {')
    expect(rewritten).toContain('mount: () => {')
    expect(rewritten).toContain("console.log('up')")
    expect(rewritten).not.toContain('$lifecycle.mount')
  })
})
