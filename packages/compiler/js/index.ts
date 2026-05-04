/**
 * @scribe/compiler — TypeScript wrapper around the scribe-compile Rust binary.
 *
 * Exports:
 *   transform(source, id)    — compile a single .scribe file to TypeScript
 *   scribeCompilerPlugin()   — Vite plugin that wires transform() into the build
 */
import { execFileSync } from 'node:child_process'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Binary resolution: env var override, fallback to the bin/ directory written
// by the postinstall hook (packages/compiler/bin/scribe-compile[.exe]).
const ext = process.platform === 'win32' ? '.exe' : ''
const binPath: string =
  process.env.SCRIBE_COMPILE_BIN ??
  resolve(dirname(fileURLToPath(import.meta.url)), `../bin/scribe-compile${ext}`)

// Minimal VitePlugin interface — avoids importing from 'vite' at compile time.
// Structurally compatible with Vite's Plugin type.
interface VitePlugin {
  readonly name: string
  enforce?: 'pre' | 'post'
  transform?: (
    code: string,
    id: string,
  ) => Promise<{ code: string; map: null }> | { code: string; map: null } | null | undefined
}

/**
 * Options for `scribeCompilerPlugin()` (Plan 3.3 — Islands).
 */
export interface ScribeCompilerPluginOptions {
  /**
   * When `true` (default), components classified as `'static'` by
   * `_classifyIsland()` are emitted with a minimal HTML-only registration
   * shim that ships **zero** `@scribe/runtime` and `@scribe/signals` JS to
   * the browser. Components classified as `'interactive'` retain the
   * full runtime path.
   *
   * Setting `islands: false` opts every component back into the unified
   * runtime path (Plan 3.2 baseline behaviour).
   */
  islands?: boolean

  /**
   * Project-wide shadow-DOM mode applied to every `.scribe` SFC compiled
   * by this plugin instance. When set, the plugin post-processes the
   * compiled JS to inject `, { shadowMode: '<mode>' }` as the third arg
   * to the emitted `defineElement(tag, defineComponent(...))` call.
   *
   * - `'open'`   — default browser behaviour (shadow root, externally readable).
   * - `'closed'` — shadow root, externally hidden.
   * - `'none'`   — **no shadow root.** The component mounts into its own
   *               element. Required for global utility-class CSS frameworks
   *               like Tailwind, UnoCSS, Pico that rely on the cascade.
   *
   * Per-component override is not yet supported via SFC syntax (post-v1).
   * For per-component control today, hand-author the component with
   * `defineElement(tag, Ctor, { shadowMode: '...' })`.
   */
  shadowMode?: 'open' | 'closed' | 'none'
}

/**
 * Inject `{ shadowMode: '...' }` as the third argument to the emitted
 * `defineElement('tag', defineComponent(...))` call. The compiler emits
 * exactly two arguments today; this rewrites the closing of the
 * defineElement call to include the options object. Idempotent — leaves
 * code untouched when the closer is not in the expected shape.
 *
 * @internal
 */
export function _injectShadowMode(code: string, mode: 'open' | 'closed' | 'none'): string {
  // Match the trailing `))` that closes `defineElement(tag, defineComponent(setup))`.
  // The compiler always emits this exact two-paren close as the final tokens of
  // the defineElement call — we anchor on it and append the options object.
  // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] is valid JS — matches any char including newlines
  const re = /(defineElement\(\s*['"][^'"]+['"]\s*,\s*defineComponent\([^]*\))\s*\)/
  const replaced = code.replace(re, (_m, inner: string) => `${inner}, { shadowMode: '${mode}' })`)
  return replaced
}

/**
 * Classify the compiled output of a single `.scribe` module as either a
 * **static** island (no reactive state — purely declarative DOM) or an
 * **interactive** island (uses the signals reactivity system).
 *
 * The heuristic is intentionally conservative: any source-level reference
 * to `signal(`, `computed(`, `effect(`, or `setSignal(` flips the file to
 * `'interactive'`. False positives (e.g. a string literal containing
 * `signal(`) are tolerable — they only forfeit the static-island
 * optimisation. False negatives are forbidden: a static-classified file
 * MUST NOT depend on the signals runtime at execution time.
 *
 * Plan 3.3 / acceptance criterion 1.
 *
 * @internal
 */
