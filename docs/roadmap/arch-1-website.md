# Architecture Spec: Aihu Project Website + Documentation (v1.1+)

**Status:** DRAFT · **Author:** Architect A1 · **Date:** 2026-05-05
**Companion inputs:** `docs/roadmap/scout-aihu.md`, `examples/docs-site/`, `docs/site/*.md` (12 pages)
**Build target:** `apps/docs/` (new package) · **Domain:** `aihu.dev`

---

## 0. Constraints That Shape Every Decision

1. **Built with Aihu.** The docs site is the premier dogfood. It uses `@aihu/app`, `@aihu/router`, `@aihu/server`, and `@aihu/adapter-cloudflare`. Every component in the site is a `.aihu` SFC. No React, no Vue, no Astro.
2. **Dep-free thesis is the framework, not the site.** `@aihu/*` packages stay zero-dep. The `apps/docs/` package is free to use `shiki`, `pagefind`, `marked`, etc. — it is an example app, not a framework package.
3. **TODO-001 blocks TTHW.** Until pre-built `aihu-compile` binaries land, the "Getting Started" flow cannot claim ≤5 min. The website's "quick start" code blocks must carry a conditional note and the installation page must link to the GitHub Actions release workflow once it ships.
4. **Existing pipeline reuse.** `examples/docs-site/` has proven components (`docs-shell.aihu`, `live-demo.aihu`, `theme-toggle.aihu`) and a working design-token system (`style.css`). These are migrated and extended, not rewritten.
5. **Agent-ready from day one.** The site itself ships `@aihu/agent-readiness`, producing `llms.txt`, MCP server card, and `robots.txt` on every build.

---

## 1. Information Architecture

### 1.1 Page Hierarchy

```
aihu.dev/
├── /                           (Homepage — hero + EMBEDDED INTERACTIVE PLAYGROUND P0)
├── /docs/                      (Redirects to /docs/introduction)
│   ├── introduction, installation, getting-started
│   ├── guides/                 (8 existing guide pages)
│   ├── packages/               (NEW — 17 per-package API reference pages)
│   └── api-reference           (consolidated table)
├── /examples/                  (Examples gallery — depends on arch-2)
├── /playground/                (Standalone full-screen playground)
├── /changelog/                 (NEW — version selector)
├── /blog/                      (NEW — sparse initially)
└── /community/                 (NEW — Contributing, COC, Discord)
```

### 1.2 Where Existing `docs/site/` Pages Live

All 12 existing pages migrate to the new IA:
- `docs/site/introduction.md` → `/docs/introduction`
- `docs/site/getting-started.md` → `/docs/getting-started`
- `docs/site/authoring-{components,agents,plugins}.md` → `/docs/guides/...`
- `docs/site/{reactivity,routing-layouts,data-fetching,ssr-hydration,deployment}.md` → `/docs/guides/...`
- `docs/site/api-reference.md` → `/docs/api-reference` (consolidated; rows link to `/docs/packages/<name>`)
- `docs/cli.md` → `/docs/packages/cli` (currently missing from pipeline)

### 1.3 New Pages Required (M2)

- `/docs/packages/{context,agent-a2a,agent-acp,adapter-cloudflare,adapter-vercel}` — 5 missing package docs
- `/changelog/v1.0` — first public changelog
- `/blog/introducing-aihu` — launch post
- `/community/contributing` — contribution guide

---

## 2. Visual + UX Design

### 2.1 Layout

**Three-column docs layout:** 240px left nav · `max-width: 760px` content · 160px mini-TOC. Header sticky at 60px.

**Homepage (P0 priority):**
- Hero centered, max-width 900px
- **Interactive playground embedded BELOW THE FOLD on mobile / SIDE-BY-SIDE with hero on desktop** — this is the flagship deliverable, see §6 M1
- Three feature pills: "≤9.3 kB total runtime" · "Zero non-@aihu deps" · "MCP + A2A + ACP built-in"

**Mobile (< 768px):** Left nav collapses to drawer. Mini-TOC hidden. Live demos remain interactive.

### 2.2 Theme System

Tokens carried forward from `examples/docs-site/style.css` unchanged. New tokens: `--sidebar-w`, `--toc-w`, `--content-max`, `--font-mono` (JetBrains Mono self-hosted), `--font-body` (system stack). Theme persistence via existing `theme-toggle.aihu`.

