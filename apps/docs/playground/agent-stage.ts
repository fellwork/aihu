/**
 * <agent-stage> — the stage-first, agent-drivable demo surface.
 *
 * The thesis ("agent-first, human-served") made tangible: a real, COMPILED
 * `.aihu` component is the hero on a roomy stage. A human can use it directly;
 * on "Let an agent drive it", a scripted in-page agent invokes the component's
 * own `@agent` actions on the SAME live instance, step by step, and the on-screen
 * component visibly changes — driven over a postMessage bridge, not by clicking
 * the component's buttons.
 *
 * ── The agent-drive bridge (the novel part) ──────────────────────────────────
 *
 * The sandboxed `allow-scripts` (no allow-same-origin) iframe maps onto aihu's
 * capability bridge:
 *   • PARENT  (this element) = the agent / policy side that decides what to invoke.
 *   • IFRAME  (the srcdoc)   = the visible, driven component instance.
 *   • postMessage            = the wire (the only channel — sandbox forbids
 *                              same-origin DOM access).
 *
 * Inside the iframe, after mounting the CLIENT-compiled component, we take the
 * compiler-injected per-instance dispatcher off the mounted element via
 * `@aihu/runtime` `_takeAgentDispatcher(el)`. Its invokers are keyed by OPAQUE
 * IDs (`a_<fnv1a64(tag + ':' + name)>`) bound to this instance's live signals.
 * The parent drives by ACTION NAME; the iframe resolves name → opaqueId with the
 * same FNV-1a hash the compiler uses, calls the invoker, and posts back a fresh
 * state snapshot. The parent renders that snapshot in the inspector.
 *
 * Source compile reuses the WASM `aihu-compile` machinery from
 * `<playground-embed>` — but here we call the CLIENT target
 * (`wasm_compile_client`) so the `@agent` block lowers to the per-instance
 * dispatcher wiring. The editor is hidden behind a "view / edit source" toggle so
 * code never bleeds into the stage.
 */

import './code-editor.ts'
import { DEFAULT_DEMO_ID, DEMOS, type Demo, getDemo } from './demos.ts'

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
  wasm_compile_client: (source: string) => CompileResult
  wasm_version: () => string
}

let wasmPromise: Promise<WasmModule | null> | null = null
let bundlePromise: Promise<string | null> | null = null

function wasmBaseUrl(host: AgentStage): string {
  const override = host.getAttribute('data-wasm-base')
  if (override) return override.replace(/\/?$/, '/')
  return './wasm/'
}

function bundleUrl(host: AgentStage): string {
  return `${wasmBaseUrl(host).replace(/wasm\/$/, '')}aihu-preview-bundle.js`
}

async function loadWasm(host: AgentStage): Promise<WasmModule | null> {
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
      console.warn('[agent-stage] WASM load failed:', err)
      return null
    }
  })()
  return wasmPromise
}

async function loadBundle(host: AgentStage): Promise<string | null> {
  if (bundlePromise) return bundlePromise
  bundlePromise = (async () => {
    try {
      const res = await fetch(bundleUrl(host))
      if (!res.ok) return null
      const ct = res.headers.get('content-type') ?? ''
      if (ct.includes('text/html')) return null
      return await res.text()
    } catch {
      return null
    }
  })()
  return bundlePromise
}

/**
 * Strip TypeScript-specific syntax from WASM compiler output so the JS is valid
 * for script execution in the iframe. Mirrors `<playground-embed>`'s `stripTs`,
 * plus the client-build casts (`as any`, `as Element`) the dispatcher pass emits.
 */
function stripTs(js: string): string {
  return (
    js
      .replace(/^import type .+$/gm, '')
      .replace(/^import .+ from ['"]@aihu\/[^'"]+['"];?$/gm, '')
      // The CLIENT build appends `export const __agentDispatcher = { … }` (an
      // introspection-only module-scope template). The iframe runs this code as a
      // plain <script> (not a module), so a top-level `export` is a SyntaxError —
      // and we don't need that export (the bridge uses the per-instance dispatcher
      // injected via `_registerAgentDispatcher` in setup). Drop the `export`
      // keyword; the harmless `const __agentDispatcher` declaration may remain.
      .replace(/^export\s+/gm, '')
      .replace(/ as unknown as Signal<string>/g, '')
      .replace(/ as any/g, '')
      .replace(/ as ShadowRoot/g, '')
      .replace(/ as Element/g, '')
  )
}