export function _classifyIsland(compiledCode: string): 'static' | 'interactive' {
  // Match call sites of the four reactive primitives. Use word-boundary
  // anchors so identifiers like `mySignal(` or `__effect(` do not trip the
  // heuristic. The `(` is required so that bare imports of the names in an
  // unused `import { signal }` line do not flip an otherwise-static module.
  return /\b(?:signal|computed|effect|setSignal)\s*\(/.test(compiledCode) ? 'interactive' : 'static'
}

/**
 * Extract the custom element tag name from compiler-emitted code.
 * The compiler always emits `defineElement('tag-name', ...)` as the
 * first call — pull the first string literal argument.
 * Returns `null` if no `defineElement` call is found.
 * @internal
 */
function _extractElementTag(code: string): string | null {
  const m = /defineElement\(\s*['"]([^'"]+)['"]/m.exec(code)
  return m ? (m[1] ?? null) : null
}

/**
 * Instrument a compiled `.scribe` module with HMR support.
 *
 * The compiler always emits:
 *
 *   import { defineComponent, defineElement } from '@scribe/runtime'
 *   defineElement('tag', defineComponent((_ctx) => { ... }))
 *
 * This function:
 *
 *  1. Adds `_hmrReplace` to the `@scribe/runtime` import.
 *  2. Prepends a module-level slot variable `__scribe_setup__`.
 *  3. Rewrites the single `defineComponent(` call so the setup function
 *     is captured via an assignment expression:
 *     `defineComponent(__scribe_setup__ = ` (valid JS; assignment has
 *     lower precedence than arrow fn, so `defineComponent` still
 *     receives the function as its argument).
 *  4. Appends `export { __scribe_setup__ as default }` so that Vite's
 *     `import.meta.hot.accept` callback receives the new setup via
 *     `newModule.default` on hot reload.
 *  5. Appends the `import.meta.hot.accept` block, gated on `__DEV__`.
 *
 * The `__DEV__` guard ensures production bundlers (where they replace
 * `__DEV__` with `false`) dead-code-eliminate the entire HMR block.
 *
 * @internal
 */
function _buildHmrCode(compiledCode: string, elementTag: string): string {
  // Step 1 — add _hmrReplace to the @scribe/runtime import.
  const withImport = compiledCode.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@scribe\/runtime'/,
    (_m, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('_hmrReplace')) parts.push('_hmrReplace')
      return `import { ${parts.join(', ')} } from '@scribe/runtime'`
    },
  )

  // Step 2+3 — prepend slot variable and rewrite the defineComponent call.
  // Compiler emits exactly one `defineComponent(` followed by a function expr.
  // Rewrite: defineComponent(fn)  →  defineComponent(__scribe_setup__ = fn)
  // Assignment expression evaluates to `fn`, so defineComponent still
  // receives the setup function as its first argument unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preamble = `let __scribe_setup__: ((ctx: any) => any) | undefined\n`

  const patchedBody = withImport.replace(
    /\bdefineComponent\(/,
    'defineComponent(__scribe_setup__ = ',
  )

  const tag = JSON.stringify(elementTag)
  // Step 4+5 — postamble with default export and HMR acceptance.
  const postamble = `
export { __scribe_setup__ as default }

if (typeof __DEV__ !== 'undefined' && __DEV__ && import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newSetup = (newModule as any)['default']
    if (typeof newSetup !== 'function') return
    document.querySelectorAll(${tag}).forEach((el) => {
      _hmrReplace(el as HTMLElement, newSetup)
    })
  })
}
`

  return preamble + patchedBody + postamble
}

/**
 * Rewrite an interactive-island module so its `connectedCallback` waits
 * for the element to scroll into view before mounting. Plan 3.3 — applied
 * only when the consumer adds `defer` to the custom element tag (e.g.
 * `<my-counter defer>`); the runtime helper checks the attribute and
 * either mounts immediately or registers an `IntersectionObserver`.
 *
 * Implementation: the helper is added as a `_hydrateOnVisible` import
 * from `@scribe/runtime`, and the compiler-emitted `defineElement(...)`
 * call is wrapped in a `defineElement` that intercepts `connectedCallback`
 * to honour the `defer` attribute.
 *
 * The whole indirection is tree-shaken when no `.scribe` module reaches
 * this branch, because `_hydrateOnVisible` is exported from its own
 * sibling module inside `@scribe/runtime`.
 *
 * @internal
 */
export function _buildDeferredHydration(compiledCode: string, elementTag: string): string {
  // Add _hydrateOnVisible to the @scribe/runtime import.
  const withImport = compiledCode.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@scribe\/runtime'/,
    (_m, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('_hydrateOnVisible')) parts.push('_hydrateOnVisible')
      return `import { ${parts.join(', ')} } from '@scribe/runtime'`
    },
  )

  // Wrap the class returned by defineComponent BEFORE defineElement
  // consumes it. The HTML spec caches lifecycle callbacks at
  // customElements.define() time, so we MUST mutate the prototype
  // before that call — not after. We accomplish this with a synchronous
  // helper invoked between defineComponent and defineElement.
  //
  // Source pattern (compiler-emitted):
  //   defineElement('tag', defineComponent((_ctx) => { ... }))
  //
  // After this rewrite:
  //   defineElement('tag', __scribe_wrap_defer__(defineComponent((_ctx) => { ... })))
  //
  // …with __scribe_wrap_defer__ defined in the appended preamble.
  const patched = withImport.replace(
    /defineElement\(\s*('[^']+'|"[^"]+")\s*,\s*defineComponent\(/,
    (_m, tagLit: string) => `defineElement(${tagLit}, __scribe_wrap_defer__(defineComponent(`,
  )
  // Match the closing `))` of the defineElement call. The HMR pass may
  // have inserted `__scribe_setup__ = ` before the inner function, but
  // the trailing `))` shape is unchanged. Replace exactly one occurrence
  // by anchoring on end-of-string trim; bail if the shape does not match.
  if (patched === withImport) {
    // The expected `defineElement(<tag>, defineComponent(` shape was not
    // present (e.g. compiler output changed). Skip defer wrapping rather
    // than emit broken code.
    return compiledCode
  }
  // Add a trailing `)` to balance the extra `(` from __scribe_wrap_defer__.
  // Source shape after _buildHmrCode is:
  //   defineElement('tag', defineComponent(__scribe_setup__ = (_ctx) => {...}))
  //   export { __scribe_setup__ as default }
  //   if (typeof __DEV__ !== ...) { ... }
  // We must close BEFORE the export line. Match the first `))` followed
  // by a newline and `export` (or end-of-string for the unwrapped case).
  let balanced = patched.replace(/\)\s*\)\s*\nexport\s/, ')))\nexport ')
  if (balanced === patched) {
    // No HMR postamble — the `))` is at end-of-string.
    balanced = patched.replace(/\)\s*\)\s*$/, ')))\n')
  }
  if (balanced === patched) {
    // Could not find the matching `))` — bail out.
    return compiledCode
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const helper = `
// Plan 3.3 (Islands) — defer attribute support. Wraps the constructor
// returned by defineComponent so instances bearing the \`defer\` attribute
// hydrate lazily via IntersectionObserver. Bare instances retain the
// eager Plan 3.2 hydration path.
function __scribe_wrap_defer__<T extends typeof HTMLElement>(Ctor: T): T {
  const orig = (Ctor.prototype as unknown as { connectedCallback?: () => void }).connectedCallback
  if (typeof orig !== 'function') return Ctor
  ;(Ctor.prototype as unknown as { connectedCallback: () => void }).connectedCallback = function (this: HTMLElement) {
    if (this.hasAttribute('defer')) {
      _hydrateOnVisible(this, () => orig.call(this))
    } else {
      orig.call(this)
    }
  }
  return Ctor
}
`
  void elementTag
  return helper + balanced
}

