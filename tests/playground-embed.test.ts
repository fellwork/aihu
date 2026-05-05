/**
 * Smoke tests for <playground-embed> + <code-editor> (Directive 1).
 *
 * Covers element registration, attribute wiring, fallback rendering
 * when the WASM bundle is unavailable (which is the actual state of
 * the world until the v0.1.0 release artifacts publish), and the
 * iframe sandbox configuration.
 *
 * jsdom does not execute scripts inside `srcdoc` iframes, so the
 * preview-side behaviour is exercised separately by the bench harness;
 * here we only confirm the host-side wiring.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stub out fetch + dynamic-import resolution so loadWasm() takes the
// "unavailable" path deterministically.
beforeEach(() => {
  // The HEAD probe to ./wasm/UNAVAILABLE returns 200 → loadWasm() resolves null.
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
    if (u.endsWith('/UNAVAILABLE')) {
      return new Response('unavailable', { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<playground-embed>', () => {
  it('registers the custom element on import', async () => {
    await import('../apps/docs/playground/playground-embed.ts')
    expect(customElements.get('playground-embed')).toBeDefined()
    expect(customElements.get('code-editor')).toBeDefined()
  })

  it('mounts a shadow root with editor + sandboxed iframe', async () => {
    const { PlaygroundEmbed } = await import('../apps/docs/playground/playground-embed.ts')
    const el = document.createElement('playground-embed') as InstanceType<typeof PlaygroundEmbed>
    document.body.appendChild(el)

    expect(el.shadowRoot).not.toBeNull()
    const iframe = el.shadowRoot!.querySelector('iframe')
    expect(iframe).not.toBeNull()
    // Sandbox MUST NOT include allow-same-origin — that would defeat
    // the boundary that lets compiled user JS run in isolation.
    const sandbox = iframe!.getAttribute('sandbox') ?? ''
    expect(sandbox).toContain('allow-scripts')
    expect(sandbox).not.toContain('allow-same-origin')

    const editor = el.shadowRoot!.querySelector('code-editor')
    expect(editor).not.toBeNull()

    el.remove()
  })

  it('respects the initial-source attribute', async () => {
    const { PlaygroundEmbed } = await import('../apps/docs/playground/playground-embed.ts')
    const sample = '@template { <h1>Hello {name}</h1> }'
    const el = document.createElement('playground-embed') as InstanceType<typeof PlaygroundEmbed>
    el.setAttribute('initial-source', sample)
    document.body.appendChild(el)

    const editor = el.shadowRoot!.querySelector('code-editor') as HTMLElement
    expect(editor.getAttribute('value')).toBe(sample)
    el.remove()
  })

  it('renders a fallback error when the WASM bundle is unavailable', async () => {
    const { PlaygroundEmbed } = await import('../apps/docs/playground/playground-embed.ts')
    const el = document.createElement('playground-embed') as InstanceType<typeof PlaygroundEmbed>
    document.body.appendChild(el)

    // Drive boot() → loadWasm() → fallback path.
    // Resolve a microtask so the boot() promise chain settles.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    const errEl = el.shadowRoot!.querySelector('.error') as HTMLElement
    expect(errEl).not.toBeNull()
    expect(errEl.hidden).toBe(false)
    expect(errEl.textContent ?? '').toMatch(/WASM bundle unavailable/i)
    el.remove()
  })
})

describe('<code-editor>', () => {
  it('falls back to a textarea when CodeMirror is not loadable', async () => {
    await import('../apps/docs/playground/code-editor.ts')
    const el = document.createElement('code-editor') as HTMLElement & { value: string }
    el.setAttribute('value', 'hello world')
    document.body.appendChild(el)

    // Microtask flush — boot() awaits the dynamic import which jsdom
    // cannot resolve for @codemirror/state. The textarea fallback
    // remains in place.
    await new Promise((r) => setTimeout(r, 0))

    const textarea = el.shadowRoot!.querySelector('textarea')
    expect(textarea).not.toBeNull()
    expect(textarea!.value).toBe('hello world')

    // Setting .value updates the fallback textarea.
    el.value = 'updated'
    expect(textarea!.value).toBe('updated')
    expect(el.value).toBe('updated')

    el.remove()
  })
})
