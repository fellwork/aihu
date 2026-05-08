/**
 * <playground-embed> — interactive .aihu playground for the homepage.
 *
 * Implements Directive 1 (homepage interactive playground per
 * `docs/roadmap/_user-directives.md`). The element splits a CodeMirror
 * source editor on the left from a sandboxed live-preview iframe on
 * the right; the WASM-built `aihu-compile` compiles the user's source on
 * every (debounced) edit and executes the compiled component in the iframe.
 *
 * Acceptance criteria (Directive 1 §2-§3):
 *   - Compile latency < 200ms p50 for a 50-line `.aihu` fixture.
 *   - Initial JS bundle < 1 MB (CodeMirror + WASM are lazy chunks).
 *
 * Attributes:
 *   initial-source — starter source displayed in the editor on mount.
 *
 * The WASM bundle is fetched at build time by
 * `scripts/fetch-wasm-bundle.ts` and lives at `./wasm/` relative to
 * the docs root. If the bundle is unavailable (no release yet),
 * the playground renders a clear fallback message.
 *
 * The preview iframe uses `sandbox="allow-scripts"` (no allow-same-origin).
 * Each compile resets `iframe.srcdoc` to a fresh HTML document containing:
 *   1. The aihu runtime IIFE (window.__aihu = { branch, leaf, … })
 *   2. The compiled component JS (with @aihu imports stripped and types erased)
 *   3. An <aihu-component> element mounted into a #root div
 *
 * Spec: docs/roadmap/_user-directives.md §Directive 1.
 */

import './code-editor.ts'

const DEFAULT_SOURCE = `@state {
  import { signal } from '@aihu/signals'
  const [count, setCount] = signal(0)
}

@template {
  <div class="demo">
    <h1>Hello from aihu</h1>
    <p>Count: {{ count }}</p>
    <button $on.click={() => setCount(count() + 1)}>+</button>
  </div>
}

@style {
  .demo { padding: 1rem; font-family: system-ui, sans-serif; }
  button { padding: .25rem .75rem; cursor: pointer; }
}
`

const HOST_STYLES = `
:host {
  display: block;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg, #fff);
  color: var(--fg, #1a1a1a);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.playground {
  display: grid;
  grid-template-columns: 1fr 1fr;
  min-height: 360px;
}
.pane { display: flex; flex-direction: column; min-width: 0; }
.editor-pane { border-right: 1px solid var(--border, #e2e8f0); }
.pane > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background: var(--code-bg, #f6f8fa);
  font-size: 12px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.label { color: var(--muted, #666); }
.latency {
  font-variant-numeric: tabular-nums;
  color: var(--accent, #7c3aed);
  font-weight: 600;
}
.latency.over-budget { color: #d97706; }
.editor-host { flex: 1; min-height: 0; display: flex; }
code-editor { flex: 1; }
.error {
  margin: 0;
  padding: 8px 12px;
  background: #fef2f2;
  color: #b91c1c;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  border-top: 1px solid #fecaca;
  max-height: 30%;
  overflow: auto;
}
iframe {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}
@media (max-width: 768px) {
  .playground {
    grid-template-columns: 1fr;
  }
  .editor-pane { border-right: 0; border-bottom: 1px solid var(--border, #e2e8f0); }
}
`

interface CompileResult {
  js: string
  manifest_json: string
  route_json?: string | null
}

interface WasmModule {
  default: (
    input?: string | URL | Request | { module_or_path: string | URL | Request },
  ) => Promise<unknown>
  wasm_compile: (source: string) => CompileResult
  wasm_version: () => string
}

let wasmPromise: Promise<WasmModule | null> | null = null
let bundlePromise: Promise<string | null> | null = null

function wasmBaseUrl(host: PlaygroundEmbed): string {
  const override = host.getAttribute('data-wasm-base')
  if (override) return override.replace(/\/?$/, '/')
  return './wasm/'
}

function bundleUrl(host: PlaygroundEmbed): string {
  // Bundle lives at the docs root, one level above the wasm/ subdir.
  return wasmBaseUrl(host).replace(/wasm\/$/, '') + 'aihu-preview-bundle.js'
}

