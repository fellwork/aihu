# `@aihu/app` build + render optimization

**Status:** in progress · **Date:** 2026-08-04

Framework-level optimizations, so apps stop rediscovering them one painful
regression at a time. Motivation in one number: `apps/docs-next/vite.config.ts`
is **218 lines**, most of it comments explaining framework gotchas.

## A. Lifting `apps/docs-next`'s config into the framework — IN FLIGHT

| # | Item | Shape | Evidence |
|---|---|---|---|
| 1 | `.aihu` dynamic-import-vars exclusion | **unconditional** — a bug workaround, not a choice | without it, `builtin:vite-dynamic-import-vars` re-parses compiled `.aihu` as JS, PARSE_ERRORs, and the affected **routes silently vanish from `dist`** (`/playground`, `/examples` both did) |
| 2 | Flat HTML siblings | option, default ON for `output:'static'` | absence = a 308 redirect on EVERY page; Lighthouse: "Redirects — Est savings of 800 ms" |
| 3 | Per-route `modulepreload` | option, **default OFF** | LCP 2253→2103ms (one RTT) but FCP 1282→2104ms — a real tradeoff, must not be silent |
| 4 | `cssCodeSplit` | recommend, don't silently override | one stylesheet 2252ms vs 27 files **2402ms** — splitting is 150ms worse at these sizes, and removes a FOUC class |

## B. The LCP floor: `createApp` re-renders instead of hydrating — NOT YET DONE

**This is the largest available win and no byte-level change can substitute for
it.**

### Evidence

Measured on `/guides/getting-started`: **TTFB 1ms, TBT 0ms**, every network
request completes in **1–3ms**. Nothing is network- or JS-bound. Lighthouse's
Lantern model therefore prices LCP on **critical-chain depth (round trips), not
bytes** — which is why LCP sat at ~2253ms through every byte-level change
attempted (split CSS, eager shell, dropping 141 KB of font preloads: no effect
or worse).

The guide text **is** in the prerendered HTML. But:

```js
// packages/app/src/client.ts:296,300,310
const layoutEl = document.createElement(entry.tag)
outlet.replaceChildren(layoutEl)   // discards the prerendered DOM
marker.replaceChildren(el)
outlet.replaceChildren(el)
```

`createApp` **always** builds fresh elements and replaces — including on first
load. So the text paints at FCP (1282ms), is thrown away, and repaints only
after the full JS chain resolves. **That ~970ms FCP→LCP gap is the LCP.**

### The infrastructure already exists

- `packages/arbor/src/hydrate.ts:407` — `hydrate(component, host, snapshot)`
  builds a path→element map from `data-aihu-path` anchors and seeds writable
  signals from server state, so it "ADOPTS server state instead of re-deriving
  it".
- The prerendered HTML already carries `data-aihu-path` on every node.
- `client.ts` already imports `hydrate` and wires it via `_setHydrate`.

It is wired for **per-custom-element** signal pre-seeding
(`define-element.ts:64-88`), but the OUTLET's prerendered subtree is never
adopted.

### Shape of the fix

On the **first** render only, when the outlet already holds prerendered content
for the matched route, adopt it instead of `replaceChildren`. Subsequent
(SPA-navigation) renders keep replacing — that is correct there.

Subtleties that make this non-trivial, and why it is its own change:
- detecting that the prerendered DOM corresponds to the matched route
- the layout + page nesting (the page mounts into the layout's
  `[data-aihu-outlet]` marker, so both levels need adopting)
- must not regress SPA navigation, or the `output:'spa'` mode that has no
  prerendered DOM at all
- interaction with the island registry: components must be defined before
  adoption, or the adopted tree upgrades mid-hydration

### RESULT: implemented, and it did NOT move LCP — do not ship as-is

