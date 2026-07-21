/**
 * @aihu/compiler — TypeScript wrapper around the aihu-compile Rust binary.
 *
 * Exports:
 *   transform(source, id)    — compile a single .aihu file to TypeScript
 *   aihuCompilerPlugin()   — Vite plugin that wires transform() into the build
 */
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { resolveCompilerBinary } from './resolve-binary.ts'

// Binary resolution: env var override, then the per-platform optionalDependency
// package (`@aihu/compiler-<platform>`) with a workspace `target/` dev fallback —
// see js/resolve-binary.ts (a clone of css-engine's resolver). The published
// @aihu/compiler tarball ships only the JS shim (bin/aihu-compile.mjs); the
// native binary arrives via the optionalDependency packages, so there is no
// `../bin/aihu-compile` relative path anymore.
//
// Bug 6 fix — resolveBinPath() is CALL-TIME, not module-load-time. The Vite
// plugin's `_maybeCompileUtilityCss` sets `process.env.SCRIBE_COMPILE_BIN` so
// that css-engine's bundled copy of `compileToAst` spawns THIS compiler's
// binary. Prior to this fix `binPath` was a module-scope const captured at
// import time, so the env-var assignment was always too late and `compileSfc`
// failed with ENOENT. Re-reading on every call is essentially free (an env
// lookup, then a memoized resolve) and makes the SCRIBE_COMPILE_BIN handshake
// actually work.
function resolveBinPath(): string {
  return process.env.SCRIBE_COMPILE_BIN ?? resolveCompilerBinary()
}

// Minimal VitePlugin interface — avoids importing from 'vite' at compile time.
// Structurally compatible with Vite's Plugin type.
interface VitePlugin {
  readonly name: string
  enforce?: 'pre' | 'post'
  resolveId?: (
    source: string,
    importer?: string,
  ) => string | null | undefined | Promise<string | null | undefined>
  load?: (id: string) => string | null | undefined | Promise<string | null | undefined>
  transform?: (
    code: string,
    id: string,
  ) => Promise<{ code: string; map: null }> | { code: string; map: null } | null | undefined
  /** GX Phase 1 (#437-GX) — end-of-build hook; prints the extract census. */
  buildEnd?: (error?: Error) => void | Promise<void>
}

/**
 * Options for `aihuCompilerPlugin()` (Plan 3.3 — Islands).
 */
export interface AihuCompilerPluginOptions {
  /**
   * When `true` (default), components classified as `'static'` by
   * `_classifyIsland()` are emitted with a minimal HTML-only registration
   * shim that ships **zero** `@aihu/runtime` and `@aihu/signals` JS to
   * the browser. Components classified as `'interactive'` retain the
   * full runtime path.
   *
   * Setting `islands: false` opts every component back into the unified
   * runtime path (Plan 3.2 baseline behaviour).
   */
  islands?: boolean

  /**
   * Project-wide rendering mode applied to every `.aihu` SFC compiled
   * by this plugin instance. When set, the plugin post-processes the
   * compiled JS to inject `, { shadowMode: '<mode>' }` as the third arg
   * to the emitted `defineElement(tag, defineComponent(...))` call.
   *
   * BINARY vocabulary (DA4 #437):
   * - `'shadow'` — shadow DOM (`attachShadow({ mode: 'open' })` internally;
   *               open is the only browser mode aihu's composition/hydration
   *               can use). `this.shadowRoot` is the non-null root.
   * - `'light'`  — **no shadow root.** The component mounts into its own
   *               element (`this.shadowRoot === null`). Required for global
   *               utility-class CSS frameworks like Tailwind, UnoCSS, Pico
   *               that rely on the cascade.
   *
   * Per-file override: the `$shadow: 'light' | 'shadow'` macro outranks this
   * config. Unset, pages/layouts default to `'light'` and leaves to
   * `'shadow'`.
   */
  shadowMode?: 'light' | 'shadow'

  /**
   * Build target threaded to the compiler binary (`--target`). Defaults to the
   * compiler's `universal` target (current behaviour). Set to `'client'` for a
   * browser bundle that must NOT ship the server `__agentBinding` (policy) and
   * instead gets the policy-free `@agent` opaque-ID dispatcher + the per-instance
   * `_registerAgentDispatcher` wiring the capability bridge reads after mount.
   * See `examples/agent-driven-demo`.
   */
  target?: 'client' | 'server' | 'universal'