**Accent:** `#7c3aed` (violet, conveys 爱护 warmth) light / `#a78bfa` dark — 5.88:1 / 4.5:1 contrast meet WCAG AA.

### 2.3 Hero

- **Tagline (LOCKED — Directive 0):** **"Aihu — agentic discovery and interaction, for human purpose."**
- **Subhead:** "Aihu (爱护, EYE-hoo) is a zero-dependency Web Components framework. Every component you write is discoverable by AI agents and callable as a tool — in service of whatever you're building."
- **CTAs:** "Try it now →" (primary, scrolls to embedded playground) · "Get started" (secondary, links to docs) · "GitHub" (outline)
- **Snippet:** 12-line `@state` + `@template` + `@agent` SFC with copy button (M1: static fallback; the embedded playground below is what makes it live)
- **Hierarchy in copy:** human-purpose framing leads. The mantra positions agents as the means; the human's intent is the end. Avoid pure parallelism ("both humans and AI") — use "in service of" / "discoverable by" / "callable on the human's terms" patterns.

### 2.4 Live Code Blocks (in guide pages)

Each live-demo: source tab + rendered sandbox + copy button. M3 adds "Edit" button → opens playground with that SFC pre-loaded.

---

## 3. Technical Implementation

### 3.1 Location: `apps/docs/` (NEW package, not extension of `examples/docs-site/`)

Rationale: docs-site example uses rolldown directly (not Vite), lacks `@aihu/router`, lacks SSG/SSR. Cannot be extended to multi-page SSG without major surgery. A clean `apps/docs/` package is itself the most important example in the repo. The three proven components (`docs-shell`, `live-demo`, `theme-toggle`) migrate to `apps/docs/src/components/`.

```
apps/docs/
  package.json, vite.config.ts, aihu.config.ts
  public/{fonts/,og/}
  src/
    pages/{index.aihu, docs/[...slug].aihu, examples/index.aihu, playground/index.aihu, changelog/, blog/, community/}
    layouts/{default.aihu, docs.aihu}
    components/{site-header, docs-sidebar, docs-mini-toc, theme-toggle, live-demo, code-block, search-modal, example-card, version-badge, playground-embed}.aihu
    content/{docs/, blog/, changelog/}
    lib/{md-loader.ts, search.ts, toc-extractor.ts}
```

### 3.2 Aihu App Wiring

```typescript
// vite.config.ts
import { aihuCompilerPlugin } from '@aihu/compiler'
import { viteRouterIntegration } from '@aihu/router/plugin'
import { viteAgentReadinessIntegration } from '@aihu/agent-readiness'
export default defineConfig({
  plugins: [
    aihuCompilerPlugin(),
    viteRouterIntegration(),
    viteAgentReadinessIntegration({ appName: 'Aihu Documentation', appUrl: 'https://aihu.dev', mcpEndpoint: '/mcp' }),
  ],
})

// aihu.config.ts
import { defineAihuConfig } from '@aihu/server'
import { cloudflare } from '@aihu/adapter-cloudflare'
export default defineAihuConfig({ adapter: cloudflare(), build: { target: 'universal' } })
```

### 3.3 Markdown Processing — `marked` + `shiki`

Pipeline: `marked.parse(source, { gfm: true })` → raw HTML; post-process `<pre><code class="language-*">` blocks with `shiki.codeToHtml`; extract H2/H3 anchors → mini-TOC array; emit `Record<slug, { html, toc, title, description }>` content map.

**Shiki theme:** `github-light` / `github-dark`. The `.aihu` language grammar registered as custom Shiki language using the TextMate grammar from `packages/vscode-aihu/syntaxes/aihu.tmLanguage.json` — this gives proper syntax highlighting on the docs site.

### 3.4 Search — Pagefind (static)

Static index generated post-build. Zero external service, no API key. WASM client lazy-loaded on `Cmd+K`. CI step: `bunx pagefind --site dist --output-path dist/pagefind`.

`apps/docs/tests/search-smoke.ts` — 10-query benchmark gate (CI). Each query must return correct primary page as result #1.

### 3.5 Code Playground — TWO surfaces

**P0 — Homepage embedded playground (M1):**
- Embedded `<playground-embed>` custom element in homepage
- Compiles `.aihu` SFCs in-browser via WASM build of `aihu-compile` (depends on arch-4 M1 priority for WASM compiler)
- URL-encoded snippet sharing
- 6 preset snippets at launch (counter, todo, agent-block, ssr, route, plugin)
- Mobile responsive: editor + preview stack vertically below 768px
- Compile latency target: < 200ms for 50-line `.aihu` source
- Bundle size budget: < 1 MB initial JS (compiler.wasm lazy-loads)