> Attempted in worktree `w-hydrate` (uncommitted). First-render adoption works
> — node identity survives, guarded by route stamp + `data-aihu-path` markers +
> a one-shot flag, SPA nav still replaces, 8 new tests, full suite green (4150
> passed). **LCP: 2252ms before, 2252ms after.** The diagnosis was half right:
> the double paint is real, but eliminating it does not move the metric.
>
> **Why: JS node identity is not what Chrome measures.** Chrome re-registers an
> LCP candidate when a node is DETACHED and RE-INSERTED, even when the pixels
> are byte-identical. Adoption moves the server's nodes out of `#outlet` into a
> fresh page element inside a fresh layout marker — same objects, but they
> leave the document, so a new candidate fires at the end of the JS chain. To
> win, the prerendered node must **never leave the document**.
>
> Corroborated independently: Speed Index (1953ms) == FCP (1953ms) < LCP
> (2253ms) on the unmodified build — visual completeness genuinely precedes
> LCP. (The agent reported visual completion at 750ms from a filmstrip; I could
> not reproduce that magnitude, only the direction.)
>
> **Two framework findings that are independently important:**
> 1. **Nothing ever emitted `hydrate: true`.** `define-element.ts:64`'s entire
>    hydration branch was dead code in production, reachable only from
>    hand-written tests. The `__aihu_state__` snapshot was a red herring —
>    `hydrate()` tolerates an empty one; the real gate was `enableHydration`.
> 2. **Layouts are silently never prerendered.** `prerender.ts` reads
>    `sidecar?.layout` via `readRouteSidecar`, which returns `null` in EVERY
>    real build (the stdin compile path writes no `.route.json`;
>    `vite-plugin.ts:173` documents this for the client table, but the SSG path
>    never got the fallback). Every layout warning sits downstream of a name
>    that never arrived, so this failed with zero output.
>
> **DO NOT ship `hydrate: true` as-is.** The hydrate branch returns before
> `_runMounts`, so **onMount never runs on first load**. docs-next happens to
> want that (the `html={body}` binding's `replaceChildren` would destroy the
> adopted article), but generally it silently kills first-load interactivity in
> every page and layout. Run-onMount-for-correctness vs skip-it-to-preserve-DOM
> is a design decision, not an implementation detail.
>
> **Correct design (deferred):** hydrate strictly IN PLACE, no `createElement`
> on first render — prerender emits the host elements so the document already
> has the final tree, and the client's first render becomes a no-op that lets
> `customElements.define` upgrade already-connected nodes. Requires a compiler/
> server change (wrap SSR output in the component tag) plus the napi native
> renderer built for layouts, plus resolving the onMount contradiction.

### Original expected payoff (not realised)

If LCP collapses to ≈FCP, that is **2253ms → ~1282ms** — nearly a second, and
comfortably under the 2100ms gate that currently blocks the docs-next deploy.
It also removes the "prerendered content is decorative" property, which today
means real users pay a full client render for content already sitting in the
HTML.

## C. Sequencing

1. **A** (in flight) — mechanical lifts, low risk.
2. **B** — after A lands, to avoid two concurrent changes in
   `packages/app/src/client.ts`. Note `client.ts` is ALSO touched by the
   app-root-context work (`docs/plans/2026-08-04-app-root-context.md`), which is
   implemented-but-uncommitted in the `w-route-context` worktree — land that
   first or expect a conflict.
3. Re-measure the docs-next Lighthouse gate after B before touching the
   threshold. The current failure (LCP 2254 vs 2100) is most likely a symptom
   of B, not a genuinely slow site.

## D0. Config lives in `vite.config.ts` — `aihu.config.ts` is legacy

**Corrected after maintainer input.** I initially argued `aihu.config.ts` should
survive as the home for irreducible facts. That is wrong, and the codebase says
so explicitly:

- `packages/cli/src/load-project-config.ts:13-23` — reading order is (1)
  `vite.config.ts` via `loadAihuConfig()`, *"the canonical location: it is where
  the config is actually consumed, so there is no second file to drift"*; (2)
  `aihu.config.ts`, *"legacy fallback… not permanent… the direction is
  SvelteKit's, where the framework config collapsed into the Vite config once
  the tooling could read it there."*