/**
 * Build a static-island shim for a compiled module.
 *
 * The compiled module emitted by the Rust codegen has the shape:
 *
 *   import { branch, leaf, slot } from '@scribe/arbor'
 *   import { defineComponent, defineElement } from '@scribe/runtime'
 *   defineElement('tag', defineComponent((_ctx) => { return <tree> }))
 *
 * For a static island we know `<tree>` contains no `signal(`/`computed(`
 * calls. We can therefore:
 *
 *   1. Drop the `@scribe/runtime` import (saves ~600 B gz of defineComponent
 *      + defineElement + bootstrap glue).
 *   2. Replace `defineElement(tag, defineComponent(setup))` with a tiny
 *      inline class that mounts the tree directly via `mount()` (which the
 *      arbor barrel already exports).
 *   3. Tag the file with a `// SCRIBE_STATIC_ISLAND` comment so consumers
 *      can audit which routes shipped zero-JS-runtime.
 *
 * Falls back to the original code if the regex shape does not match
 * (defensive: a future compiler change must opt back into static-island
 * emission explicitly rather than silently break).
 *
 * @internal
 */
export function _buildStaticIsland(compiledCode: string, elementTag: string): string {
  // Confirm the shape we expect: a single defineElement(...) call wrapping
  // a single defineComponent(...) call. Bail out otherwise.
  const callRe = /defineElement\(\s*['"][^'"]+['"]\s*,\s*defineComponent\(/
  if (!callRe.test(compiledCode)) return compiledCode

  // Strip the `@scribe/runtime` import line entirely — static islands
  // don't reference defineComponent/defineElement after the rewrite.
  const withoutRuntimeImport = compiledCode.replace(
    /^\s*import\s*\{[^}]*\}\s*from\s*'@scribe\/runtime'\s*;?\s*$/m,
    '',
  )

  // Ensure `mount` is imported from @scribe/arbor (it already exposes
  // branch/leaf/slot, so we just append `mount` to the existing list).
  const withArborMount = withoutRuntimeImport.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@scribe\/arbor'/,
    (_m, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('mount')) parts.push('mount')
      return `import { ${parts.join(', ')} } from '@scribe/arbor'`
    },
  )

  // Replace `defineElement('tag', defineComponent((_ctx) => { ... }))`
  // with an inline `customElements.define` whose connectedCallback mounts
  // the static tree. The setup function is captured verbatim by replacing
  // the wrapping calls with anonymous-IIFE bookends.
  const tagJson = JSON.stringify(elementTag)
  const rewritten = withArborMount
    .replace(
      /defineElement\(\s*['"][^'"]+['"]\s*,\s*defineComponent\(/,
      `customElements.define(${tagJson}, class extends HTMLElement {\n  connectedCallback() {\n    const root = this.attachShadow({ mode: 'open' })\n    const __scribe_setup__ = (`,
    )
    .replace(
      /\)\s*\)\s*$/,
      `)\n    mount(__scribe_setup__({ host: root, element: this }), root)\n  }\n})\n`,
    )

  return `// SCRIBE_STATIC_ISLAND — zero @scribe/runtime references\n${rewritten}`
}