async function loadWasm(host: PlaygroundEmbed): Promise<WasmModule | null> {
  if (wasmPromise) return wasmPromise
  wasmPromise = (async () => {
    const base = wasmBaseUrl(host)
    try {
      const probe = await fetch(`${base}aihu_compiler.js`, { method: 'HEAD' })
      const ct = probe.headers.get('content-type') ?? ''
      if (!probe.ok || ct.includes('text/html')) return null
    } catch {
      return null
    }
    try {
      const mod = (await import(/* @vite-ignore */ `${base}aihu_compiler.js`)) as WasmModule
      await mod.default({ module_or_path: `${base}aihu_compiler_bg.wasm` })
      return mod
    } catch (err) {
      console.warn('[playground-embed] WASM load failed:', err)
      return null
    }
  })()
  return wasmPromise
}

async function loadBundle(host: PlaygroundEmbed): Promise<string | null> {
  if (bundlePromise) return bundlePromise
  bundlePromise = (async () => {
    try {
      const res = await fetch(bundleUrl(host))
      if (!res.ok) return null
      const ct = res.headers.get('content-type') ?? ''
      // Cloudflare Pages serves index.html for unknown paths in SPA mode.
      if (ct.includes('text/html')) return null
      return await res.text()
    } catch {
      return null
    }
  })()
  return bundlePromise
}

/**
 * Strip TypeScript-specific syntax from WASM compiler output so the JS is
 * valid for `eval`/script execution in a browser context.
 *
 * The compiler emits exactly two TS-specific constructs:
 *   - `import type { Signal }` lines (type-only imports)
 *   - ` as unknown as Signal<string>` casts inside leaf() calls
 *   - ` as ShadowRoot` cast in the style-injection setup line
 * All `import … from '@aihu/*'` lines are stripped because those packages
 * are already available via window.__aihu in the preview iframe.
 */
function stripTs(js: string): string {
  return js
    .replace(/^import type .+$/gm, '')
    .replace(/^import .+ from ['"]@aihu\/[^'"]+['"];?$/gm, '')
    .replace(/ as unknown as Signal<string>/g, '')
    .replace(/ as ShadowRoot/g, '')
}

/**
 * Build the full srcdoc HTML for the preview iframe.
 *
 * Structure:
 *   1. IIFE bundle sets window.__aihu = { branch, leaf, signal, … }
 *   2. Wrapper script: destructs __aihu, wires _setMount/_setSignal,
 *      executes the compiled user code, then appends <aihu-component>.
 *   3. Errors are caught and rendered as a styled pre inside #root.
 *
 * The `</script>` sequence is escaped in both bundle and user code to
 * prevent premature HTML tag closure.
 */
function buildPreviewDoc(bundle: string, userJs: string): string {
  const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>')
  const safeUserJs = userJs.replace(/<\/script>/gi, '<\\/script>')
  return [
    '<!DOCTYPE html><html><head>',
    '<meta charset="utf-8">',
    '<style>',
    'html,body{margin:0;padding:0;font-family:system-ui,sans-serif}',
    'body{padding:1rem}',
    '.pe-error{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;margin:0}',
    '</style></head><body>',
    '<div id="root"></div>',
    '<script>',
    safeBundle,
    '</script>',
    '<script>',
    '(function(){',
    'try{',
    'var _a=window.__aihu;',
    'var branch=_a.branch,leaf=_a.leaf,mount=_a.mount,slot=_a.slot,when=_a.when,each=_a.each;',
    'var signal=_a.signal,computed=_a.computed,effect=_a.effect,batch=_a.batch;',
    'var defineComponent=_a.defineComponent,defineElement=_a.defineElement;',
    'var _setMount=_a._setMount,_setSignal=_a._setSignal;',
    'var onMount=_a.onMount,onCleanup=_a.onCleanup,onAdopt=_a.onAdopt,onAttributeChange=_a.onAttributeChange;',
    '_setMount(mount);_setSignal(signal);',
    safeUserJs,
    'var c=document.createElement("aihu-component");',
    'document.getElementById("root").appendChild(c);',
    '}catch(e){',
    'var p=document.createElement("pre");',
    'p.className="pe-error";',
    'p.textContent=String(e);',
    'document.getElementById("root").appendChild(p);',
    '}',
    '})();',
    '</script>',
    '</body></html>',
  ].join('')
}

