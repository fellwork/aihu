// Aihu components — registered as custom elements on import
import './components/theme-toggle.aihu'
import './components/live-demo.aihu'
import './components/docs-shell.aihu'

// Homepage playground (Directive 1 — interactive playground per
// docs/roadmap/_user-directives.md). Self-registers as
// <playground-embed> + <code-editor>. CodeMirror and the WASM module
// are lazy-loaded chunks so the initial docs bundle stays under the
// 1 MB budget (Directive 1 §3).
import '../playground/playground-embed.ts'