/**
 * Compile a .scribe source string to TypeScript.
 * map is null — source maps are deferred to v1 (OQ-C8)
 */
export function transform(source: string, id: string): { code: string; map: null } {
  const stem = basename(id, '.scribe')
  const code = execFileSync(binPath, ['--stdin', '--tag', stem, '--path', id], {
    input: source,
    encoding: 'utf8',
  })
  return {
    code,
    map: null, // source maps deferred to v1 (OQ-C8)
  }
}

/**
 * Inject `_setMount(mount)` + `_setSignal(signal)` auto-wiring into a compiled
 * `.scribe` module. Adds the necessary symbols to existing imports and inserts
 * the boot calls right after the last `import` statement.
 *
 * @internal
 */
export function _injectAutoWiring(code: string): string {
  // 1. Add `mount` to the @scribe/arbor import (or create it).
  let result: string
  if (code.includes("from '@scribe/arbor'")) {
    result = code.replace(
      /import\s*\{([^}]*)\}\s*from\s*'@scribe\/arbor'/,
      (_m: string, imports: string) => {
        const parts = imports.split(',').map((s) => s.trim()).filter(Boolean)
        if (!parts.includes('mount')) parts.push('mount')
        return `import { ${parts.join(', ')} } from '@scribe/arbor'`
      },
    )
  } else {
    result = `import { mount } from '@scribe/arbor'\n` + code
  }

  // 2. Add `signal` to the non-type @scribe/signals import (or create it).
  // Note: `import\s+\{` does NOT match `import type {` (the regex needs `{` immediately
  // after whitespace, whereas `import type {` has `type` in between).  No negation guard
  // is needed — the replace callback below already skips `import type` lines.
  if (/import\s+\{[^}]*\}\s+from\s+'@scribe\/signals'/.test(result)) {
    // There IS a value import from signals — add `signal` if missing.
    result = result.replace(
      /import\s*\{([^}]*)\}\s*from\s*'@scribe\/signals'/,
      (_m: string, imports: string) => {
        // Skip type-only imports
        if (_m.startsWith('import type')) return _m
        const parts = imports.split(',').map((s) => s.trim()).filter(Boolean)
        if (!parts.includes('signal')) parts.push('signal')
        return `import { ${parts.join(', ')} } from '@scribe/signals'`
      },
    )
  } else if (!/import.*from\s*'@scribe\/signals'/.test(result)) {
    // No signals import at all — insert after arbor import
    result = result.replace(
      /import\s*\{[^}]*\}\s*from\s*'@scribe\/arbor'/,
      (m: string) => `${m}\nimport { signal } from '@scribe/signals'`,
    )
  }
  // If only `import type { Signal }` exists, insert value import after it
  else if (/import\s+type\s+\{[^}]*\}\s+from\s+'@scribe\/signals'/.test(result) &&
           !result.match(/import\s+\{[^}]*\}\s+from\s+'@scribe\/signals'/)) {
    result = result.replace(
      /(import\s+type\s+\{[^}]*\}\s+from\s+'@scribe\/signals')/,
      (_m: string, typeImport: string) => `${typeImport}\nimport { signal } from '@scribe/signals'`,
    )
  }

  // 3. Add `_setMount`, `_setSignal` to the @scribe/runtime import.
  result = result.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@scribe\/runtime'/,
    (_m: string, imports: string) => {
      const parts = imports.split(',').map((s) => s.trim()).filter(Boolean)
      if (!parts.includes('_setMount')) parts.push('_setMount')
      if (!parts.includes('_setSignal')) parts.push('_setSignal')
      return `import { ${parts.join(', ')} } from '@scribe/runtime'`
    },
  )

  // 4. Insert boot calls after the last `import` statement.
  const lines = result.split('\n')
  let lastImportIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = (lines[i] ?? '').trim()
    if (t.startsWith('import ') || t.startsWith('import{')) {
      lastImportIdx = i
      break
    }
  }
  if (lastImportIdx !== -1) {
    lines.splice(lastImportIdx + 1, 0, '_setMount(mount)', '_setSignal(signal)', '')
    result = lines.join('\n')
  }

  return result
}