- `packages/app/src/load-config.ts:14-20` — *"The second file was a
  tooling-capability workaround, not an architectural principle."*

The claim that survives is narrower and still useful: `output` and `site.url`
are genuinely **irreducible values** — deployment intent and outside-world
knowledge that no derivation can produce. They belong **inline in
`viteAihuPlugin({ … })`**, not in a second file.

### Migration status

| | |
|---|---|
| already inline | `examples/layouts`, `examples/blog-router`, `examples/css-engine-utility` |
| still legacy | `apps/docs`, **`apps/docs-next`**, `examples/auth-magna-seo`, `examples/cf-adapter`, `examples/ssg-site`, `examples/plugin-demo` |

`apps/docs-next` should migrate before the aihu.dev cutover — it is 6 of the
remaining 6 that matters most. Once every consumer is inline, the
`aihu.config.ts` fallback in the CLI loader can be dropped.

**This subsumes the duplication in §D:** with config inline, `site.url` has one
home, and the discovery layer derives from it rather than restating it.

## D. Unify the discovery/SEO/agent surface into config — NOT YET DONE

### The duplication, measured

`apps/docs-next/agent-readiness.config.ts` is **175 lines** that restate what the
framework already knows:

| restated there | already declared |
|---|---|
| `siteUrl: 'https://aihu.dev'` | `aihu.config.ts` → `site: { url }` |
| 16 × `title:` | each page's `@route { head: { title } }` |
| 11 × `description:` | each page's `@route { head: { description } }` |

Every artifact this emits — `sitemap.xml`, `robots.txt`, `llms.txt`,
`llms-full.txt`, `.well-known/agent-card.json`, the MCP/A2A cards — derives from
**the route list + per-route `head` + `site.url`**. The file router already owns
all three. Requiring a parallel config file is both duplicated effort and a
guaranteed drift source: change a page's `head.title` and the sitemap/llms entry
silently keeps the old one.

### The integration that already exists but is bypassed

`AihuConfig` **already** has `agentReadiness?: AgentReadinessConfig | false`
(`packages/app/src/config.ts:214`), and `viteAihuPlugin` lazy-loads and wires it
(`vite-plugin.ts:179-188`). `apps/docs-next` does not use it — it hand-wires
`viteAgentReadinessIntegration()` in `vite.config.ts:94` instead.

That is the **third** instance of the same pattern in this codebase: the island
component registry, `RouteContext`, and now agent-readiness — a framework
capability exists, the app hand-rolls around it, and the hand-rolled version
carries a bug or a cost the built-in would not have.

### What is genuinely NOT integrated

- **`@aihu/seo`** — zero references from `@aihu/app`. It is opt-in via manual
  plugin wiring only, with no `AihuConfig` key.
- **The seo/agent split is not clean.** `@aihu/seo` re-exports `seoLlmsSections`
  *from* `@aihu-plugin/agent-readiness`, and agent-readiness itself emits
  `sitemap.xml` and `robots.txt` — classic SEO artifacts. Two packages own one
  surface.
- **css-engine utility generation** — `apps/docs-next` hand-rolls `gen-css.ts` as
  a `prebuild`/`predev` script calling `compile()` directly. `css.shadowMode` is
  a config option but *generating the utility layer* is not.
- **ACP** — `@aihu/agent-acp` ships, but agent-readiness emits no ACP descriptor
  alongside its MCP/A2A cards. Confirm whether that is deliberate.

### Proposed shape

One integrated surface, defaulting from what the router already knows:

```ts
defineConfig({
  site: { url: 'https://aihu.dev' },
  seo:  { sitemap: true, robots: true },          // derived from routes + head
  agents: { llms: true, mcp: true, a2a: true, acp: false },
  css:  { shadowMode: 'light', utilities: { … } },// replaces gen-css.ts
})
```

The point is not fewer keys — it is that **none of these should require restating
a title, a description, or a URL that a `@route` block already declares.**

