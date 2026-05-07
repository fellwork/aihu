/**
 * <playground-embed> — interactive .aihu playground for the homepage.
 *
 * Implements Directive 1 (homepage interactive playground per
 * `docs/roadmap/_user-directives.md`). The element splits a CodeMirror
 * source editor on the left from a sandboxed live-preview iframe on
 * the right; the WASM-built `aihu-compile` runs the user's source on
 * every (debounced) edit and posts the compiled JS into the iframe.
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
 * the docs root. If the bundle is unavailable (no v0.1.0 release yet),
 * an `UNAVAILABLE` marker is written there and the playground renders
 * a clear fallback message — it never silently fails.
 *
 * Iframe sandboxing: the preview iframe runs with `sandbox="allow-scripts"`
 * only — no `allow-same-origin`. It cannot reach the parent's cookies,
 * storage, or DOM; it can only receive `postMessage` payloads from the
 * parent. Compiled JS rendered inside the sandbox is treated as trusted
 * (the user authored it) but quarantined from the host page regardless.
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
    <p>Count: {{ count() }}</p>
    <button $on:click={() => setCount(count() + 1)}>+</button>
  </div>
}

@style {
  .demo { padding: 1rem; font-family: system-ui, sans-serif; }
  button { padding: .25rem .75rem; cursor: pointer; }
}
`

/**
 * Static HTML document loaded into the preview iframe via `srcdoc`.
 * Built from text fragments (no inline `innerHTML` assignment) so the
 * compiled JS payload from `wasm_compile` can be displayed in the
 * sandbox without ever being assigned via `innerHTML`. The iframe runs
 * with `sandbox="allow-scripts"` only.
 */
const PREVIEW_DOC = [
  '<!DOCTYPE html>',
  '<html><head><meta charset="utf-8"><style>',
  'html,body{margin:0;padding:0;font-family:system-ui,sans-serif}',
  'body{padding:1rem}',
  '.pe-error{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap}',
  '.pe-empty{color:#888;font-style:italic;padding:12px}',
  '.pe-output{white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;margin:0}',
  '</style></head><body>',
  '<div id="root"></div>',
  '<script>',
  '(function(){',
  '  var root=document.getElementById("root");',
  '  function clearRoot(){while(root.firstChild)root.removeChild(root.firstChild);}',
  '  function showEmpty(){clearRoot();var p=document.createElement("p");p.className="pe-empty";p.textContent="Waiting for compile…";root.appendChild(p);}',
  '  function showOutput(js){clearRoot();var pre=document.createElement("pre");pre.className="pe-output";pre.textContent=js||"";root.appendChild(pre);}',
  '  function showError(msg){clearRoot();var d=document.createElement("div");d.className="pe-error";d.textContent="Render error: "+msg;root.appendChild(d);}',
  '  showEmpty();',
  '  window.addEventListener("message",function(event){',
  '    var msg=event&&event.data;if(!msg||msg.type!=="aihu-render")return;',
  '    try{showOutput(msg.js);}catch(err){showError(err&&err.message?err.message:String(err));}',
  '  });',
  '  if(window.parent)window.parent.postMessage({type:"aihu-preview-ready"},"*");',
  '})();',
  '</script></body></html>',
].join('\n')

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
  default: (input?: string | URL | Request) => Promise<unknown>
  wasm_compile: (source: string) => CompileResult
  wasm_version: () => string
}

let wasmPromise: Promise<WasmModule | null> | null = null

/**
 * Resolve the URL of the bundled WASM glue module, relative to this
 * compiled JS file. Build pipelines (rolldown/vite) that fingerprint
 * dist/ paths can override via the `data-wasm-base` attribute.
 */
function wasmBaseUrl(host: PlaygroundEmbed): string {
  const override = host.getAttribute('data-wasm-base')
  if (override) return override.replace(/\/?$/, '/')
  // The docs site is served from `/`; the prebuild script extracts the
  // tarball into `apps/docs/dist/wasm/`. From the rendered HTML at `/`
  // this is reachable as `./wasm/`.
  return './wasm/'
}

async function loadWasm(host: PlaygroundEmbed): Promise<WasmModule | null> {
  if (wasmPromise) return wasmPromise
  wasmPromise = (async () => {
    const base = wasmBaseUrl(host)
    // Probe for the JS glue file. We check content-type because Cloudflare
    // Pages serves index.html (200, text/html) for every unknown path in SPA
    // mode — a plain `probe.ok` check would always be true, making the
    // UNAVAILABLE marker probe unreliable. If the server returns HTML instead
    // of JS, the bundle hasn't been deployed yet.
    try {
      const probe = await fetch(`${base}aihu_compiler.js`, { method: 'HEAD' })
      const ct = probe.headers.get('content-type') ?? ''
      if (!probe.ok || ct.includes('text/html')) return null
    } catch {
      return null
    }
    try {
      // Use a runtime import so bundlers don't try to resolve at build.
      const mod = (await import(/* @vite-ignore */ `${base}aihu_compiler.js`)) as WasmModule
      await mod.default(`${base}aihu_compiler_bg.wasm`)
      return mod
    } catch (err) {
      console.warn('[playground-embed] WASM load failed:', err)
      return null
    }
  })()
  return wasmPromise
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
  private wasmReady = false
  private previewReady = false
  private pendingJs: string | null = null
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
      // Tolerate camelCase per spec.
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
    previewLabel.textContent = 'compiled output'
    previewHeader.appendChild(previewLabel)
    previewPane.appendChild(previewHeader)

    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.setAttribute('title', 'aihu playground preview')
    this.iframe.srcdoc = PREVIEW_DOC
    previewPane.appendChild(this.iframe)

    playground.appendChild(previewPane)
    this.root.appendChild(playground)

    window.addEventListener('message', this.onMessage)
  }

  private onMessage = (event: MessageEvent): void => {
    if (
      event.source === this.iframe.contentWindow &&
      event.data &&
      event.data.type === 'aihu-preview-ready'
    ) {
      this.previewReady = true
      if (this.pendingJs !== null) {
        this.postRender(this.pendingJs)
        this.pendingJs = null
      }
    }
  }

  private async boot(): Promise<void> {
    const mod = await loadWasm(this)
    if (mod === null) {
      this.setError(
        'WASM bundle unavailable. Tag a v* release (or run release.yml) to populate ./wasm/.',
      )
      return
    }
    this.wasm = mod
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
    if (!this.previewReady) {
      this.pendingJs = js
      return
    }
    this.iframe.contentWindow?.postMessage({ type: 'aihu-render', js }, '*')
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
    window.removeEventListener('message', this.onMessage)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('playground-embed')) {
  customElements.define('playground-embed', PlaygroundEmbed)
}