const STAGE_TAG = 'aihu-component'

/**
 * Build the iframe srcdoc: runtime IIFE + compiled CLIENT component + mount +
 * the postMessage bridge listener.
 *
 * The bridge script (running INSIDE the iframe):
 *   • mounts <aihu-component> into #root,
 *   • takes the per-instance dispatcher via `__aihu._takeAgentDispatcher(el)`,
 *   • on `{type:'invoke', id, action, args}` resolves action → opaqueId (FNV-1a),
 *     calls the invoker, and posts `{type:'result', id, ok}` then
 *     `{type:'state', snapshot}`,
 *   • posts an initial `{type:'ready'}` + `{type:'state'}` after mount.
 *
 * `snapshot()` reads VISIBLE DOM (text + item count + data-done flags) so the
 * inspector reflects exactly what the user sees — the proof that the agent drove
 * the real instance, not a parallel model.
 */
function buildStageDoc(bundle: string, userJs: string): string {
  const safeBundle = bundle.replace(/<\/script>/gi, '<\\/script>')
  const safeUserJs = userJs.replace(/<\/script>/gi, '<\\/script>')
  return [
    '<!DOCTYPE html><html><head>',
    '<meta charset="utf-8">',
    '<style>',
    'html,body{margin:0;padding:0;font-family:system-ui,sans-serif;background:transparent}',
    'body{padding:1.5rem;display:flex;align-items:center;justify-content:center;min-height:calc(100vh - 3rem)}',
    '#root{width:100%}',
    '.as-error{color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;margin:0}',
    '</style></head><body>',
    '<div id="root"></div>',
    '<script>',
    safeBundle,
    '</script>',
    '<script>',
    '(function(){',
    'var _a=window.__aihu;',
    'try{',
    'var branch=_a.branch,leaf=_a.leaf,mount=_a.mount,slot=_a.slot,when=_a.when,each=_a.each;',
    'var signal=_a.signal,computed=_a.computed,effect=_a.effect,batch=_a.batch;',
    'var defineComponent=_a.defineComponent,defineElement=_a.defineElement;',
    'var _setMount=_a._setMount,_setSignal=_a._setSignal;',
    'var _registerAgentDispatcher=_a._registerAgentDispatcher,_takeAgentDispatcher=_a._takeAgentDispatcher;',
    'var onMount=_a.onMount,onCleanup=_a.onCleanup,onAdopt=_a.onAdopt,onAttributeChange=_a.onAttributeChange;',
    '_setMount(mount);_setSignal(signal);',
    // The compiled user code ends with `const __agentDispatcher = { … }` and NO
    // trailing semicolon/newline. The srcdoc parts are joined with '' (so the
    // CSS template literals keep their literal newlines), which would butt the
    // object's closing `}` straight against the next `var` → a SyntaxError. A
    // leading newline + trailing `;` fences the user block off cleanly.
    `\n${safeUserJs}\n;`,
    'var el=document.createElement("aihu-component");',
    'document.getElementById("root").appendChild(el);',
    // FNV-1a 64-bit (BigInt) → opaque member id, byte-identical to the compiler.
    'function opaqueId(tag,name){var FO=0xcbf29ce484222325n,FP=0x00000100000001b3n,M=0xffffffffffffffffn;var h=FO;var k=tag+":"+name;for(var i=0;i<k.length;i++){h^=BigInt(k.charCodeAt(i));h=(h*FP)&M;}return "a_"+h.toString(16).padStart(16,"0");}',
    `var TAG=${JSON.stringify(STAGE_TAG)};`,
    'var disp=_takeAgentDispatcher(el)||null;',
    // Snapshot the VISIBLE state so the inspector mirrors what the user sees.
    'function snapshot(){var sr=el.shadowRoot||el;var items=sr.querySelectorAll(".tl-item");var out={};',
    'if(items.length||sr.querySelector(".tl")){out.taskCount=items.length;out.tasks=[];items.forEach(function(li){out.tasks.push({text:(li.querySelector(".tl-text")||{}).textContent||"",done:li.getAttribute("data-done")==="true"});});}',
    'var cv=sr.querySelector(".ct-value");if(cv)out.count=Number(cv.textContent);',
    'var tv=sr.querySelector(".th-temp");if(tv)out.temp=parseInt(tv.textContent,10);',
    'var tm=sr.querySelector(".th-mode");if(tm)out.mode=tm.textContent;',
    'return out;}',
    'function postState(){parent.postMessage({type:"as-state",snapshot:snapshot()},"*");}',
    'window.addEventListener("message",function(ev){',
    'var d=ev.data;if(!d||d.type!=="as-invoke")return;',
    'var ok=false,error=null;',
    'try{if(!disp)throw new Error("no per-instance dispatcher (component built without client @agent?)");',
    'var oid=opaqueId(TAG,d.action);var fn=disp.actions[oid];',
    'if(typeof fn!=="function")throw new Error("unknown action: "+d.action);',
    'fn(d.args||[]);ok=true;}catch(e){error=String(e);}',
    'parent.postMessage({type:"as-result",id:d.id,ok:ok,error:error},"*");',
    'postState();',
    '});',
    'parent.postMessage({type:"as-ready",actions:disp?Object.keys(disp.actions).length:0},"*");',
    'postState();',
    '}catch(e){',
    'var p=document.createElement("pre");p.className="as-error";p.textContent=String(e);',
    'document.getElementById("root").appendChild(p);',
    'parent.postMessage({type:"as-error",error:String(e)},"*");',
    '}',
    '})();',
    '</script>',
    '</body></html>',
  ].join('')
}