### Sequencing

After **A** lands: that work is already editing `config.ts` and `vite-plugin.ts`,
and this would touch the same files. Do not run them concurrently.

## E. Config must drive SERVING, not just emission

Section D covers *generating* the discovery documents. That is only half. The
config should also determine how those files — and everything else — are
**served**, because today serving semantics are hand-maintained, decoupled from
what the app actually contains, and **not exercised until production**.

### Evidence 1 — a hand-written CSP shipped a dead feature

`apps/docs-next/public/_headers` is hand-written and committed. Its own comment
records the failure:

> `'wasm-unsafe-eval'` IS required… The two notes that used to stand here
> ("docs-next has no WASM playground") were written before the playground was
> ported and **were never revisited**. The result: /playground shipped, and every
> compile died on the LIVE deploy with a CSP violation — **while working
> perfectly in local dev, which serves no `_headers` at all.**

Two framework-shaped failures in one incident:

1. **The CSP was stale relative to the build graph.** The framework *knows* the
   app ships WASM — `public/wasm/` is staged by a build step and the chunk is in
   the manifest. A derived CSP could not have gone stale; a copied one did.
2. **Dev never exercises serving.** `vite dev` applies no `_headers`, so every
   header rule is unverified until a real deploy. That is the entire reason this
   reached production.

### Evidence 2 — the test harness had to re-implement production serving

`apps/docs/scripts/serve-dist.ts` hand-reimplements Cloudflare Pages semantics,
and its comments record why each rule exists:

- `.wasm` **must** be `application/wasm` — "Omitting this silently breaks the
  playground e2e" (`WebAssembly.instantiateStreaming` rejects any other type).
- SPA fallback must apply **only to extensionless paths** — "returning HTML for
  /robots.txt fails Lighthouse's SEO 'robots.txt is valid' audit".

Both are production serving rules that the framework owns nowhere, so the
harness had to guess them. When the harness and the adapter disagree, the gate
measures something production never does.

### Evidence 3 — two parallel sets of discovery documents

| hand-written + committed in `public/` | generated by agent-readiness |
|---|---|
| `agents.json`, `ai.txt`, `openapi.json` | `llms.txt`, `llms-full.txt`, `sitemap.xml`, `robots.txt`, `.well-known/agent-card.json` |

Same surface, two mechanisms, no single source of truth.

### What "fluent with serving" should mean

The config already declares `output`, `site.url`, `agentReadiness`, and (via
`@route`) every path and its `head`. That is enough to *derive*:

- **Headers** — CSP computed from what the build actually contains (WASM →
  `'wasm-unsafe-eval'`; self-hosted fonts → `font-src 'self'`), plus immutable
  caching for hashed assets. Derived, so it cannot go stale.
- **Content types** — `.wasm` → `application/wasm` and friends, in dev, in the
  test harness, and in the adapter, from one table.
- **SPA-fallback policy** — which paths must NOT fall back (anything with an
  extension; every emitted discovery document), so `/robots.txt` can never be
  answered with the SPA shell.
- **Content negotiation** — `packages/plugin-agent-readiness/src/content-negotiation.ts`
  already exists; serving agents markdown/llms and humans HTML is a serving
  decision the config should own, not each app.
- **Adapter output** — `_headers` / `_routes.json` (Pages), `vercel.json`
  (Vercel) generated from that one model rather than hand-copied per app.
- **Dev + harness parity** — the same rules applied by `vite dev` and by the
  Lighthouse/e2e static server. This is the one that matters most: it is what
  turns "shipped a dead playground" into "failed locally in the first minute".

### Why this belongs in the framework, not the app

Every item above was hit **by hand, today**, in one app: the CSP/WASM outage,
the `.wasm` content-type, the `/robots.txt` SPA-fallback SEO failure, and the
trailing-slash 308 (§A item 2). An app author has no reason to know any of them
in advance, and `apps/docs` — the site this one replaces — carries its own
hand-copied variants of the same files.
