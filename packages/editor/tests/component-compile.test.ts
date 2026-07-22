// SFC compile gate — the shipped components must compile with the real Rust
// compiler and emit the GX agent surface (registerAgentMetadata with the §7
// action names). Skipped when the native compiler binary is not built (same
// posture as the compiler's own binary-dependent suites: CI builds it).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENTS = join(__dirname, '..', 'components')

type TransformFn = (source: string, id: string) => string | { code: string }

async function loadCompiler(): Promise<TransformFn | null> {
  try {
    const mod = (await import('@aihu/compiler')) as { transform: TransformFn }
    // probe: throws when the native binary is missing
    mod.transform('@state {\n  let x = state(0)\n}\n\n@template {\n  <p>{x}</p>\n}', 'probe-x.aihu')
    return mod.transform
  } catch {
    return null
  }
}

const transform = await loadCompiler()

function compile(name: string): string {
  const out = (transform as TransformFn)(readFileSync(join(COMPONENTS, name), 'utf8'), name)
  return typeof out === 'string' ? out : out.code
}

describe.skipIf(transform === null)('component compile (GX surface)', () => {
  it('aihu-editor.aihu compiles and registers the §7.1 write actions', () => {
    const code = compile('aihu-editor.aihu')
    expect(code).toContain('registerAgentMetadata')
    for (const action of ['insertBlock', 'replaceRange', 'applyMark', 'applyTransaction']) {
      expect(code).toContain(action)
    }
    // read tier
    for (const read of ['docMarkdown', 'docOutline', 'selectionContext']) {
      expect(code).toContain(read)
    }
    // agentAccess knob is a real prop with its default
    expect(code).toContain('agentAccess')
    expect(code).toContain("'read'")
  })

  it('aihu-editor.aihu emits no HTML sink in compiled output (A8 downstream)', () => {
    const code = compile('aihu-editor.aihu')
    expect(/innerHTML|outerHTML|insertAdjacentHTML|srcdoc/.test(code)).toBe(false)
  })

  it('aihu-editor-toolbar.aihu compiles and exposes NO agent surface', () => {
    const code = compile('aihu-editor-toolbar.aihu')
    expect(code).not.toContain('registerAgentMetadata')
  })
})

describe.skipIf(transform !== null)('component compile (binary unavailable)', () => {
  it('skipped — native aihu-compile binary not built in this checkout', () => {
    expect(transform).toBeNull()
  })
})