**M3 — Standalone /playground page:**
- StackBlitz WebContainers full multi-file project (extends the homepage playground beyond the single-SFC limit)
- Pre-loaded with `examples/hacker-news/` template
- "Open in Playground" button on every guide code block

The homepage playground is the flagship "flex" deliverable. See `docs/roadmap/_user-directives.md` Directive 1.

### 3.6 Versioning

Static path prefix: `aihu.dev/` (current) + `aihu.dev/v1/` (pinned snapshot at branch cut). `_redirects` handles routing. Version selector UI added M4. Until then: plain v1.0 badge in header.

Changelog source: `CHANGELOG.md` at `apps/docs/src/content/changelog/v1.0.md`. v1.1+ generated from conventional commits via `scripts/gen-changelog.ts` (zero-dep).

---

## 4. Hosting + Deployment

### 4.1 Cloudflare Pages

Dogfood `@aihu/adapter-cloudflare`. Free tier covers OSS docs traffic. Sub-50ms TTFB globally.

```toml
# wrangler.toml
name = "aihu-docs"
compatibility_date = "2025-01-01"
pages_build_output_dir = "dist"
```

```
# public/_headers
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*.html
  Cache-Control: public, max-age=0, must-revalidate
/pagefind/*
  Cache-Control: public, max-age=86400
/playground
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

### 4.2 CI Deploy

`.github/workflows/deploy-docs.yml` triggers on `docs/site/**`, `apps/docs/**`, `packages/*/src/**`, `packages/vscode-aihu/syntaxes/**`. Steps: bun install → build framework → build docs → pagefind index → wrangler deploy → Lighthouse CI.

---

## 5. Doc Accuracy Backlog (10 single-PR tasks)

| # | Task | Files | Owner |
|---|---|---|---|
| TASK-DOC-001 | Fix `@aihu/agent` API ref (`defineAgent` → `registerAgentMetadata`/`getAgentMetadata`/`getAllAgentMetadata`) | `api-reference.md`, `authoring-agents.md` | docs |
| TASK-DOC-002 | Fix `@aihu/agent-service` API ref (`defineAgentService` → `createAgentService`) | `api-reference.md`, `authoring-agents.md` | docs |
| TASK-DOC-003 | Write `@aihu/context` package doc | new file ~80 lines | docs |
| TASK-DOC-004 | Write `@aihu/agent-a2a` package doc | new file ~100 lines | docs |
| TASK-DOC-005 | Write `@aihu/agent-acp` package doc | new file ~80 lines | docs |
| TASK-DOC-006 | Write `@aihu/adapter-cloudflare` package doc | new file ~120 lines | docs+devops |
| TASK-DOC-007 | Write `@aihu/adapter-vercel` package doc | new file ~100 lines | docs |
| TASK-DOC-008 | Add `docs/cli.md` to pipeline | copy + sidebar entry | docs |
| TASK-DOC-009 | Verify/fix `AIHU_NATIVE_SKIP` env var name in `deployment.md` | 1 line | docs |
| TASK-DOC-010 | Add TODO-001 callout to installation page | ~5 lines | docs |

---

## 6. Phased Delivery Plan

### M1 — Weeks 1-2: Scaffold + Theme + HOMEPAGE PLAYGROUND + First Deploy

**Goal:** aihu.dev is live with hero + embedded interactive playground. The flagship "flex" landed.

Deliverables:
- `apps/docs/` package scaffold with CF adapter
- Layouts (default, docs three-column)
- Components (site-header, docs-sidebar, theme-toggle, code-block, version-badge)
- Pages (`index.aihu` with hero + **`<playground-embed>`**, `docs/[...slug].aihu` shell)
- `lib/md-loader.ts` (marked + shiki + `.aihu` grammar)
- **`<playground-embed>` custom element working with WASM compiler** (depends on arch-4 M1)
- 6 preset snippets loaded at launch
- URL-encoded snippet sharing
- `.github/workflows/deploy-docs.yml` deployed to CF Pages
- `aihu.dev` DNS configured
- Lighthouse baseline 90+ all scores

Acceptance:
- `https://aihu.dev` serves homepage with working playground (compile <200ms, 6 presets, mobile responsive)
- `https://aihu.dev/docs/introduction` renders with `.aihu` syntax highlighting
- Theme toggle persists
- CI deploy passes on push to main

### M2 — Weeks 3-4: All Doc Content + API Corrections

- 12 existing docs migrated under new IA
- `docs/cli.md` added to pipeline
- All 10 TASK-DOC items completed
- 5 missing package docs written (context, agent-a2a, agent-acp, adapter-cloudflare, adapter-vercel)
- `docs-mini-toc.aihu`, `code-block.aihu`, `example-card.aihu` components shipped
- Examples gallery `/examples/index.aihu`
- `/changelog/v1.0`, `/blog/introducing-aihu`, `/community/contributing`
- OG meta tags on all pages
- Lighthouse: 95+ on `/docs/introduction`

### M3 — Weeks 5-6: Search + Live Demos + Standalone Playground

- Pagefind index in CI
- `<search-modal>` (`Cmd+K`)
- 10-query search smoke test gate
- `<live-demo>` extended with tab switcher
- Live demos in reactivity/agents/getting-started
- TODO-001 ships → `/playground` page (StackBlitz embed of hacker-news)
- "Open in Playground" buttons on guide code blocks
- Auto-generated example gallery thumbnails (Playwright in CI)

### M4 — Weeks 7+: Versioning + Community + Blog

- v1.0 snapshot at `/v1/`
- Version selector in header
- `scripts/gen-changelog.ts`
- Blog renderer + 2-3 launch posts
- "Edit this page" links
- RSS feed, sitemap.xml, canonical URLs
- Remove TODO-001 callout, record TTHW_UI ≤5 min

---

## 7. Success Metrics

- **TTHW_UI ≤ 5 min** — measured in M4 after TODO-001 ships
- **Doc coverage = 100% of public exports** — `scripts/check-doc-coverage.ts` CI gate (M2)
- **Search relevance:** 10/10 canonical queries return correct primary result as #1
- **Lighthouse 95+** on perf/a11y/best-practices/SEO for homepage + introduction + getting-started
- **Playground compile latency < 200ms** for 50-line `.aihu` (P0 for M1)
- **Playground bundle < 1 MB initial** (compiler.wasm lazy-loaded)

---

## 8. Component Inventory

| Component | Custom element | Migrated from | Deps |
|---|---|---|---|
| `site-header.aihu` | `site-header` | `examples/docs-site/` header | `theme-toggle`, `version-badge` |
| `theme-toggle.aihu` | `theme-toggle` | `examples/docs-site/components/` | `@aihu/signals` |
| `docs-sidebar.aihu` | `docs-sidebar` | `examples/docs-site/docs-shell.aihu` | `@aihu/signals`, `@aihu/router` |
| `docs-mini-toc.aihu` | `docs-mini-toc` | NEW | `@aihu/signals` |
| `code-block.aihu` | `code-block` | NEW | `@aihu/signals` |
| `live-demo.aihu` | `live-demo-*` | `examples/docs-site/components/live-demo.aihu` | `@aihu/signals` |
| `search-modal.aihu` | `search-modal` | NEW | `@aihu/signals`, Pagefind (lazy) |
| `example-card.aihu` | `example-card` | NEW | None |
| `version-badge.aihu` | `version-badge` | NEW | None |
| **`playground-embed.aihu`** | **`playground-embed`** | **NEW (P0 M1)** | `@aihu/signals`, WASM `aihu-compile` (lazy) |

---

## 9. Critical Dependencies and Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| **WASM `aihu-compile` (arch-4)** | **P0 homepage playground blocked without it** | **Coordinate with A4: WASM build is M1 priority alongside pre-built binaries** |
| TODO-001 (pre-built binaries) | Standalone /playground (M3), TTHW_UI metric (M4) blocked | M3 deferred until shipped; callout warns users |
| `@aihu/adapter-cloudflare` correctness | Bugs surface in dogfood | Intentional — file issues |
| Shiki `.aihu` grammar | If grammar fails to load, code blocks degrade | Test in M1; fallback: `typescript` highlighting |
| Pagefind + CF Pages | Index must generate before deploy | Explicit step ordering in `deploy-docs.yml` |
| StackBlitz WebContainers | Requires COOP/COEP headers | `_headers` applies only to `/playground` |

---

*End of spec. Highest-leverage items: TASK-DOC-001/002 (live API ref inaccuracies) + M1 homepage playground.*
