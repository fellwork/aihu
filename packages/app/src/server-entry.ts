/**
 * `virtual:aihu-server-entry` — the request-time server bundle's entry module,
 * for `output: 'ssr'`.
 *
 * ## Why a virtual module and not an emitted file
 *
 * The shipped adapters build their worker by writing a STRING to disk at
 * `closeBundle`, after Vite has finished. That is why they cannot render
 * anything: the string is outside the module graph, so it can neither import
 * `virtual:aihu-routes` nor have a `.aihu` file compiled for it. The route
 * manifest they emit instead gives every route a 404 placeholder.
 *
 * `@aihu/adapter-cloudflare`'s docblock blames "the non-serializable `module()`
 * thunk" for that. It is not the reason. `fileToRouteDefinition`
 * (`vite-plugin.ts`) builds `module: () => Promise.resolve({ default: null })` —
 * there was never a loadable module to serialize, so no amount of adapter-side
 * work could have produced one. Route modules have to come from
 * `virtual:aihu-routes`, from INSIDE the graph.
 *
 * So this module IS the worker entry, declared as a build input of the `ssr`
 * environment. `import routes from 'virtual:aihu-routes'` then resolves to real
 * chunks (`module: () => import("./assets/pages-<hash>.js")`), `.aihu` files
 * compile to the SERVER target automatically (`aihuCompilerPlugin` reads
 * `this.environment.config.consumer === 'server'`), and one `vite build`
 * produces both environments.
 *
 * LOAD-BEARING and non-obvious: a `virtual:` id works as a build entry ONLY via
 * `rollupOptions.input`. `build.ssr: 'virtual:…'` fails with
 * `[UNRESOLVED_ENTRY]`.
 *
 * ## Why the registries are resolved lazily, on the first request
 *
 * The original constraint is unchanged: `__aihu_schild` runs inside the
 * compiled string fast path, which is SYNCHRONOUS. Every child module must
 * already be in hand before a render begins, which is why
 * `ServerRouterOptions.children` is typed as a RESOLVED `Map` and not as a
 * loader. What moved is only WHERE that awaiting happens — it is now awaited
 * once inside `handler`, strictly BEFORE `__router.handle()` is invoked, which
 * satisfies the resolved-map contract exactly as module-scope resolution did.
 *
 * It had to move because module-scope `await` makes this entry an ESM ASYNC
 * MODULE, and that deadlocks a Worker that can never be loaded:
 *
 *   - Vite/rollup hoists the shared runtime INTO the entry chunk, so the lazy
 *     component/layout chunks statically `import '../_worker.js'` back. Seven
 *     of eight chunks did, measured on vite 6.4.3 in a consumer-shaped tree.
 *   - Async-module semantics then close the loop: the entry suspends at its
 *     top-level await; the dynamically imported chunk cannot finish evaluating
 *     until the entry's evaluation promise settles; and that settles only once
 *     the dynamic import resolves. `await import('./_worker.js')` NEVER
 *     settles — node reports `Detected unsettled top-level await`.
 *   - This built GREEN. The failure was at load, i.e. on every request in
 *     production.
 *
 * The static import cycle is STILL PRESENT after this change, and is harmless:
 * a cycle without a top-level await resolves normally, and the dynamic imports
 * now happen during a request, long after the entry finished evaluating.
 * Removing the TLA removes the *necessary* condition rather than the
 * incidental one, so no future bundler's chunking decision can reintroduce the
 * deadlock. That is why this, and not `inlineDynamicImports` or a
 * `manualChunks` shape that keeps the entry a leaf, is the fix — those tune
 * where the cycle lands on today's bundler, and their failure mode is a green
 * build that hangs on every production request.
 *
 * Vite 8/rolldown happens to extract the runtime into standalone chunks, so
 * the entry is a leaf with zero back-edges. That is luck, not immunity.
 *
 * ## Why the DOCUMENT is assembled here and not in `@aihu/router/server`
 *
 * `createServerRouter().handle()` returns a bare fragment. That is correct for
 * what it is — a runtime library that a consumer can wire by hand in Node with
 * no bundler anywhere — and it is why an `output: 'ssr'` route rendered and then
 * never hydrated: nothing put the client's `<script type="module">` on the page.
 *
 * The missing input is a BUILD ARTIFACT: the finished client `index.html`, with
 * Vite's hashed entry script and modulepreloads already in it. The only thing
 * that knows about build artifacts is `@aihu/app`'s Vite plugin — which is also
 * what generates this entry — so the wrap happens here, on the response, and
 * `@aihu/router/server` keeps a public API with no template, no outlet id and no
 * outDir in it. Two consequences worth stating:
 *
 *   - `handle()` is byte-identical for every existing consumer. This step cannot
 *     regress an adapter, a hand-wired Node server, or the SSG path.
 *   - `@aihu/server` is untouched. Its `renderToString` document wrapper stays
 *     gated on `SsrOptions.head` and stays unable to emit a `<script src>`;
 *     neither is on this path.
 *
 * The splice itself is `@aihu/app/ssr-document`'s `injectIntoOutletId` — the
 * SAME function the SSG prerender calls, against the SAME template, into the
 * SAME configured outlet id. One rule, so a Worker and a prerender cannot
 * disagree about where a page goes.
 */