  /**
   * Directory (relative to the project root) holding layout SFCs. Default:
   * `'src/layouts'`. Files under this directory are compiled in **layout mode**:
   * their custom element is registered under the namespaced tag
   * `aihu-layout-<stem>` (a layout stem like `app` is not a valid custom-element
   * name on its own), and their `<outlet>` lowers to a **passive**
   * `data-aihu-outlet` marker rather than the reactive route-driven boundary —
   * because `@aihu/app`'s client renderer fills the marker imperatively and the
   * reactive boundary would otherwise clear it on mount.
   *
   * Kept in sync with `@aihu/router`'s `layoutTagFor()` (`virtual:aihu-layouts`).
   */
  layoutsDir?: string
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
export function _injectShadowMode(code: string, mode: 'light' | 'shadow'): string {
  // Match the trailing `))` that closes `defineElement(tag, defineComponent(setup))`.
  // The compiler always emits this exact two-paren close as the final tokens of
  // the defineElement call — we anchor on it and append the options object.
  // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] is valid JS — matches any char including newlines
  const re = /(defineElement\(\s*['"][^'"]+['"]\s*,\s*defineComponent\([^]*\))\s*\)/
  const replaced = code.replace(re, (_m, inner: string) => `${inner}, { shadowMode: '${mode}' })`)
  return replaced
}

/**
 * Light-DOM (`shadowMode:'light'`) recipes: redirect the authored `@style`
 * block's per-instance `host.adoptedStyleSheets = [__style__]` assignment to
 * `document.adoptedStyleSheets` so the recipe's class-scoped CSS reaches the
 * global cascade (a light-DOM host has no shadow root, making the original
 * setter a silent no-op). The module-level `__style__` is shared across
 * instances; the `includes` guard keeps the global adoption idempotent.
 *
 * @internal
 */
export function _globalizeAuthoredStyle(code: string): string {
  // The Rust codegen emits exactly: `(ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];`
  const re = /\(ctx\.host as ShadowRoot\)\.adoptedStyleSheets\s*=\s*\[__style__\];?/
  return code.replace(
    re,
    'if (!document.adoptedStyleSheets.includes(__style__)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, __style__];',
  )
}

/**
 * Classify the compiled output of a single `.aihu` module as either a
 * **static** island (no reactive state — purely declarative DOM) or an
 * **interactive** island (uses the signals reactivity system).
 *
 * The heuristic is intentionally conservative: any source-level reference
 * to a primitive that requires the `defineComponent` owner context flips
 * the file to `'interactive'`. False positives (e.g. a string literal
 * containing `signal(`) are tolerable — they only forfeit the static-island
 * optimisation. False negatives are forbidden: a static-classified file
 * MUST NOT depend on the signals runtime at execution time.
 *
 * Owner-requiring primitives covered:
 *   - `signal(`, `computed(`, `effect(`, `setSignal(` (signals runtime)
 *   - `onMount(`, `onCleanup(` (lifecycle hooks — throw `no owner` outside
 *     `defineComponent` because they push into the active owner's mount/
 *     cleanup queues)
 *
 * Plan 3.3 / acceptance criterion 1.
 *
 * @internal
 */
export function _classifyIsland(compiledCode: string): 'static' | 'interactive' {
  // Match call sites of the reactive + lifecycle primitives. Use word-boundary
  // anchors so identifiers like `mySignal(` or `__effect(` do not trip the
  // heuristic. The `(` is required so that bare imports of the names in an
  // unused `import { signal }` line do not flip an otherwise-static module.
  return /\b(?:signal|computed|effect|setSignal|onMount|onCleanup)\s*\(/.test(compiledCode)
    ? 'interactive'
    : 'static'
}

/**
 * GX Phase 1 (#437-GX) — parse the `// @aihu:extract read=<v> call=<v>` code
 * marker the Rust compiler emits for every server/universal build (the
 * resolved policy, the ratified default included). Phase 1 consumes it only
 * for the build census below; Phase 4 (E2) will read the SAME marker for
 * governed chunk routing.
 * @internal
 */
export function _parseExtractMarker(code: string): { read: string; call: string } | null {
  const m = /^\/\/ @aihu:extract read=(\S+) call=(\S+)$/m.exec(code)
  return m ? { read: m[1] as string, call: m[2] as string } : null
}

/**
 * GX Phase 1 (#437-GX) — format the per-value extract census (the DA-e census
 * pattern from #437: every build PRINTS the posture distribution, so the
 * default-vs-declared migration story stays visible rather than silent).
 * Returns the printable lines; pure so tests can assert the counts.
 * @internal
 */
export function _formatExtractCensus(
  census: ReadonlyMap<string, { read: string; call: string }>,
): string[] {
  if (census.size === 0) return []
  const readCounts = new Map<string, number>()
  const callCounts = new Map<string, number>()
  for (const { read, call } of census.values()) {
    readCounts.set(read, (readCounts.get(read) ?? 0) + 1)
    callCounts.set(call, (callCounts.get(call) ?? 0) + 1)
  }
  const lines = [`[aihu] extract census — ${census.size} surface(s)`]
  for (const [value, n] of [...readCounts.entries()].sort()) lines.push(`  read=${value}: ${n}`)
  for (const [value, n] of [...callCounts.entries()].sort()) lines.push(`  call=${value}: ${n}`)
  return lines
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
 * Is `rawId` a layout SFC (a `.aihu` file under the configured layouts dir)?
 * Root-independent: matches the `<layoutsDir>/` segment anywhere in the path,
 * which is sufficient because the layouts dir is a project-relative convention.
 * @internal
 */
export function _isLayoutFile(rawId: string, layoutsDir: string): boolean {
  const ld = layoutsDir
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/\/+$/, '')
  if (!ld) return false
  return rawId.replace(/\\/g, '/').includes(`/${ld}/`)
}

/**
 * Layout custom-element tag for a filename stem. MUST match
 * `@aihu/router`'s `layoutTagFor()` so the generated `virtual:aihu-layouts`
 * map and the registered element agree on the tag.
 * @internal
 */
export function _layoutTag(stem: string): string {
  return `aihu-layout-${stem.toLowerCase()}`
}

/**
 * O1a (tag naming) — JS mirror of the Rust compiler's
 * `tags::kebab_component_tag` (packages/compiler/src/tags.rs). PascalCase→kebab,
 * else lowercase-verbatim: inserts '-' before an uppercase letter when the
 * previous char is lowercase/digit, OR (acronym boundary) the previous char is
 * uppercase and the next is lowercase; then lowercases all. Applied to the
 * file stem before it is passed as `--tag` so the JS driver's define-name
 * matches the Rust one (`UserCard.aihu` → `user-card`). Validation/erroring
 * (C450) is owned by the Rust compiler — this is the infallible transform only.
 * @internal
 */
export function kebabComponentTag(raw: string): string {
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    // charAt (not raw[i]) returns string, never string|undefined — satisfies
    // noUncheckedIndexedAccess; charAt(i+1) yields '' past the end, matching
    // the "no next char" case.
    const c = raw.charAt(i)
    if (i > 0 && c >= 'A' && c <= 'Z') {
      const prev = raw.charAt(i - 1)
      const next = raw.charAt(i + 1)
      const prevLower = prev >= 'a' && prev <= 'z'
      const prevDigit = prev >= '0' && prev <= '9'
      const prevUpper = prev >= 'A' && prev <= 'Z'
      const nextLower = next >= 'a' && next <= 'z'
      if (prevLower || prevDigit || (prevUpper && nextLower)) out += '-'
    }
    out += c.toLowerCase()
  }
  return out
}

/**
 * Collapse the reactive `<outlet>` boundary the Rust codegen emits into a
 * passive `data-aihu-outlet` marker. Layout SFCs are rendered by `@aihu/app`'s
 * imperative client renderer, which fills the marker itself; the default
 * boundary's mount-time `effect()` reads `useRoute()` (null under the imperative
 * path) and clears the marker, which would wipe the page the renderer inserts.
 *
 * Anchors on the exact `const createOutletBoundary = () => { … return host; };`
 * block the codegen emits (`packages/compiler/src/codegen/emit.rs`). No-op when
 * the layout declares no `<outlet>`.
 * @internal
 */
export function _passivizeOutlet(code: string): string {
  return code.replace(
    /const createOutletBoundary = \(\) => \{[\s\S]*?return host;\s*\n\};/,
    `const createOutletBoundary = () => branch('div', { 'data-aihu-outlet': '' }, []);`,
  )
}

/**
 * Instrument a compiled `.aihu` module with HMR support.
 *
 * The compiler always emits:
 *
 *   import { defineComponent, defineElement } from '@aihu/runtime'
 *   defineElement('tag', defineComponent((_ctx) => { ... }))
 *
 * This function:
 *
 *  1. Adds `_hmrReplace` to the `@aihu/runtime` import.
 *  2. Prepends a module-level slot variable `__aihu_setup__`.
 *  3. Rewrites the single `defineComponent(` call so the setup function
 *     is captured via an assignment expression:
 *     `defineComponent(__aihu_setup__ = ` (valid JS; assignment has
 *     lower precedence than arrow fn, so `defineComponent` still
 *     receives the function as its argument).
 *  4. Appends `export { __aihu_setup__ as default }` so that Vite's
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
  // Step 1 — add _hmrReplace to the @aihu/runtime import.
  const withImport = compiledCode.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@aihu\/runtime'/,
    (_m, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('_hmrReplace')) parts.push('_hmrReplace')
      return `import { ${parts.join(', ')} } from '@aihu/runtime'`
    },
  )

  // Step 2+3 — prepend slot variable and rewrite the defineComponent call.
  // Compiler emits exactly one `defineComponent(` followed by a function expr.
  // Rewrite: defineComponent(fn)  →  defineComponent(__aihu_setup__ = fn)
  // Assignment expression evaluates to `fn`, so defineComponent still
  // receives the setup function as its first argument unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preamble = `let __aihu_setup__: ((ctx: any) => any) | undefined\n`

  const patchedBody = withImport.replace(/\bdefineComponent\(/, 'defineComponent(__aihu_setup__ = ')

  const tag = JSON.stringify(elementTag)
  // Step 4+5 — postamble with default export and HMR acceptance.
  const postamble = `
export { __aihu_setup__ as default }

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
 * from `@aihu/runtime`, and the compiler-emitted `defineElement(...)`
 * call is wrapped in a `defineElement` that intercepts `connectedCallback`
 * to honour the `defer` attribute.
 *
 * The whole indirection is tree-shaken when no `.aihu` module reaches
 * this branch, because `_hydrateOnVisible` is exported from its own
 * sibling module inside `@aihu/runtime`.
 *
 * @internal
 */
export function _buildDeferredHydration(compiledCode: string, elementTag: string): string {
  // Add _hydrateOnVisible to the @aihu/runtime import.
  const withImport = compiledCode.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@aihu\/runtime'/,
    (_m, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('_hydrateOnVisible')) parts.push('_hydrateOnVisible')
      return `import { ${parts.join(', ')} } from '@aihu/runtime'`
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
  //   defineElement('tag', __aihu_wrap_defer__(defineComponent((_ctx) => { ... })))
  //
  // …with __aihu_wrap_defer__ defined in the appended preamble.
  const patched = withImport.replace(
    /defineElement\(\s*('[^']+'|"[^"]+")\s*,\s*defineComponent\(/,
    (_m, tagLit: string) => `defineElement(${tagLit}, __aihu_wrap_defer__(defineComponent(`,
  )
  // Match the closing `))` of the defineElement call. The HMR pass may
  // have inserted `__aihu_setup__ = ` before the inner function, but
  // the trailing `))` shape is unchanged. Replace exactly one occurrence
  // by anchoring on end-of-string trim; bail if the shape does not match.
  if (patched === withImport) {
    // The expected `defineElement(<tag>, defineComponent(` shape was not
    // present (e.g. compiler output changed). Skip defer wrapping rather
    // than emit broken code.
    return compiledCode
  }
  // Add a trailing `)` to balance the extra `(` from __aihu_wrap_defer__.
  // Source shape after _buildHmrCode is:
  //   defineElement('tag', defineComponent(__aihu_setup__ = (_ctx) => {...}))
  //   export { __aihu_setup__ as default }
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
function __aihu_wrap_defer__<T extends typeof HTMLElement>(Ctor: T): T {
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
 *   import { branch, leaf, slot } from '@aihu/arbor'
 *   import { defineComponent, defineElement } from '@aihu/runtime'
 *   defineElement('tag', defineComponent((_ctx) => { return <tree> }))
 *
 * For a static island we know `<tree>` contains no `signal(`/`computed(`
 * calls. We can therefore:
 *
 *   1. Drop the `@aihu/runtime` import (saves ~600 B gz of defineComponent
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

  // Strip the `@aihu/runtime` import line entirely — static islands
  // don't reference defineComponent/defineElement after the rewrite.
  const withoutRuntimeImport = compiledCode.replace(
    /^\s*import\s*\{[^}]*\}\s*from\s*'@aihu\/runtime'\s*;?\s*$/m,
    '',
  )

  // Ensure `mount` is imported from @aihu/arbor (it already exposes
  // branch/leaf/slot, so we just append `mount` to the existing list).
  const withArborMount = withoutRuntimeImport.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@aihu\/arbor'/,
    (_m, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('mount')) parts.push('mount')
      return `import { ${parts.join(', ')} } from '@aihu/arbor'`
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
      `customElements.define(${tagJson}, class extends HTMLElement {\n  connectedCallback() {\n    const root = this.attachShadow({ mode: 'open' })\n    const __aihu_setup__ = (`,
    )
    .replace(
      /\)\s*\)\s*$/,
      `)\n    mount(__aihu_setup__({ host: root, element: this }), root)\n  }\n})\n`,
    )

