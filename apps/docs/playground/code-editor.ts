/**
 * <code-editor> — thin CodeMirror 6 wrapper exposed as a custom element.
 *
 * Used by <playground-embed> on the homepage (Directive 1). Kept as a
 * separate Web Component so the CodeMirror payload can be code-split
 * away from the rest of the docs bundle.
 *
 * Properties:
 *   value (attribute or property) — current source. Reading returns the
 *     latest editor contents; setting replaces them.
 *
 * Events:
 *   change — fired (debounced) on every edit. `event.detail.value` is
 *     the new source string.
 *
 * No shadow DOM: CodeMirror manages its own DOM and styles. We expose
 * a minimal `.code-editor` host class for layout.
 *
 * Spec: docs/roadmap/_user-directives.md Directive 1.
 */

// Lazy-load CodeMirror. Importing eagerly would inflate the initial
// docs bundle past the 1 MB Directive 1 budget.
type CmModule = typeof import('@codemirror/state')
type CmViewModule = typeof import('@codemirror/view')
type CmJsModule = typeof import('@codemirror/lang-javascript')

let cmPromise: Promise<{
  state: CmModule
  view: CmViewModule
  js: CmJsModule
}> | null = null

function loadCodeMirror() {
  if (!cmPromise) {
    cmPromise = Promise.all([
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/lang-javascript'),
    ]).then(([state, view, js]) => ({ state, view, js }))
  }
  return cmPromise
}

const HOST_STYLES = `
:host { display: block; min-width: 0; overflow: hidden; }
.code-editor-mount { height: 100%; min-height: 240px; font-size: 13px; overflow: hidden; }
.code-editor-fallback {
  height: 100%;
  min-height: 240px;
  width: 100%;
  resize: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.55;
  padding: 12px;
  box-sizing: border-box;
  outline: none;
}
`

export class CodeEditor extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return ['value']
  }

  private mountNode: HTMLDivElement
  private fallbackNode: HTMLTextAreaElement
  private view: import('@codemirror/view').EditorView | null = null
  private _value = ''
  private _ready = false
  private _debounce: ReturnType<typeof setTimeout> | null = null

  constructor() {
    super()
    const root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = HOST_STYLES
    root.appendChild(style)

    this.mountNode = document.createElement('div')
    this.mountNode.className = 'code-editor-mount'
    root.appendChild(this.mountNode)

    // Pre-CodeMirror fallback — keeps the editor usable even before the
    // chunk loads (and during SSR / no-JS scenarios).
    this.fallbackNode = document.createElement('textarea')
    this.fallbackNode.className = 'code-editor-fallback'
    this.fallbackNode.spellcheck = false
    this.fallbackNode.addEventListener('input', () => {
      this._value = this.fallbackNode.value
      this.emitChange()
    })
    this.mountNode.appendChild(this.fallbackNode)
  }

  connectedCallback(): void {
    if (this.hasAttribute('value')) {
      this._value = this.getAttribute('value') ?? ''
      this.fallbackNode.value = this._value
    }
    void this.boot()
  }

  attributeChangedCallback(name: string, _old: string | null, next: string | null): void {
    if (name === 'value') {
      const v = next ?? ''
      if (v !== this._value) {
        this._value = v
        if (this.view) {
          this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: v },
          })
        } else {
          this.fallbackNode.value = v
        }
      }
    }
  }

  get value(): string {
    return this._value
  }

  set value(v: string) {
    if (v === this._value) return
    this._value = v
    if (this.view) {
      this.view.dispatch({
        changes: { from: 0, to: this.view.state.doc.length, insert: v },
      })
    } else {
      this.fallbackNode.value = v
    }
  }

  private async boot(): Promise<void> {
    if (this._ready) return
    let cm: Awaited<ReturnType<typeof loadCodeMirror>>
    try {
      cm = await loadCodeMirror()
    } catch (err) {
      // Stay on the textarea fallback if CodeMirror fails to load.
      console.warn('[code-editor] CodeMirror unavailable; using textarea fallback:', err)
      return
    }
    if (!this.isConnected) return

    const { EditorState } = cm.state
    const { EditorView, keymap, lineNumbers, highlightActiveLine } = cm.view
    const { javascript } = cm.js
    // defaultKeymap pulled from @codemirror/commands lazily — only if
    // available — to keep the chunk minimal.
    let defaultKeymap: readonly import('@codemirror/view').KeyBinding[] = []
    try {
      const commands = (await import('@codemirror/commands').catch(() => null)) as
        | typeof import('@codemirror/commands')
        | null
      if (commands) defaultKeymap = commands.defaultKeymap
    } catch {
      /* optional dep */
    }

    // Remove the textarea fallback now that CodeMirror is online.
    this.fallbackNode.remove()

    const updateListener = EditorView.updateListener.of((u) => {
      if (u.docChanged) {
        this._value = u.state.doc.toString()
        this.emitChange()
      }
    })

    const state = EditorState.create({
      doc: this._value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        javascript({ typescript: true }),
        keymap.of(defaultKeymap),
        updateListener,
        // Wrap long lines so the editor never sets a wide intrinsic width that
        // overflows its grid column into the preview pane.
        EditorView.lineWrapping,
        EditorView.theme({
          '&': { height: '100%', maxWidth: '100%' },
          '.cm-scroller': {
            fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
            overflowX: 'auto',
          },
        }),
      ],
    })

    this.view = new EditorView({ state, parent: this.mountNode })
    this._ready = true
  }

  private emitChange(): void {
    if (this._debounce) clearTimeout(this._debounce)
    this._debounce = setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent('change', { detail: { value: this._value }, bubbles: true }),
      )
    }, 50)
  }

  disconnectedCallback(): void {
    if (this._debounce) clearTimeout(this._debounce)
    this.view?.destroy()
    this.view = null
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('code-editor')) {
  customElements.define('code-editor', CodeEditor)
}