/**
 * Vite plugin that compiles .scribe files to TypeScript during build and dev.
 *
 * Use `enforce: 'pre'` so the hook fires before Vite/Rollup's built-in
 * parsers attempt to process the raw .scribe content as JavaScript.
 *
 * @example
 * // vite.config.ts
 * import { scribeCompilerPlugin } from '@scribe/compiler'
 * export default { plugins: [scribeCompilerPlugin()] }
 *
 * **Known Limitation — Bun + Rollup4 ESM incompatibility (v0):**
 *
 * `bun vite build` fails in the `fixtures/vite-counter` fixture with two
 * cascading errors:
 *
 * 1. **Missing devDependency:** `vite` is declared only as an optional
 *    `peerDependency` in `packages/compiler/package.json`. Bun does not
 *    install optional peers automatically, so `bun vite build` exits
 *    immediately with `Cannot find package 'vite'`.
 *
 * 2. **Bun + Rollup4 bridge:** Even with Vite installed, Bun processes
 *    `vite.config.ts` through its own internal bundler before handing off
 *    to Rollup4. When `@scribe/compiler` is resolved from the workspace
 *    symlink (`dist/index.js`), Bun's ESM loader evaluates the module at
 *    config-load time. The subprocess call inside `transform()` depends on
 *    the Rust binary being at `../bin/scribe-compile` relative to `dist/`
 *    (written by the postinstall hook). In a dev workspace where postinstall
 *    has not run, this path does not exist and `execFileSync` throws. Bun surfaces
 *    the error as a config-load failure, not a per-file transform error,
 *    causing the entire build to abort before any `.scribe` file is
 *    processed.
 *
 * **Workaround (v0):** Use `bun run integrate.ts` directly from
 * `packages/compiler/fixtures/vite-counter/`. This script calls
 * `transform()` from `@scribe/compiler` without involving Vite or Rollup.
 * Preconditions: (1) `cargo build --release` in `packages/compiler/`,
 * (2) `bun install` at the repo root.
 *
 * **v1 resolution:** Add `vite` as a `devDependency` in
 * `packages/compiler/package.json`; add a WASM or pre-built binary
 * strategy so the Rust binary is bundled with the npm package and does not
 * require a separate `cargo build --release` step.
 */