import type { AihuConfig } from './config.ts'

export const SERVER_ENTRY_VIRTUAL_ID = 'virtual:aihu-server-entry'
export const SERVER_ENTRY_RESOLVED_ID = '\0virtual:aihu-server-entry'

/**
 * The build-artifact module this entry imports its document template from:
 * the finished client `index.html`, plus the resolved outlet id and the
 * `site.url` / `app.head` the head lowering needs.
 *
 * Served by `vite-plugin.ts` in the `ssr` environment only, and only at build
 * time — the client environment has already been built by then, so the file is
 * on disk when `load()` runs.
 */
export const SSR_DOCUMENT_VIRTUAL_ID = 'virtual:aihu-ssr-document'
export const SSR_DOCUMENT_RESOLVED_ID = '\0virtual:aihu-ssr-document'

/**
 * What an adapter's `serverEntry()` is handed. Small on purpose: the adapter
 * contributes a platform wrapper, it does not get to rewrite the framework's
 * half of the entry.
 */
export interface ServerEntryContext {
  /**
   * The identifier the generated prelude binds the request handler to. Call it
   * as `handler(request, platform)` — it matches `ServerRouter.handle`.
   *
   * `platform` is the host runtime's per-request ambient state, and the
   * adapter decides ENTIRELY what goes in it: the framework forwards the value
   * unread and untyped to route loaders, the governed provider, the live
   * entitlement resolver and the session resolver. `@aihu/adapter-cloudflare`
   * passes `{ env, ctx }` — bindings plus the `ExecutionContext`. A Node or
   * Vercel adapter has different ambient state and should pass that instead;
   * nothing here is Cloudflare-shaped.
   *
   * Passing nothing is still valid and behaves exactly as it did before the
   * parameter existed.
   */
  readonly handler: string
  /** The resolved `AihuConfig` passed to `viteAihuPlugin`. */
  readonly config: AihuConfig
}

/** The binding name the prelude exports and an adapter wrapper calls. */
const HANDLER = 'handler'

/**
 * Build the source of `virtual:aihu-server-entry`.
 *
 * `adapterSource` is the adapter's `serverEntry()` text, appended verbatim
 * after the prelude — it is expected to contain the platform's own
 * `export default`. When no adapter contributes one, the prelude's named
 * `handler` export stands alone and is usable by hand.
 */