/**
 * Parse the `@agent` contract from a demo source for the contract panel: the
 * action names declared in the `@agent` block plus the `describe:` strings from
 * the matching `$action:` entries. Pure string scan — no compiler round-trip
 * (the client build elides the manifest, and this is display-only).
 */
function parseContract(source: string): Array<{ name: string; describe: string }> {
  const agentBlock = source.match(/@agent\s*\{([\s\S]*?)\}/)
  if (!agentBlock) return []
  const names = [...agentBlock[1].matchAll(/action\s+(\w+)\s*\(/g)].map((m) => m[1])
  return names.map((name) => {
    const re = new RegExp(`${name}\\s*:\\s*\\{[\\s\\S]*?describe\\s*:\\s*['"\`]([^'"\`]*)['"\`]`)
    const m = source.match(re)
    return { name, describe: m ? m[1] : '' }
  })
}

const HOST_STYLES = `
:host {
  display: block;
  color: var(--fg, #1a1a1a);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
* { box-sizing: border-box; }
.demo-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-bottom: 1rem;
}
.demo-tab {
  padding: 5px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 999px;
  background: var(--bg, #fff);
  color: var(--muted, #666);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background .1s, color .1s, border-color .1s;
}
.demo-tab:hover { color: var(--fg, #1a1a1a); border-color: var(--muted, #999); }
.demo-tab[aria-pressed="true"] {
  background: var(--accent, #c8543a);
  border-color: var(--accent, #c8543a);
  color: #fff;
}
.blurb { margin: 0 0 1rem; color: var(--muted, #555); line-height: 1.6; max-width: 60ch; }
.layout {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 1.25rem;
  align-items: start;
}
.stage-col { min-width: 0; }
.stage {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background:
    radial-gradient(circle at 1px 1px, var(--border, #e6e6e6) 1px, transparent 0) 0 0 / 22px 22px,
    var(--stage-bg, #fcfcfc);
  overflow: hidden;
  min-height: 360px;
  display: flex;
}
.stage iframe {
  flex: 1;
  width: 100%;
  border: 0;
  min-height: 360px;
  height: 100%;
  background: transparent;
}
.panel {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 12px;
  background: var(--bg, #fff);
  padding: 1rem;
}
.panel + .panel { margin-top: 1rem; }
.panel h3 {
  margin: 0 0 .6rem;
  font-size: .72rem;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--muted, #888);
}
.drive-btn {
  width: 100%;
  padding: .7rem 1rem;
  border: 0;
  border-radius: 8px;
  background: var(--accent, #c8543a);
  color: #fff;
  font-size: .95rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.drive-btn:hover { filter: brightness(1.05); }
.drive-btn:disabled { opacity: .55; cursor: progress; }
.drive-hint { margin: .55rem 0 0; font-size: .8rem; color: var(--muted, #888); line-height: 1.5; }
.log {
  margin: .75rem 0 0;
  padding: 0;
  list-style: none;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  display: grid;
  gap: 4px;
}
.log li { display: flex; gap: 6px; align-items: baseline; color: var(--muted, #777); }
.log li.active { color: var(--accent, #c8543a); font-weight: 600; }
.log li.done { color: var(--fg, #1a1a1a); }
.log .marker { width: 1em; flex: 0 0 auto; }
.inspector {
  margin: 0;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--code-bg, #f6f8fa);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  padding: .6rem .7rem;
  max-height: 220px;
  overflow: auto;
}
.contract { display: grid; gap: .5rem; }
.contract-item { font-size: 12.5px; }
.contract-name {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: var(--accent, #c8543a);
  font-weight: 600;
}
.contract-desc { color: var(--muted, #777); margin-top: 1px; }
.source-toggle {
  margin-top: 1.25rem;
  display: flex;
  align-items: center;
  gap: .6rem;
}
.toggle-btn {
  padding: 5px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background: var(--bg, #fff);
  color: var(--muted, #555);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.toggle-btn:hover { color: var(--fg, #1a1a1a); }
.latency { font-variant-numeric: tabular-nums; color: var(--muted, #999); font-size: 12px; font-family: ui-monospace, monospace; }
.source-wrap { display: none; margin-top: .75rem; }
.source-wrap.open { display: block; }
.editor-host {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  height: clamp(260px, 45vh, 460px);
  display: flex;
}
code-editor { flex: 1; }
.error {
  margin: .5rem 0 0;
  padding: 8px 12px;
  background: #fef2f2;
  color: #b91c1c;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  white-space: pre-wrap;
  border: 1px solid #fecaca;
  border-radius: 6px;
}
@media (max-width: 860px) {
  .layout { grid-template-columns: 1fr; }
}
`

export class AgentStage extends HTMLElement {
  private root: ShadowRoot
  private iframe!: HTMLIFrameElement
  private editor!: HTMLElement & { value: string }
  private driveBtn!: HTMLButtonElement
  private logEl!: HTMLUListElement
  private inspectorEl!: HTMLPreElement
  private contractEl!: HTMLDivElement
  private blurbEl!: HTMLParagraphElement
  private demoBar!: HTMLDivElement
  private sourceWrap!: HTMLDivElement
  private toggleBtn!: HTMLButtonElement
  private latencyEl!: HTMLSpanElement
  private errorEl!: HTMLPreElement

  private wasm: WasmModule | null = null
  private bundle: string | null = null
  private ready = false
  private activeDemoId = DEFAULT_DEMO_ID
  private source = getDemo(DEFAULT_DEMO_ID)?.source ?? DEMOS[0].source
  private driving = false
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private invokeSeq = 0
  private pending = new Map<number, (ok: boolean) => void>()
  private readonly onMessage = (ev: MessageEvent): void => this.handleMessage(ev)

  constructor() {
    super()
    this.root = this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    this.render()
    window.addEventListener('message', this.onMessage)
    void this.boot()
  }

  disconnectedCallback(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    window.removeEventListener('message', this.onMessage)
  }

  private render(): void {
    const style = document.createElement('style')
    style.textContent = HOST_STYLES
    this.root.appendChild(style)

    // Demo selector
    this.demoBar = document.createElement('div')
    this.demoBar.className = 'demo-bar'
    this.demoBar.setAttribute('role', 'tablist')
    this.demoBar.setAttribute('aria-label', 'Pick a demo')
    for (const demo of DEMOS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'demo-tab'
      btn.dataset.demoId = demo.id
      btn.textContent = demo.label
      btn.setAttribute('role', 'tab')
      btn.setAttribute('aria-pressed', String(demo.id === this.activeDemoId))
      btn.addEventListener('click', () => this.selectDemo(demo.id))
      this.demoBar.appendChild(btn)
    }
    this.root.appendChild(this.demoBar)

    this.blurbEl = document.createElement('p')
    this.blurbEl.className = 'blurb'
    this.root.appendChild(this.blurbEl)

    // Layout: stage + side panels
    const layout = document.createElement('div')
    layout.className = 'layout'

    const stageCol = document.createElement('div')
    stageCol.className = 'stage-col'
    const stage = document.createElement('div')
    stage.className = 'stage'
    this.iframe = document.createElement('iframe')
    this.iframe.setAttribute('sandbox', 'allow-scripts')
    this.iframe.setAttribute('title', 'aihu live component stage')
    stage.appendChild(this.iframe)
    stageCol.appendChild(stage)

    // Source toggle (hidden editor)
    const toggleRow = document.createElement('div')
    toggleRow.className = 'source-toggle'
    this.toggleBtn = document.createElement('button')
    this.toggleBtn.type = 'button'
    this.toggleBtn.className = 'toggle-btn'
    this.toggleBtn.textContent = 'View / edit source'
    this.toggleBtn.setAttribute('aria-expanded', 'false')
    this.toggleBtn.addEventListener('click', () => this.toggleSource())
    this.latencyEl = document.createElement('span')
    this.latencyEl.className = 'latency'
    toggleRow.append(this.toggleBtn, this.latencyEl)
    stageCol.appendChild(toggleRow)

    this.sourceWrap = document.createElement('div')
    this.sourceWrap.className = 'source-wrap'
    const editorHost = document.createElement('div')
    editorHost.className = 'editor-host'
    this.editor = document.createElement('code-editor') as HTMLElement & { value: string }
    this.editor.setAttribute('value', this.source)
    this.editor.addEventListener('change', (ev) => {
      const detail = (ev as CustomEvent<{ value: string }>).detail
      this.onSourceChange(detail.value)
    })
    editorHost.appendChild(this.editor)
    this.sourceWrap.appendChild(editorHost)
    this.errorEl = document.createElement('pre')
    this.errorEl.className = 'error'
    this.errorEl.hidden = true
    this.sourceWrap.appendChild(this.errorEl)
    stageCol.appendChild(this.sourceWrap)

    layout.appendChild(stageCol)

    // Side: drive panel + inspector + contract
    const side = document.createElement('div')
    side.className = 'side-col'

    const drivePanel = document.createElement('div')
    drivePanel.className = 'panel'
    const driveH = document.createElement('h3')
    driveH.textContent = 'Drive it'
    this.driveBtn = document.createElement('button')
    this.driveBtn.type = 'button'
    this.driveBtn.className = 'drive-btn'
    this.driveBtn.textContent = 'Let an agent drive it'
    this.driveBtn.addEventListener('click', () => void this.runAgent())
    const driveHint = document.createElement('p')
    driveHint.className = 'drive-hint'
    driveHint.textContent =
      'You can use the component on the stage by hand. Or hand it to an agent — it invokes the same @agent actions on the same live instance.'
    this.logEl = document.createElement('ul')
    this.logEl.className = 'log'
    drivePanel.append(driveH, this.driveBtn, driveHint, this.logEl)
    side.appendChild(drivePanel)

    const inspectorPanel = document.createElement('div')
    inspectorPanel.className = 'panel'
    const inspH = document.createElement('h3')
    inspH.textContent = 'State inspector'
    this.inspectorEl = document.createElement('pre')
    this.inspectorEl.className = 'inspector'
    this.inspectorEl.textContent = '—'
    inspectorPanel.append(inspH, this.inspectorEl)
    side.appendChild(inspectorPanel)

    const contractPanel = document.createElement('div')
    contractPanel.className = 'panel'
    const contractH = document.createElement('h3')
    contractH.textContent = '@agent contract'
    this.contractEl = document.createElement('div')
    this.contractEl.className = 'contract'
    contractPanel.append(contractH, this.contractEl)
    side.appendChild(contractPanel)

    layout.appendChild(side)
    this.root.appendChild(layout)

    this.applyDemoMeta(getDemo(this.activeDemoId))
  }

  private applyDemoMeta(demo: Demo | undefined): void {
    if (!demo) return
    this.blurbEl.textContent = demo.blurb
    // Contract panel
    this.contractEl.replaceChildren()
    for (const entry of parseContract(demo.source)) {
      const item = document.createElement('div')
      item.className = 'contract-item'
      const name = document.createElement('div')
      name.className = 'contract-name'
      name.textContent = `${entry.name}()`
      item.appendChild(name)
      if (entry.describe) {
        const desc = document.createElement('div')
        desc.className = 'contract-desc'
        desc.textContent = entry.describe
        item.appendChild(desc)
      }
      this.contractEl.appendChild(item)
    }
    // Reset log + inspector
    this.renderLog(demo, -1)
    this.inspectorEl.textContent = '—'
  }

  private renderLog(demo: Demo, activeIdx: number): void {
    this.logEl.replaceChildren()
    demo.agentScript.forEach((step, i) => {
      const li = document.createElement('li')
      const marker = document.createElement('span')
      marker.className = 'marker'
      if (i < activeIdx) {
        marker.textContent = '✓'
        li.classList.add('done')
      } else if (i === activeIdx) {
        marker.textContent = '▸'
        li.classList.add('active')
      } else {
        marker.textContent = '·'
      }
      const text = document.createElement('span')
      text.textContent = step.label
      li.append(marker, text)
      this.logEl.appendChild(li)
    })
  }

  private async boot(): Promise<void> {
    const [mod, bundle] = await Promise.all([loadWasm(this), loadBundle(this)])
    if (mod === null || bundle === null) {
      this.setError(
        'WASM compiler bundle unavailable. The stage compiles components in your browser; run `bun run build` in apps/docs (or tag a release) to populate ./wasm/.',
      )
      return
    }
    this.wasm = mod
    this.bundle = bundle
    this.ready = true
    this.compile(this.source)
  }

  private selectDemo(id: string): void {
    const demo = getDemo(id)
    if (!demo) return
    this.activeDemoId = id
    this.source = demo.source
    this.editor.value = demo.source
    this.demoBar.querySelectorAll<HTMLButtonElement>('.demo-tab').forEach((tab) => {
      tab.setAttribute('aria-pressed', String(tab.dataset.demoId === id))
    })
    this.applyDemoMeta(demo)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.compile(demo.source)
  }

  private onSourceChange(value: string): void {
    this.source = value
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.compile(value), 250)
  }

  private toggleSource(): void {
    const open = this.sourceWrap.classList.toggle('open')
    this.toggleBtn.setAttribute('aria-expanded', String(open))
    this.toggleBtn.textContent = open ? 'Hide source' : 'View / edit source'
  }

  private compile(source: string): void {
    if (!this.ready || !this.wasm || !this.bundle) return
    try {
      const start = performance.now()
      const result = this.wasm.wasm_compile_client(source)
      const elapsed = performance.now() - start
      this.latencyEl.textContent = `compiled in ${elapsed.toFixed(0)}ms`
      this.setError(null)
      const processed = stripTs(result.js)
      this.iframe.srcdoc = buildStageDoc(this.bundle, processed)
    } catch (err) {
      this.setError(err instanceof Error ? err.message : String(err))
    }
  }

  private handleMessage(ev: MessageEvent): void {
    if (!this.iframe || ev.source !== this.iframe.contentWindow) return
    const data = ev.data as { type?: string; id?: number; ok?: boolean; snapshot?: unknown } | null
    if (!data || typeof data.type !== 'string') return
    if (data.type === 'as-state') {
      this.inspectorEl.textContent = JSON.stringify(data.snapshot, null, 2)
    } else if (data.type === 'as-result' && typeof data.id === 'number') {
      const resolve = this.pending.get(data.id)
      if (resolve) {
        this.pending.delete(data.id)
        resolve(Boolean(data.ok))
      }
    }
  }

  /** Send one action invocation to the iframe and resolve when it acks. */
  private invoke(action: string, args: readonly unknown[]): Promise<boolean> {
    const id = ++this.invokeSeq
    return new Promise<boolean>((resolve) => {
      this.pending.set(id, resolve)
      this.iframe.contentWindow?.postMessage({ type: 'as-invoke', id, action, args }, '*')
      // Safety timeout so a dropped message never wedges the run.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id)
          resolve(false)
        }
      }, 3000)
    })
  }

  /** Run the active demo's scripted agent, step by step with a visible delay. */
  private async runAgent(): Promise<void> {
    if (this.driving) return
    const demo = getDemo(this.activeDemoId)
    if (!demo) return
    this.driving = true
    this.driveBtn.disabled = true
    this.driveBtn.textContent = 'Agent driving…'
    try {
      for (let i = 0; i < demo.agentScript.length; i++) {
        this.renderLog(demo, i)
        const step = demo.agentScript[i]
        await this.invoke(step.action, step.args)
        await new Promise((r) => setTimeout(r, 750))
      }
      this.renderLog(demo, demo.agentScript.length)
    } finally {
      this.driving = false
      this.driveBtn.disabled = false
      this.driveBtn.textContent = 'Let an agent drive it again'
    }
  }

  private setError(msg: string | null): void {
    if (msg === null) {
      this.errorEl.hidden = true
      this.errorEl.textContent = ''
    } else {
      this.errorEl.hidden = false
      this.errorEl.textContent = msg
      // Surface compile errors even when the editor is collapsed.
      if (!this.sourceWrap.classList.contains('open')) this.toggleSource()
    }
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('agent-stage')) {
  customElements.define('agent-stage', AgentStage)
}