  return `// SCRIBE_STATIC_ISLAND — zero @aihu/runtime references\n${rewritten}`
}

/**
 * Compile a .aihu source string to TypeScript.
 * map is null — source maps are deferred to v1 (OQ-C8)
 *
 * B3b — when `sidecarOut` is provided, also writes the per-SFC `.aihu.ts`
 * sidecar at that path. Callers (e.g. the Vite plugin) typically pass
 * `<source-id>.ts` so `tsc --noEmit` discovers per-SFC template expressions.
 */
export function transform(
  source: string,
  id: string,
  options?: {
    sidecarOut?: string
    target?: 'client' | 'server' | 'universal'
    /** Override the registered custom-element tag (default: file stem). Used for layouts. */
    tag?: string
  },
): { code: string; map: null } {
  // O1a (tag naming): normalize the stem so the JS driver's define-name
  // matches the Rust compiler's (`UserCard.aihu` → `user-card`). When a
  // component-shaped (uppercase-first) stem normalizes to a hyphen-less name
  // (`Comment.aihu` → `comment`), pass the RAW stem instead so the Rust
  // compiler surfaces its C450 error — the JS never validates or errors, but
  // it must not mask the error by pre-lowercasing. An explicit `options.tag`
  // (e.g. `_layoutTag` for layouts) passes through untouched.
  const rawStem = basename(id, '.aihu')
  const kebabStem = kebabComponentTag(rawStem)
  const stem = /^[A-Z]/.test(rawStem) && !kebabStem.includes('-') ? rawStem : kebabStem
  const args = ['--stdin', '--tag', options?.tag ?? stem, '--path', id]
  if (options?.sidecarOut) {
    args.push('--sidecar-out', options.sidecarOut)
  }
  // T6 (go-public demo) — thread the build target so a client bundle gets the
  // policy-free `@agent` dispatcher (and the per-instance registration the
  // capability bridge needs) instead of the server `__agentBinding`. Defaults to
  // the compiler's `universal` target when omitted (existing behaviour).
  if (options?.target) {
    args.push('--target', options.target)
  }
  const code = execFileSync(resolveBinPath(), args, {
    input: source,
    encoding: 'utf8',
  })
  return {
    code,
    map: null, // source maps deferred to v1 (OQ-C8)
  }
}

/**
 * Escape a CSS string for safe interpolation inside a JS template literal.
 * The Rust codegen places the authored `@style` body raw inside a backtick
 * literal, so it already assumes no backticks in `@style`. css-engine output
 * (theme tokens + utility rules) likewise never contains backticks, but we
 * escape `\`, `` ` `` and `${` defensively so a future token value can't
 * break out of the literal.
 *
 * @internal
 */