export function buildServerEntrySource(adapterSource?: string): string {
  const prelude = [
    '// AUTO-GENERATED by @aihu/app — virtual:aihu-server-entry. Do not edit.',
    "import { createServerRouter } from '@aihu/router/server'",
    "import { buildChildRegistry } from '@aihu/server'",
    "import { createSsrDocument } from '@aihu/app/ssr-document'",
    "import routes from 'virtual:aihu-routes'",
    "import __components from 'virtual:aihu-server-components'",
    "import __layouts from 'virtual:aihu-layouts'",
    `import __document from '${SSR_DOCUMENT_VIRTUAL_ID}'`,
    '',
    '// NOTHING is awaited at module scope. A module-scope `await` would make',
    '// this entry an ESM async module, and the lazy chunks below statically',
    '// import back into it (the bundler hoists the shared runtime into the',
    '// entry), which closes an evaluation cycle that can never settle — a green',
    "// build whose Worker deadlocks on load. See this file's header docblock.",
    '//',
    '// Instead the whole registry graph is resolved ONCE on the first request',
    '// and memoised. The synchronous-render constraint is untouched: `handler`',
    '// awaits this to completion BEFORE calling `handle()`, so every child and',
    '// layout module is already in hand when `__aihu_schild` runs inside the',
    '// synchronous compiled string path.',
    'async function __buildRouter() {',
    '  // PER ENTRY, not en masse. `Promise.all` rejects on the first rejection,',
    '  // so a single component module that throws on import used to abort the',
    '  // WHOLE registry build — every other component lost too, and (because the',
    '  // promise below is memoised) for the life of the isolate. One module that',
    "  // cannot load is a fact about that module; `__aihu_schild`'s own posture",
    '  // for a child it cannot render is to emit the bare element and report it,',
    '  // and this matches that: skip the entry, name it, keep the registry.',
    '  const __loaded = await Promise.all(',
    '    Object.entries(__components).map(async ([tag, load]) => {',
    '      try {',
    '        return { tag, mod: await load() }',
    '      } catch (err) {',
    '        console.error(',
    "          '[@aihu/app] ssr: component <' + tag + '> failed to load, so it is SKIPPED from " +
      "the ' +",
    "            'server registry — every reference to it renders as an empty element and " +
      "fills ' +",
    "            'in on the client. The rest of the registry is unaffected.',",
    '          err,',
    '        )',
    '        return undefined',
    '      }',
    '    }),',
    '  )',
    '',
    "  // Key on the module's own `__aihu_tag__` — what `defineElement` actually",
    '  // registers, and what `__aihu_schild` looks up. The generated registry key',
    '  // is derived from the FILE and is only used to choose which modules to',
    "  // bundle; `@aihu/app`'s SSG path keys on `__aihu_tag__` for the same",
    "  // reason, and the two paths disagreeing would ship one module's markup and",
    "  // upgrade it with another's on hydrate.",
    '  const __discovered = []',
    '  for (const __entry of __loaded) {',
    '    // `undefined` is a skipped entry from the catch above.',
    '    if (__entry === undefined) continue',
    '    const { tag, mod } = __entry',
    '    const real = mod.__aihu_tag__',
    '    if (real === undefined) {',
    // Emitted as CONCATENATION rather than a template literal purely so this
    // file contains no `${…}` inside a plain string — which a linter cannot
    // tell apart from a template literal someone forgot to backtick.
    '      console.warn(',
    "        '[@aihu/app] ssr output: component <' + tag + '> exports no __aihu_tag__, so it ' +",
    "          'cannot be resolved by tag and will render as an empty element.',",
    '      )',
    '      continue',
    '    }',
    '    __discovered.push({ tag: real, module: mod })',
    '  }',
    '',
    '  const __children = buildChildRegistry(__discovered, (m) => console.warn(m))',
    '',
    '  // Layouts, resolved here for the same reason the children are: composition',
    '  // happens inside a request and cannot await a dynamic import mid-flight.',
    "  // Keyed by the layout NAME, which is what a route's compiled `layout` field",
    '  // carries — `virtual:aihu-layouts` is already keyed that way.',
    '  //',
    '  // Without this the live SSR path renders every page BARE while the SSG path',
    '  // composes its shell, so the same route looks right prerendered and loses its',
    '  // nav, footer and grid the moment a Worker serves it.',
    '  // Same per-entry catch as the components above, for the same reason. A',
    "  // layout missing from the map degrades in `@aihu/router/server`'s",
    '  // `withLayout` — the page is served without its chrome, warned once — so',
    '  // skipping one costs exactly the routes that declare it. Aborting the map',
    '  // cost every route its shell, including routes naming a layout that loaded',
    '  // perfectly well.',
    '  const __layoutEntries = await Promise.all(',
    '    Object.entries(__layouts).map(async ([name, entry]) => {',
    '      try {',
    '        return { name, mod: await entry.load() }',
    '      } catch (err) {',
    '        console.error(',
    "          '[@aihu/app] ssr: layout \\'' + name + '\\' failed to load, so it is SKIPPED " +
      "from ' +",
    "            'the server registry — routes declaring it are served without their layout " +
      "and ' +",
    "            'the client wraps them on hydrate. Other layouts are unaffected.',",
    '          err,',
    '        )',
    '        return undefined',
    '      }',
    '    }),',
    '  )',
    '  const __layoutMap = new Map()',
    '  for (const __entry of __layoutEntries) {',
    '    if (__entry === undefined) continue',
    '    __layoutMap.set(__entry.name, __entry.mod)',
    '  }',
    '',
    '  return createServerRouter(routes, {',
    '    children: __children,',
    '    layouts: __layoutMap,',
    '  })',
    '}',
    '',
    '// ONE memoised init, and it is the PROMISE that is memoised, not the',
    '// resolved router. That is what makes concurrent first requests safe: the',
    '// check and the assignment are both synchronous and sit in the same job, so',
    '// no second request can observe `undefined` after the first has entered.',
    '// Every caller therefore awaits the SAME promise and `__buildRouter` runs',
    "// exactly once — no duplicate module loads, and `createServerRouter`'s",
    '// one-time boot validation is not repeated. Memoising the resolved value',
    '// instead would let N concurrent cold requests each start their own init.',
    '//',
    '// A rejection is sticky on purpose, and it stays that way: the inputs are',
    '// bundled chunks, so a failure is deterministic, and retrying would only',
    '// re-fail while replaying the boot warnings. It also matches the old',
    '// module-scope behaviour, where a failed init meant the module never loaded.',
    '//',
    '// What CHANGED is what can reach that rejection. Per-entry catches above mean',
    '// a component or layout module failing to import no longer rejects this at',
    '// all — the only things left are `buildChildRegistry` and',
    "// `createServerRouter`'s boot validation, which are pure functions of the",
    '// build and genuinely cannot succeed on a retry. That is what makes sticky',
    '// correct rather than merely cheap. A sticky rejection is also no longer a',
    '// dropped request: `handler` catches it and answers 500.',
    'let __routerPromise',
    'function __getRouter() {',
    '  if (__routerPromise === undefined) __routerPromise = __buildRouter()',
    '  return __routerPromise',
    '}',
    '',
    '// The document wrapper. `handle()` returns a BARE FRAGMENT — no doctype, no',
    '// <html>, no <head>, and no client <script type="module"> — so before this',
    '// an ssr route painted server markup and never hydrated. `__document` is the',
    '// finished client index.html (which already carries the hashed entry script)',
    '// plus the resolved outlet id; the wrapper splices the fragment into that',
    "// outlet and applies the matched route's head. Only text/html responses are",
    '// wrapped — a 404, a 500 and the governed JSON endpoint pass through',
    "// untouched, which is what keeps an adapter's ASSETS fallthrough working.",
    'const __wrapDocument = createSsrDocument(__document)',
    '',
    '/**',
    ' * Request handler: `(request: Request, platform?: unknown) => Promise<Response>`.',
    ' *',
    " * `platform` is the host's per-request ambient state — on Workers the adapter",
    ' * passes `{ env, ctx }`, so a route loader reaches KV/D1/R2/secrets and',
    ' * `waitUntil` through it. The framework never reads inside it.',
    ' *',
    ' * Async because the registries are resolved on first use; the await is paid',
    ' * once, by whichever request arrives first on a cold isolate.',
    ' *',
    ' * ## THE ERROR BOUNDARY, and why it is at this layer',
    ' *',
    ' * Nothing on the render chain caught anything. A throw from the registry',
    ' * init, from `route.module()`, from a route `loader`, from `renderToString`',
    ' * or from the document splice therefore rejected the promise this returns —',
    " * which IS the Worker's `fetch` promise. Cloudflare answers a rejected fetch",
    ' * with error 1101: no status, no body, nothing a browser, a monitor or a',
    ' * `wrangler tail` can act on. Not a 500 — no response at all.',
    ' *',
    ' * Three layers could hold the boundary and only this one is right:',
    ' *',
    " *   - `@aihu/router/server`'s `handle()` is a runtime library a consumer can",
    ' *     wire by hand in Node, and callers legitimately want the throw so they',
    ' *     can render their own error page. It is also not enough: `__getRouter()`',
    ' *     and `__wrapDocument` sit OUTSIDE it and both can throw.',
    " *   - An adapter's `fetch` wrapper is per-adapter. Cloudflare, Vercel and",
    ' *     every community adapter would each need their own copy, and an',
    " *     `output: 'ssr'` build with NO adapter falls back to this bare `handler`",
    ' *     export with no boundary at all.',
    ' *   - This handler is the one place EVERY `output: ssr` build passes through,',
    ' *     and it is directly beneath the platform entry point. One boundary.',
    ' *',
    ' * `text/plain` is deliberate on two counts. It is what `handle()` already',
    " * uses for its own 404 and 500s, and it is what `createSsrDocument`'s `isHtml`",
    ' * gate lets through unwrapped — an HTML 500 would be spliced into the client',
    ' * template and served as a document. The status is deliberate too: the CF',
    " * adapter's wrapper falls through to ASSETS on 404 only, so a 500 is returned",
    ' * as-is rather than being masked by a 200 SPA shell.',
    ' *',
    ' * The body is generic and the error is logged, never served. A thrown value',
    ' * here can carry a query string, a binding name or a build-time filesystem',
    ' * path.',
    ' */',
    `export const ${HANDLER} = async (request, platform) => {`,
    '  try {',
    '    const __router = await __getRouter()',
    '    const __response = await __router.handle(request, platform)',
    '    // The SAME router object and the same pathname, so this is the match that',
    '    // produced the response, not a second opinion about it — `match` is a pure',
    '    // pattern walk over a build-fixed route table. It is read ONLY for the',
    "    // route's compiled head, and the wrapper memoises the head-applied template",
    '    // per pattern, so the per-request cost is one map lookup.',
    '    const __match = __router.match(new URL(request.url).pathname)',
    '    // `return await`, not `return`. A bare `return` of a promise resolves the',
    '    // try block BEFORE the promise settles, so a rejection from the document',
    '    // wrapper would escape the catch and reject the fetch — the exact bug this',
    '    // boundary exists to remove, reintroduced by the tidier-looking spelling.',
    '    return await __wrapDocument(__response, __match ? __match.route : undefined)',
    '  } catch (err) {',
    '    console.error(',
    "      '[@aihu/app] ssr: unhandled error while rendering ' + request.url + ' — responding " +
      "500:',",
    '      err,',
    '    )',
    "    return new Response('Internal Server Error', {",
    '      status: 500,',
    "      headers: { 'Content-Type': 'text/plain; charset=utf-8' },",
    '    })',
    '  }',
    '}',
  ].join('\n')

  return adapterSource ? `${prelude}\n\n${adapterSource}\n` : `${prelude}\n`
}

/** The handler identifier the prelude exports. Exported so tests cannot drift. */
export const SERVER_ENTRY_HANDLER = HANDLER