export class PlaygroundEmbed extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return ['initial-source']
  }

  private root: ShadowRoot
  private editor!: HTMLElement & { value: string }
  private iframe!: HTMLIFrameElement
  private latencyEl!: HTMLSpanElement
  private errorEl!: HTMLPreElement
  private wasm: WasmModule | null = null
  private bundle: string | null = null
  private wasmReady = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private source = DEFAULT_SOURCE

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    if (this.hasAttribute('initial-source')) {
      this.source = this.getAttribute('initial-source') ?? DEFAULT_SOURCE
    } else if (this.hasAttribute('initialSource')) {
      this.source = this.getAttribute('initialSource') ?? DEFAULT_SOURCE
    }
    this.render()
    void this.boot()
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null): void {
    if (name === 'initial-source' && next !== null && this.editor) {
      this.source = next
      this.editor.value = next
    }
  }

  private render(): void {
    const style = document.createElement('style')
    style.textContent = HOST_STYLES
    this.root.appendChild(style)

    const playground = document.createElement('div')
    playground.className = 'playground'

    // Editor pane
    const editorPane = document.createElement('div')
    editorPane.className = 'pane editor-pane'

    const editorHeader = document.createElement('header')
    const editorLabel = document.createElement('span')
    editorLabel.className = 'label'
    editorLabel.textContent = '.aihu source'
    this.latencyEl = document.createElement('span')
    this.latencyEl.className = 'latency'
    this.latencyEl.hidden = true
    editorHeader.append(editorLabel, this.latencyEl)
    editorPane.appendChild(editorHeader)

    const editorHost = document.createElement('div')
    editorHost.className = 'editor-host'
    this.editor = document.createElement('code-editor') as HTMLElement & { value: string }
    this.editor.setAttribute('value', this.source)
    this.editor.addEventListener('change', (ev) => {
      const detail = (ev as CustomEvent<{ value: string }>).detail
      this.onSourceChange(detail.value)
    })
    editorHost.appendChild(this.editor)
    editorPane.appendChild(editorHost)

    this.errorEl = document.createElement('pre')
    this.errorEl.className = 'error'
    this.errorEl.hidden = true
    editorPane.appendChild(this.errorEl)

    playground.appendChild(editorPane)

    // Preview pane
    const previewPane = document.createElement('div')
    previewPane.className = 'pane preview-pane'

    const previewHeader = document.createElement('header')
    const previewLabel = document.createElement('span')
    previewLabel.className = 'label'
    previewLabel.textContent = 'preview'
    previewHeader.appendChild(previewLabel)
    previewPane.appendChild(previewHeader)

    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.setAttribute('title', 'aihu playground preview')
    previewPane.appendChild(this.iframe)

    playground.appendChild(previewPane)
    this.root.appendChild(playground)
  }

  private async boot(): Promise<void> {
    const [mod, bundle] = await Promise.all([loadWasm(this), loadBundle(this)])
    if (mod === null) {
      this.setError(
        'WASM bundle unavailable. Tag a v* release (or run release.yml) to populate ./wasm/.',
      )
      return
    }
    this.wasm = mod
    this.bundle = bundle
    this.wasmReady = true
    this.compile(this.source)
  }

  private onSourceChange(value: string): void {
    this.source = value
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.compile(value), 250)
  }

  private compile(source: string): void {
    if (!this.wasmReady || !this.wasm) return
    try {
      const start = performance.now()
      const result = this.wasm.wasm_compile(source)
      const elapsed = performance.now() - start
      this.setLatency(elapsed)
      this.setError(null)
      this.postRender(result.js)
    } catch (err) {
      this.setError(err instanceof Error ? err.message : String(err))
    }
  }

  private postRender(js: string): void {
    if (!this.bundle) {
      // Bundle not available: show compiled JS as text fallback.
      const safeJs = js.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      this.iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>pre{margin:0;padding:8px;font-family:monospace;font-size:12px;white-space:pre-wrap}</style></head><body><pre>${safeJs}</pre></body></html>`
      return
    }
    const processed = stripTs(js)
    this.iframe.srcdoc = buildPreviewDoc(this.bundle, processed)
  }

  private setLatency(ms: number): void {
    this.latencyEl.hidden = false
    this.latencyEl.textContent = `${ms.toFixed(0)}ms`
    this.latencyEl.classList.toggle('over-budget', ms >= 200)
  }

  private setError(msg: string | null): void {
    if (msg === null) {
      this.errorEl.hidden = true
      this.errorEl.textContent = ''
    } else {
      this.errorEl.hidden = false
      this.errorEl.textContent = msg
    }
  }

  disconnectedCallback(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('playground-embed')) {
  customElements.define('playground-embed', PlaygroundEmbed)
}