function _escapeForTemplateLiteral(css: string): string {
  return css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
}

/**
 * Fold css-engine-produced scoped CSS into a compiled `.aihu` module.
 *
 * The Rust codegen emits the authored `@style` block (when present) as:
 *
 *   const __style__ = new CSSStyleSheet();
 *   __style__.replaceSync(`<authored css>`);
 *   defineElement('tag', defineComponent((ctx) => {
 *     (ctx.host as ShadowRoot).adoptedStyleSheets = [__style__];
 *     return ...
 *   }))
 *
 * css-engine's `compileSfc` output is the COMPLETE per-SFC stylesheet:
 * `:host` theme tokens, the variant-resolved utility-class rules, AND the
 * folded authored `@style` block (under an `authored @style` CSS comment).
 * So it is authoritative — we adopt it as the single shadow `<style>` and
 * the authored `@style` keeps emitting through it (acceptance: "@style still
 * emits correctly alongside").
 *
 * Two shapes are handled:
 *
 *  1. **SFC has an `@style` block** — the Rust codegen already declared
 *     `__style__` with the raw `@style` body. We REPLACE that body with the
 *     css-engine output (which already CONTAINS the `@style` block) so the
 *     `@style` rules are not duplicated. The existing `adoptedStyleSheets`
 *     assignment is reused unchanged.
 *
 *  2. **SFC has NO `@style` block** — there is no `__style__`. We inject a
 *     fresh `__style__` declaration after the last import and an
 *     `adoptedStyleSheets` assignment as the first statement of the setup
 *     function. The compiler emits the setup param as `_ctx` in this case;
 *     we rename it to `ctx` so the injected `ctx.host` reference resolves.
 *
 * Runs on the RAW compiled output BEFORE the island / HMR / auto-wiring
 * transforms so those passes operate on the folded module uniformly:
 *   - The static-island shim calls `__aihu_setup__({ host: root, ... })`
 *     where `root` is the shadow root, so `ctx.host` is valid there too.
 *   - The HMR / defer passes only touch the `defineElement(...)` wrapper and
 *     the runtime import; they do not disturb `__style__` or the setup body.
 *
 * No-ops (returns input unchanged) when `css` is empty/whitespace.
 *
 * @internal
 */