export function scribeCompilerPlugin(options?: ScribeCompilerPluginOptions): VitePlugin {
  const islandsEnabled = options?.islands !== false
  const shadowMode = options?.shadowMode
  return {
    name: 'scribe-compiler',
    enforce: 'pre',
    async transform(code, id) {
      // Strip Vite query strings (e.g. `?import`, `?t=...`) before checking the extension.
      const rawId = id.split('?')[0]!
      if (!rawId.endsWith('.scribe')) return undefined
      const result = transform(code, rawId)
      const compiled = shadowMode != null ? _injectShadowMode(result.code, shadowMode) : result.code
      const elementTag = _extractElementTag(compiled)

      let out: string

      // Plan 3.3 — static-island fast path. Bypasses HMR injection because
      // a component with no signals has no setup state to hot-replace.
      // Static islands strip @scribe/runtime entirely — do NOT inject auto-wiring
      // (it would reference _setMount/_setSignal as undefined identifiers).
      if (islandsEnabled && elementTag !== null && _classifyIsland(compiled) === 'static') {
        out = _buildStaticIsland(compiled, elementTag)
      } else if (elementTag !== null) {
        // Inject HMR instrumentation. The injected block is gated on
        // `typeof __DEV__ !== 'undefined' && __DEV__` so production
        // bundlers dead-code-eliminate it when they set __DEV__ = false.
        out = _buildHmrCode(compiled, elementTag)
        // Plan 3.3 — interactive islands also gain `defer` attribute
        // support so individual instances can opt into lazy hydration.
        out = _buildDeferredHydration(out, elementTag)
        // Inject auto-wiring so consumers don't need a manual main.ts bootstrap.
        out = _injectAutoWiring(out)
      } else {
        out = compiled
        // Inject auto-wiring so consumers don't need a manual main.ts bootstrap.
        out = _injectAutoWiring(out)
      }

      // The Rust compiler emits TypeScript (type casts, import type, etc.) and
      // the injected HMR / defer helpers also contain TS generics and casts.
      // Vite does NOT re-run its esbuild TypeScript-strip step when a plugin
      // returns code for a non-.ts ID — so we strip types here ourselves using
      // Vite's own transformWithEsbuild API (always available in a Vite context).
      try {
        const { transformWithEsbuild } = await import('vite')
        const stripped = await transformWithEsbuild(out, 'component.ts', {
          target: 'esnext',
          sourcemap: false,
        })
        return { code: stripped.code, map: null }
      } catch {
        // If running outside Vite (e.g. tests, standalone transform), return as-is.
        return { code: out, map: null }
      }
    },
  }
}