export function _foldCssEngineStyles(compiledCode: string, css: string): string {
  if (!css.trim()) return compiledCode
  const escaped = _escapeForTemplateLiteral(css)

  // Shape 1 — an authored @style block already declared __style__. css-engine
  // output already includes that @style block, so REPLACE the replaceSync body
  // (between the backticks) wholesale to avoid duplicating the @style rules.
  // The codegen emits `__style__.replaceSync(`<body>`);` as a single statement;
  // match the body non-greedily up to the closing backtick + paren.
  // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] matches any char incl. newlines
  const styleBodyRe = /(__style__\.replaceSync\(`)[^]*?(`\);)/
  if (styleBodyRe.test(compiledCode)) {
    // Use a function replacer so any `$` in the CSS isn't read as a
    // replacement-pattern backreference.
    return compiledCode.replace(styleBodyRe, (_m, open: string, close: string) => {
      return `${open}${escaped}${close}`
    })
  }

  // Shape 2 — no @style block. Inject a fresh stylesheet + adoption.
  // Bail (no-op) if the expected defineComponent setup shape is absent.
  // The setup param is NOT always `ctx`/`_ctx`: an agent component (one with an
  // exposed member) emits `(__aihu_ctx__)` so `_registerAgentServerBinding`
  // can read `__aihu_ctx__?.element`. Capture whatever the param is and inject
  // against it — a literal `(ctx)` anchor silently no-ops on agent components,
  // which shipped scoped utility CSS with no adopted stylesheet.
  const setupRe = /defineComponent\(\s*\((__?[A-Za-z0-9_]+)\)\s*=>\s*\{/
  const m = setupRe.exec(compiledCode)
  if (m == null) return compiledCode
  // `_ctx` is codegen's "unused ctx" marker; the injected adoption uses it, so
  // normalize to `ctx`. Any other name (`ctx`, `__aihu_ctx__`) is referenced
  // elsewhere in the setup body and MUST be preserved verbatim.
  const setupParam = m[1] === '_ctx' ? 'ctx' : m[1]

  // Inject the module-level stylesheet declaration after the last import line.
  const lines = compiledCode.split('\n')
  let lastImportIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = (lines[i] ?? '').trim()
    if (t.startsWith('import ') || t.startsWith('import{')) {
      lastImportIdx = i
      break
    }
  }
  const decl = `const __style__ = new CSSStyleSheet();\n__style__.replaceSync(\`${escaped}\`);`
  if (lastImportIdx !== -1) {
    lines.splice(lastImportIdx + 1, 0, decl)
  } else {
    lines.unshift(decl)
  }
  let withDecl = lines.join('\n')

  // Inject the adoption as the first statement of the setup body, using the
  // ACTUAL setup param (`ctx` for a plain component, `__aihu_ctx__` for an
  // agent component). `_ctx` is normalized to `ctx` above since the injected
  // statement now references it.
  withDecl = withDecl.replace(
    setupRe,
    `defineComponent((${setupParam}) => {\n  (${setupParam}.host as ShadowRoot).adoptedStyleSheets = [__style__];`,
  )
  return withDecl
}

/**
 * Virtual-module prefix used by the `shadowMode === 'light'` branch to route
 * per-SFC utility CSS through Vite's built-in CSS pipeline. The plugin
 * (`aihuCompilerPlugin`) implements `resolveId` + `load` for ids matching
 * `VIRTUAL_UTILITY_PREFIX + '<hash>.css'`, returning the stored CSS body so
 * Vite hoists it into the bundle CSS asset (`dist/assets/*.css`) — NOT into
 * `host.adoptedStyleSheets`, which is a no-op when there is no shadow root.
 *
 * The trailing `.css` extension is mandatory: Vite's built-in CSS plugin keys
 * off the extension to know it should run the CSS pipeline on the module.
 *
 * @internal
 */
export const VIRTUAL_UTILITY_PREFIX = '\0virtual:aihu-utility/'

/**
 * Stable short hash for keying the virtual-CSS module per source-SFC id.
 *
 * djb2-style; collisions are tolerable here because (a) each entry stores its
 * own CSS body, so a hash collision would only matter if two distinct SFCs
 * hashed to the same key AND were processed concurrently; (b) collisions are
 * recoverable — Vite would simply load the wrong CSS for one SFC; we still
 * keyed on the unhashed id internally to avoid that. The hash only appears in
 * the bundled asset URL.
 *
 * @internal
 */
export function _hashIdForUtilityCss(id: string): string {
  let h = 5381
  for (let i = 0; i < id.length; i++) {
    h = ((h * 33) ^ id.charCodeAt(i)) >>> 0
  }
  return h.toString(36)
}

/**
 * Bug 6 — `shadowMode === 'light'` branch.
 *
 * Routes utility CSS to Vite's CSS pipeline (which folds CSS imports into the
 * bundled `dist/assets/*.css` asset) instead of to `host.adoptedStyleSheets`
 * (a no-op on an element with no shadow root). Returns a prelude `import` that
 * the plugin's `resolveId` + `load` hooks resolve to the stored CSS body.
 *
 * The `__style__` shadow path is NOT invoked here — utility CSS for a
 * cascade-mode component MUST hit the global stylesheet, not a per-element
 * stylesheet that would be silently dropped by `HTMLElement`'s setter.
 *
 * Authored `@style` blocks still emit through the Rust codegen's `<style>`
 * node and are unaffected. (If a component opts into `shadowMode: 'light'` and
 * authors an `@style` block, the codegen still wires it through the
 * non-shadow path — that is the runtime's contract, not this hook's.)
 *
 * @internal
 */
export function _foldCssEngineStylesGlobal(
  compiledCode: string,
  css: string,
  id: string,
): { code: string; virtualId: string } | null {
  if (!css.trim()) return null
  const hash = _hashIdForUtilityCss(id)
  const virtualId = `${VIRTUAL_UTILITY_PREFIX}${hash}.css`
  // Prepend the CSS import as a side-effect-only import so Vite's CSS plugin
  // hoists it into the bundle. We use the NULL-byte virtual id form
  // (Rollup/Vite convention for "owned by this plugin"); other plugins will
  // skip it. The compiler's transform returns this prepended code, which the
  // downstream esbuild/oxc strip leaves untouched (it's just an import).
  const prelude = `import ${JSON.stringify(virtualId)};\n`
  return { code: prelude + compiledCode, virtualId }
}

// ─── v1.0.10a — compiler AST-export hook ─────────────────────────────────────
//
// Thin TS wrapper over the `aihu-compile --ast-json` flag. Returns the parsed
// `.aihu` SFC AST in a stable, serializable shape consumed by the CSS engine's
// AST scanner (`css-2-ast-scanner`). Mirrors the typed contract in
// `docs/superpowers/specs/compiler-ast-export-hook.md` §4.

/** Top-level AST export — one per .aihu SFC. */
export interface SfcAst {
  /** Resolved custom-element tag name (meta.name → route.name → file stem). */
  tag: string
  /** AST schema version — bumped on any breaking shape change (semver-tied). */
  astVersion: 1
  /** The @style block, if the SFC declared one. */
  style: SfcStyleBlock | null
  /** Parsed template tree. null when the SFC has no @template block. */
  template: SfcNode[] | null
  /** SFC-level metadata. */
  meta: SfcMeta
}

export interface SfcStyleBlock {
  /** Verbatim CSS body of the @style block (braces stripped, $global token removed). */
  content: string
  /** 'scoped' (default) or 'global' (@style { $global ... }). */
  scope: 'scoped' | 'global'
}

export interface SfcMeta {
  /** From @meta { name } / @route { name } / file stem — never null after resolution. */
  name: string
}

/** Discriminated union mirroring Rust `TemplateNode`. */
export type SfcNode =
  | { kind: 'element'; tag: string; attrs: SfcAttr[]; children: SfcNode[] }
  | { kind: 'macroElement'; name: string; attrs: SfcAttr[]; children: SfcNode[] }
  | { kind: 'text'; value: string }
  | { kind: 'interpolation'; expr: string }
  | { kind: 'ifBlock'; branches: Array<{ cond: string; body: SfcNode[] }> }
  | {
      kind: 'eachBlock'
      list: string
      item: string
      idx: string | null
      key: string | null
      body: SfcNode[]
      emptyBody: SfcNode[] | null
    }
  | { kind: 'htmlBlock'; expr: string }

/** Discriminated union mirroring Rust `Attr` — the three class-forms key on `kind`. */
export type SfcAttr =
  | { kind: 'static'; name: string; value: string } // Form A
  | { kind: 'binding'; name: string; expr: string } // Form B
  | { kind: 'macro'; name: string; value: SfcMacroValue } // Form C (and on:/bind:/emit:/if/each/…)

export type SfcMacroValue =
  | { form: 'quoted'; value: string }
  | { form: 'curly'; expr: string }
  | { form: 'boolean' }

/**
 * Parse a .aihu source string to its structured AST.
 *
 * Thin wrapper over the Rust binary (mirrors `transform()`): spawns
 * `aihu-compile --stdin --tag <stem> --ast-json`, feeds `source` on stdin, and
 * `JSON.parse`s stdout. `id` is optional and only used to derive the tag stem
 * and the `--path` arg (for `@route` C500 checks), identical to `transform()`.
 *
 * Throws on parse failure — the Rust binary exits non-zero and `execFileSync`
 * surfaces the diagnostic (same error path as `transform()`).
 */
/**
 * Compile an SFC to its TYPE-CHECK SURFACE and return it as a string — the
 * `.aihu.ts` sidecar's content, without writing a file.
 *
 * This is the in-memory path `aihu-tsc` uses to hand `.aihu` files to TypeScript
 * as virtual files. The surface is line-preserving: line N of the returned text
 * corresponds to line N of the `.aihu` source, which is what lets a `tsc`
 * diagnostic be mapped straight back to the line the author wrote.
 *
 * Returns `''` when the SFC has no `@template` (nothing to check).
 */
export function compileSidecar(source: string, id?: string): string {
  const stem = id ? basename(id, '.aihu') : 'Component'
  const args = ['--stdin', '--tag', stem, '--sidecar-stdout']
  if (id) {
    args.push('--path', id)
  }
  return execFileSync(resolveBinPath(), args, {
    input: source,
    encoding: 'utf8',
    // Capture stderr rather than inheriting it: the compiler's warnings (unhyphenated
    // tag names, undeclared cross-block refs) belong to `aihu build`, and would
    // otherwise interleave with the type diagnostics a caller is trying to read.
    // A hard compile failure still throws, carrying the message with it.
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

export function compileToAst(source: string, id?: string): SfcAst {
  const stem = id ? basename(id, '.aihu') : 'Component'
  const args = ['--stdin', '--tag', stem, '--ast-json']
  if (id) {
    args.push('--path', id)
  }
  const json = execFileSync(resolveBinPath(), args, {
    input: source,
    encoding: 'utf8',
  })
  return JSON.parse(json) as SfcAst
}

/**
 * Structured `@route` metadata (the `.route.json` sidecar shape). All fields
 * optional — only what the SFC's `@route` block declares is present. `head` is
 * left opaque here (the router owns its shape).
 */
export interface RouteMeta {
  pattern?: string
  name?: string
  layout?: string
  middleware?: string[]
  ssr?: boolean
  params?: string[]
  head?: unknown
  /**
   * GX Phase 1 fan-out (#437-GX): the resolved `extract` policy — always
   * present in the binary's route-json output since 0.1.12 (the default is
   * recorded, never implied by absence). Typed loose here: consumers
   * normalize fail-closed (`deriveReadPolicy` in `@aihu/server`).
   */
  extract?: { read?: unknown; call?: unknown }
  /**
   * GX Phase 4 fan-out (#466): the `data:` governed-resource declaration
   * (70-governed-data-access §2.1) — present only when the route declares one
   * (0.1.14+). `type` keys the server registry's provider; `preview` lists
   * the locked-state fields (omitted when none declared). Consumers: the
   * server runtime's boot validation + generated loader, and the router Vite
   * layer's C486 sibling-loader conflict check (§4.7).
   */
  data?: { type?: string; preview?: string[] }
}

/**
 * Parse a `.aihu` source string and return its `@route` metadata, or `null`
 * when the SFC declares no `@route` block.
 *
 * Thin wrapper over the Rust binary (mirrors {@link compileToAst}): spawns
 * `aihu-compile --stdin --tag <stem> --route-json`, feeds `source` on stdin,
 * and `JSON.parse`s stdout. This is how build tools recover full route
 * metadata (`head`/`middleware`/`params`/`ssr`/`layout`) for the SPA build
 * path, where no `.route.json` sidecar is written to disk.
 *
 * Throws on parse failure (same error path as `transform()`/`compileToAst()`).
 */
export function compileRouteMeta(source: string, id?: string): RouteMeta | null {
  const stem = id ? basename(id, '.aihu') : 'Component'
  const args = ['--stdin', '--tag', stem, '--route-json']
  if (id) {
    args.push('--path', id)
  }
  const out = execFileSync(resolveBinPath(), args, {
    input: source,
    encoding: 'utf8',
  }).trim()
  if (out === '' || out === 'null') return null
  return JSON.parse(out) as RouteMeta
}

/**
 * Inject `_setMount(mount)` + `_setSignal(signal)` auto-wiring into a compiled
 * `.aihu` module. Adds the necessary symbols to existing imports and inserts
 * the boot calls right after the last `import` statement.
 *
 * @internal
 */
export function _injectAutoWiring(code: string): string {
  // 1. Add `mount` to the @aihu/arbor import (or create it).
  let result: string
  if (code.includes("from '@aihu/arbor'")) {
    result = code.replace(
      /import\s*\{([^}]*)\}\s*from\s*'@aihu\/arbor'/,
      (_m: string, imports: string) => {
        const parts = imports
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (!parts.includes('mount')) parts.push('mount')
        return `import { ${parts.join(', ')} } from '@aihu/arbor'`
      },
    )
  } else {
    result = `import { mount } from '@aihu/arbor'\n${code}`
  }

  // 2. Add `signal` to the non-type @aihu/signals import (or create it).
  // Note: `import\s+\{` does NOT match `import type {` (the regex needs `{` immediately
  // after whitespace, whereas `import type {` has `type` in between).  No negation guard
  // is needed — the replace callback below already skips `import type` lines.
  if (/import\s+\{[^}]*\}\s+from\s+'@aihu\/signals'/.test(result)) {
    // There IS a value import from signals — add `signal` if missing.
    result = result.replace(
      /import\s*\{([^}]*)\}\s*from\s*'@aihu\/signals'/,
      (_m: string, imports: string) => {
        // Skip type-only imports
        if (_m.startsWith('import type')) return _m
        const parts = imports
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        if (!parts.includes('signal')) parts.push('signal')
        return `import { ${parts.join(', ')} } from '@aihu/signals'`
      },
    )
  } else if (!/import.*from\s*'@aihu\/signals'/.test(result)) {
    // No signals import at all — insert after arbor import
    result = result.replace(
      /import\s*\{[^}]*\}\s*from\s*'@aihu\/arbor'/,
      (m: string) => `${m}\nimport { signal } from '@aihu/signals'`,
    )
  }
  // If only `import type { Signal }` exists, insert value import after it
  else if (
    /import\s+type\s+\{[^}]*\}\s+from\s+'@aihu\/signals'/.test(result) &&
    !result.match(/import\s+\{[^}]*\}\s+from\s+'@aihu\/signals'/)
  ) {
    result = result.replace(
      /(import\s+type\s+\{[^}]*\}\s+from\s+'@aihu\/signals')/,
      (_m: string, typeImport: string) => `${typeImport}\nimport { signal } from '@aihu/signals'`,
    )
  }

  // 3. Add `_setMount`, `_setSignal` to the @aihu/runtime import.
  result = result.replace(
    /import\s*\{([^}]*)\}\s*from\s*'@aihu\/runtime'/,
    (_m: string, imports: string) => {
      const parts = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (!parts.includes('_setMount')) parts.push('_setMount')
      if (!parts.includes('_setSignal')) parts.push('_setSignal')
      return `import { ${parts.join(', ')} } from '@aihu/runtime'`
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
 * Vite plugin that compiles .aihu files to TypeScript during build and dev.
 *
 * Use `enforce: 'pre'` so the hook fires before Vite/Rollup's built-in
 * parsers attempt to process the raw .aihu content as JavaScript.
 *
 * @example
 * // vite.config.ts
 * import { aihuCompilerPlugin } from '@aihu/compiler'
 * export default { plugins: [aihuCompilerPlugin()] }
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
 *    to Rollup4. When `@aihu/compiler` is resolved from the workspace
 *    symlink (`dist/index.js`), Bun's ESM loader evaluates the module at
 *    config-load time. The subprocess call inside `transform()` depends on
 *    the Rust binary being at `../bin/aihu-compile` relative to `dist/`
 *    (written by the postinstall hook). In a dev workspace where postinstall
 *    has not run, this path does not exist and `execFileSync` throws. Bun surfaces
 *    the error as a config-load failure, not a per-file transform error,
 *    causing the entire build to abort before any `.aihu` file is
 *    processed.
 *
 * **Workaround (v0):** Use `bun run integrate.ts` directly from
 * `packages/compiler/fixtures/vite-counter/`. This script calls
 * `transform()` from `@aihu/compiler` without involving Vite or Rollup.
 * Preconditions: (1) `cargo build --release` in `packages/compiler/`,
 * (2) `bun install` at the repo root.
 *
 * **v1 resolution:** Add `vite` as a `devDependency` in
 * `packages/compiler/package.json`; add a WASM or pre-built binary
 * strategy so the Rust binary is bundled with the npm package and does not
 * require a separate `cargo build --release` step.
 */
/**
 * Minimal structural type for the `@aihu/css-engine` module surface this
 * plugin uses. Declared locally so the compiler never type-imports the
 * css-engine package (which would create a compile-time edge against an
 * optional peer that may be absent).
 *
 * @internal
 */
interface CssEngineModule {
  compileSfc(source: string, id?: string): string
}

// Memoised resolution of the optional `@aihu/css-engine` peer. `undefined`
// = not yet attempted; `null` = attempted and unavailable (no-op path);
// a module object = available. The dynamic import is attempted once per
// process — repeated absence does not re-pay the resolution cost.
let _cssEngine: CssEngineModule | null | undefined

// Whether we've already surfaced a one-shot warning that css-engine resolved
// but `compileSfc` threw (typically: native css-core binary unresolvable in
// the consumer's install — e.g. lockfile pins the per-platform placeholder
// version). The transform stays non-fatal, but going fully silent leaves users
// chasing "why did my utility classes never emit?". One warn per process.
let _cssEngineWarned = false

// The optional-peer module specifier, held in a VARIABLE so TypeScript never
// statically resolves `@aihu/css-engine`'s declarations at typecheck time.
// css-engine depends on @aihu/compiler for its AST, so the two form a
// circular package relationship; under CI's frozen install + moon build
// ordering, css-engine's `dist`/`.d.ts` are not guaranteed to exist when
// `compiler:typecheck` runs. A literal `import('@aihu/css-engine')` makes the
// compiler emit TS2307 in that window (the `as` cast affects the RESULT type
// only, not whether TS attempts module resolution). Resolving through this
// variable keeps the import fully dynamic — no compile-time edge on the peer.
const _CSS_ENGINE_SPECIFIER = '@aihu/css-engine'

/**
 * Lazily resolve `@aihu/css-engine` and compile a `.aihu` source's utility
 * classes to scoped CSS. Returns `''` when css-engine is not installed
 * (the optional-peer no-op path) or when compilation fails for any reason —
 * a CSS-engine failure MUST NOT break an otherwise-valid `.aihu` build.
 *
 * Sets `process.env.SCRIBE_COMPILE_BIN` to this plugin's resolved compiler
 * binary before calling `compileSfc`: css-engine re-derives the SFC AST via
 * its own bundled copy of `compileToAst`, whose binary path is resolved
 * relative to the css-engine package — which does NOT ship the compiler
 * binary. Pointing it at our `binPath` guarantees the AST css-engine parses
 * is produced by the exact same compiler this build uses.
 *
 * @internal
 */
async function _maybeCompileUtilityCss(source: string, id: string): Promise<string> {
  if (_cssEngine === null) return ''
  // Ensure css-engine's bundled `compileToAst` spawns the SAME compiler
  // binary this plugin uses (it has no compiler binary of its own). Set
  // this BEFORE the dynamic import so that any module-load-time evaluation
  // of `process.env.SCRIBE_COMPILE_BIN` in css-engine's bundled dist (older
  // bundles capture this into a module-scope const at line 8 of
  // `packages/css-engine/dist/index.js`) sees the correct value. After Bug 6,
  // the source `compileToAst` resolves the bin lazily on each call, so once
  // css-engine is rebuilt this set-before-import is belt-and-braces.
  if (process.env.SCRIBE_COMPILE_BIN == null) {
    process.env.SCRIBE_COMPILE_BIN = resolveBinPath()
  }
  if (_cssEngine === undefined) {
    try {
      // Guarded, lazy, OPTIONAL — see the plugin transform for the rationale.
      // Importing via the `_CSS_ENGINE_SPECIFIER` variable (not a string
      // literal) keeps this fully dynamic: TS does NOT resolve the peer's
      // `.d.ts` at typecheck time, so `compiler:typecheck` passes even when
      // css-engine's `dist` has not been built (the CI build-order window).
      _cssEngine = (await import(_CSS_ENGINE_SPECIFIER)) as unknown as CssEngineModule
    } catch {
      _cssEngine = null
      return ''
    }
  }
  try {
    return _cssEngine.compileSfc(source, id)
  } catch (err) {
    // A css-engine compile failure is non-fatal: fall back to the no-op
    // path (utility classes don't emit) rather than aborting the build.
    // BUT — silently swallowing this means a user who clearly intends
    // css-engine to be active (the peer resolved) will never know their
    // utility classes are inert. Surface a one-shot warning with the
    // underlying error + an install/upgrade hint. Idempotent per process.
    if (!_cssEngineWarned) {
      _cssEngineWarned = true
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(
        `[@aihu/compiler] @aihu/css-engine is installed but compileSfc() failed; ` +
          `utility classes will not emit. Original error: ${msg}\n` +
          `Hint: ensure the native css-core binary is installed ` +
          `(install/upgrade @aihu/css-engine + its per-platform optional dep, ` +
          `or run \`cargo build --release -p aihu-css-core\` in a dev clone).`,
      )
    }
    return ''
  }
}

export function aihuCompilerPlugin(options?: AihuCompilerPluginOptions): VitePlugin {
  const islandsEnabled = options?.islands !== false
  const shadowMode = options?.shadowMode
  const target = options?.target
  const layoutsDir = options?.layoutsDir ?? 'src/layouts'

  // Bug 6 — per-instance store of virtual utility-CSS modules. Keyed by the
  // full virtual id (NUL-prefixed). Populated by the transform hook when
  // `shadowMode === 'light'` produces utility CSS; drained by the `load` hook
  // when Vite's CSS pipeline asks for the module body. Lives on the plugin
  // instance so multiple `aihuCompilerPlugin()` calls in the same build don't
  // alias each other's css.
  const utilityCssStore = new Map<string, string>()

  // GX Phase 1 (#437-GX) — per-instance extract census. Keyed by rawId,
  // populated in transform from the compiler's `// @aihu:extract` marker;
  // printed per-value in buildEnd. Every build prints the posture
  // distribution (the DA-e census pattern from #437).
  const extractCensus = new Map<string, { read: string; call: string }>()

  return {
    name: 'aihu-compiler',
    enforce: 'pre',
    buildEnd() {
      for (const line of _formatExtractCensus(extractCensus)) console.info(line)
    },
    resolveId(source) {
      // Own all `\0virtual:aihu-utility/<hash>.css` ids so Vite's resolver
      // doesn't try to find them on disk. Returning the id verbatim is the
      // Rollup convention for "I'll handle the load."
      if (source.startsWith(VIRTUAL_UTILITY_PREFIX)) return source
      return null
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_UTILITY_PREFIX)) return null
      // Vite's CSS pipeline runs on the returned source because the id ends
      // in `.css` — it parses, minifies (in build), and hoists into a CSS
      // asset chunk that lands in `dist/assets/<name>-<hash>.css`.
      return utilityCssStore.get(id) ?? null
    },
    transform(code, id) {
      // Strip Vite query strings (e.g. `?import`, `?t=...`) before checking the extension.
      const rawId = id.split('?')[0]!
      if (!rawId.endsWith('.aihu')) return
      return (async () => {
        // No `.aihu.ts` sidecar is written any more. Type-checking goes through
        // `aihu-tsc`, which projects each `.aihu` into the TypeScript program as a
        // VIRTUAL file — so the type-check surface never lands on disk beside the
        // source, where authors saw it, editors indexed it, and `.gitignore` had to
        // hide it. A build has no business writing type-checker inputs at all.
        //
        // Layout SFCs (under the layouts dir) compile in layout mode: a
        // namespaced `aihu-layout-<stem>` tag + a passive <outlet> marker.
        const isLayout = _isLayoutFile(rawId, layoutsDir)
        const layoutTag = isLayout ? _layoutTag(basename(rawId, '.aihu')) : undefined
        const tOpts = {
          ...(target ? { target } : {}),
          ...(layoutTag ? { tag: layoutTag } : {}),
        }
        const result = transform(code, rawId, tOpts)
        // GX Phase 1 (#437-GX) — record this surface's resolved extract policy
        // for the build census (client-target builds carry no marker: policy
        // never reaches client artifacts).
        const extractMarker = _parseExtractMarker(result.code)
        if (extractMarker) extractCensus.set(rawId, extractMarker)
        // §9.4 per-file shadow override: the Rust `$shadow` macro emits a leading
        // `// @aihu:shadow <mode>` marker; it wins over the plugin's global
        // shadowMode and drives BOTH _injectShadowMode and the css fold branch.
        const perFileShadow = /^\/\/ @aihu:shadow (light|shadow)\b/m.exec(result.code)?.[1] as
          | 'light'
          | 'shadow'
          | undefined
        // DA4 (#437, the ratified flip) — the IMPLICIT page default: for an
        // `@route` unit with no `$shadow` pin the compiler emits the DISTINCT
        // default-marker token `// @aihu:shadow-default light`. Layout SFCs
        // (no `@route` block, so no compiler marker) get the same 'light'
        // default from `_isLayoutFile`. Precedence, ratified: `$shadow` pin >
        // plugin-global `shadowMode` config > page/layout default 'light' >
        // leaf default 'shadow' (the runtime's `?? 'shadow'` when nothing is
        // injected) — so an explicit plugin-global config still outranks the
        // implicit default, which is why this is not the pin marker.
        const perFileShadowDefault = /^\/\/ @aihu:shadow-default (light|shadow)\b/m.exec(
          result.code,
        )?.[1] as 'light' | 'shadow' | undefined
        const impliedShadowDefault = perFileShadowDefault ?? (isLayout ? 'light' : undefined)
        const effectiveShadow = perFileShadow ?? shadowMode ?? impliedShadowDefault
        let compiled =
          effectiveShadow != null ? _injectShadowMode(result.code, effectiveShadow) : result.code
        // Light-DOM: the authored `@style` block compiled to a per-instance
        // `host.adoptedStyleSheets` assignment, but a light-DOM host has no
        // shadow root so that setter is a no-op. Redirect the module-level
        // sheet to `document.adoptedStyleSheets` (idempotent) so authored recipe
        // CSS reaches the global cascade alongside the css-engine utility CSS.
        if (effectiveShadow === 'light') compiled = _globalizeAuthoredStyle(compiled)
        if (isLayout) compiled = _passivizeOutlet(compiled)

        // ── css-engine hook (optional, lazy, no circular dep) ──────────────
        // @aihu/css-engine depends on @aihu/compiler (for its AST), so the
        // compiler MUST NOT hard-depend on it. It is declared an OPTIONAL
        // peerDependency and pulled in ONLY via this guarded dynamic import:
        // when present, we compile the SFC's utility classes to scoped CSS
        // and fold it into the component's shadow `<style>`; when absent the
        // import throws and we no-op (utility classes simply don't emit —
        // the pre-hook behaviour). This keeps css-engine an opt-in enhancement
        // with zero dependency cycle.
        const utilityCss = await _maybeCompileUtilityCss(code, rawId)
        if (utilityCss) {
          if (effectiveShadow === 'light') {
            // Bug 6 — no shadow root → `host.adoptedStyleSheets` is a no-op.
            // Route utility CSS through Vite's CSS pipeline via a virtual
            // `.css` import so it lands in `dist/assets/*.css` and reaches the
            // global cascade. The authored `@style` block (if any) still
            // emits via the Rust codegen's normal path and is unaffected.
            const folded = _foldCssEngineStylesGlobal(compiled, utilityCss, rawId)
            if (folded) {
              utilityCssStore.set(folded.virtualId, utilityCss)
              compiled = folded.code
            }
          } else {
            // `shadowMode: 'shadow'`: fold into the
            // per-component `CSSStyleSheet` adopted by the shadow root.
            compiled = _foldCssEngineStyles(compiled, utilityCss)
          }
        }

        const elementTag = _extractElementTag(compiled)

        let out: string

        // §9.4 — a base-extending recipe (`defineComponent({ base: X, ... })`)
        // MUST take the full defineComponent/defineElement path: the static
        // island shim inlines `class extends HTMLElement` and cannot honor a
        // base class. Force-classify it interactive regardless of signal usage.
        // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: [^] is valid JS — matches any char including newlines
        const hasBase = /defineComponent\(\s*\{[^]*?\bbase\s*:/.test(compiled)

        // Plan 3.3 — static-island fast path. Bypasses HMR injection because
        // a component with no signals has no setup state to hot-replace.
        // Static islands strip @aihu/runtime entirely — do NOT inject auto-wiring
        // (it would reference _setMount/_setSignal as undefined identifiers).
        //
        // DA4 (#437): like `hasBase`, a light-DOM component cannot take the
        // static-island shim — the shim inlines `attachShadow({ mode: 'open' })`
        // and cannot honor `shadowMode: 'light'` (and its tail rewrite does not
        // match the injected options argument). Keep the full runtime path so
        // the injected `{ shadowMode: 'light' }` reaches defineElement.
        if (
          islandsEnabled &&
          elementTag !== null &&
          !hasBase &&
          effectiveShadow !== 'light' &&
          _classifyIsland(compiled) === 'static'
        ) {
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
        // Vite does NOT re-run its TS-strip step when a plugin returns code for a
        // non-.ts ID, so we must strip types ourselves before returning.
        //
        // Priority: always try transformWithEsbuild first — it strips types to
        // plain JS in both Vite 5 (via esbuild) and Vite 8 (deprecated wrapper).
        // Using moduleType:'ts' only as a last resort because `import('vite')`
        // resolves to the root node_modules vite (which may be v8 even when a
        // consumer project runs v5), causing v5's Rollup to receive raw TypeScript
        // and fail on import-type / as-casts.
        try {
          const vite = await import('vite')
          if ('transformWithEsbuild' in vite && typeof vite.transformWithEsbuild === 'function') {
            const stripped = await vite.transformWithEsbuild(out, 'component.ts', {
              target: 'esnext',
              sourcemap: false,
            })
            return { code: stripped.code, map: null }
          }
          // Fallback for future Vite versions where esbuild is fully removed:
          // return TS and let Rolldown strip types natively.
          // biome-ignore lint/suspicious/noExplicitAny: moduleType is rolldown API
          return { code: out, moduleType: 'ts', map: null } as any
        } catch {
          // If running outside Vite (e.g. tests, standalone transform), return as-is.
          return { code: out, map: null }
        }
      })()
    },
  }
}
