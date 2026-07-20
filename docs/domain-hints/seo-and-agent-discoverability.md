# SEO & agent discoverability — researched findings (2026-07-19)

External-world facts gathered while designing aihu's discoverability surface. These are
**not** aihu implementation notes — they are properties of crawlers, AI agents, and peer
frameworks that constrain what aihu should build.

Every claim below is tagged:
**[VERIFIED]** primary source or reproduced test · **[INFERRED]** reasoned from mechanism,
not directly confirmed · **[UNVERIFIED]** could not confirm; treat as open.

> ⚠️ **Sourcing warning.** This topic's search results are heavily polluted by
> AI-generated SEO spam making confident, fabricated claims. Two examples caught during
> research: (a) that Core Web Vitals "influences 25% of Page Experience signals" and
> passing all three yields an "8–15% visibility boost" — Google publishes **no** weight,
> percentage, or quantified ranking impact; those numbers are invented. (b) Articles
> titled like "Declarative Shadow DOM SEO: 19 Powerful Wins" asserting DSD is "reliably
> indexable by all crawlers" — directly contradicted by the extractor tests below.
> **Prefer primary sources. Assume secondary SEO writing is vendor content until proven
> otherwise.**

---

## 1. Shadow DOM and crawlers — the load-bearing section

### 1.1 Googlebot handles shadow DOM. **[VERIFIED]**

[Understand JavaScript SEO Basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics),
§"Follow best practices for web components" (page last updated **2026-03-04**):

> "Google supports web components. When Google renders a page, it flattens the shadow DOM
> and light DOM content."
> "This means Google can only see content that's visible in the rendered HTML."

Google's own example is an `attachShadow({mode:'open'})` component populating the root in
`connectedCallback` — i.e. exactly aihu's pattern. Flattening covers **all** shadow
content, not only slotted content. The `<slot>` advice is about not *losing* light-DOM
children that are never slotted; it is not a claim that unslotted shadow content is
invisible.

Independently reproduced: Burton Smith,
[SEO and Web Components — 2023 Edition](https://dev.to/stuffbreaker/seo-and-web-components-2023-edition-3l6i)
(2023-08-07) placed `<h1>`/`<h2>` in **slotless** shadow roots, client-rendered only, and
confirmed Google indexed them.

**Bing** initially reported "missing H1" for shadow content; Bing contacts confirmed to
the same author that this was a **Webmaster Tools bug, not the crawler** — content does
get rendered and indexed. **[UNVERIFIED]** as a published Bing statement; credible but
secondhand.

### 1.2 No major AI crawler executes JavaScript. **[VERIFIED]**

Vercel + MERJ, [The rise of the AI crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler)
(2024-12-17):

> "none of the major AI crawlers currently render JavaScript. This includes: OpenAI
> (OAI-SearchBot, ChatGPT-User, GPTBot), Anthropic (ClaudeBot)... Perplexity
> (PerplexityBot)"

Methodology: instrumentation of nextjs.org and the Vercel network over several months,
cross-validated against Resume Library and CV Library; 500M+ GPTBot fetches with zero
evidence of JS execution. They *fetch* JS files without executing them (GPTBot 11.50% of
requests, ClaudeBot 23.84%). Monthly volume: GPTBot 569M, ClaudeBot 370M fetches.

**Google Gemini is the exception** — it rides Googlebot's WRS and does render.

⚠️ **Caveat:** study is from Dec 2024, ~19 months old at time of writing. No equally
rigorous successor found; no vendor has since announced JS rendering. Re-check before
betting heavily on it.

### 1.3 Declarative Shadow DOM does **not** reliably fix this. **[VERIFIED by test]**

This contradicts the prevailing narrative and is the most important finding here.

**Mechanism:** per the DOM spec, a `<template>`'s children are parsed into a separate
`content` DocumentFragment and are **not children of the template element**. Reproduced
against jsdom:

```
template.textContent           = ""
template.childNodes.length     = 0
template.content.textContent   = "HIDDEN"
parent div textContent         = ""      <-- whole subtree reads as empty
```

Any spec-compliant tree walk or `textContent` call returns nothing. Extractors run
against a page containing DSD content, slotted light DOM, and an inert `<template>`
(scripts stripped to avoid false positives):

| Extractor | light DOM | **DSD shadow text** | slotted | inert `<template>` |
|---|---|---|---|---|
| cheerio `.text()` | YES | **YES** | YES | YES |
| node-html-parser `.text` | YES | **YES** | YES | YES |
| jsdom `body.textContent` | YES | **no** | YES | no |
| turndown (HTML→Markdown) | YES | **no** | YES | no |
| @mozilla/readability | YES | **no** | YES | no |
| macOS `textutil` (WebKit) | YES | **YES** | YES | no |

jsdom does not expand DSD at all — `el.shadowRoot` is `null`, raw `<template>` stays in
the tree.

**The split is mechanical:** extractors on non-spec-compliant tree models
(cheerio/domhandler, node-html-parser) treat template children as ordinary children and
see the text. Spec-compliant DOM implementations (jsdom, and everything built on it —
Readability, most Turndown pipelines) see **nothing**. Readability and Turndown are
exactly what AI-ingestion and RAG pipelines are typically built on.

**Conclusion: "we serve DSD markup, therefore non-JS crawlers read it" is FALSE as a
general claim.** True only for extractors that happen to violate the spec. Not reliable.

Corroborating from the tooling side: Crawl4AI added shadow-DOM handling only in v0.8.5,
via an **opt-in** `flatten_shadow_dom` flag — default did not handle it.

Test artifacts: `page.html`, `test2.mjs` (scratchpad, re-runnable).

### 1.4 Google has never published anything about DSD specifically. **[UNVERIFIED]**

Searched Search Central docs, the Search Central blog, and Mueller/Splitt commentary.
The JS SEO Basics page does not mention DSD. Every online claim that "Google indexes DSD"
is **inference from the general flattening statement**, not a Google statement.

The inference is reasonable — Googlebot's WRS runs evergreen Chromium, whose parser
expands `<template shadowrootmode>` into a real shadow root at parse time, so DSD content
should be in the flattened tree before JS runs. But no credible empirical DSD indexing
experiment exists. **Genuine gap in the public record.**

### 1.5 DSD browser support **[VERIFIED]**

Chrome/Edge 111+, Firefox 123+, Safari 16.4+, Opera 97+, Samsung Internet 22+. Baseline
"Newly available" 2024-08-05. ([web.dev](https://web.dev/articles/declarative-shadow-dom))

Spec renamed `shadowroot` → `shadowrootmode` in 2023; Chrome 90 shipped the legacy
spelling, modern landed in 111, fully standardized parts in 124. **No evidence any
crawler keys off the legacy attribute** — but no crawler documents either attribute, so
this is "no data," not "safe."

### 1.6 Non-JS consumers beyond AI crawlers **[VERIFIED]**

`facebookexternalhit`, `Twitterbot`, `LinkedInBot`, Slack, Discord, Telegram all fetch
raw HTML and never execute JS. Slack/Discord/Telegram additionally enforce sub-second
timeouts.

**Implication is absolute: OG/Twitter-card tags must be in the served HTML `<head>`.**
No shadow-DOM strategy — DSD included — changes this.

### 1.7 Structured data placement

- **JSON-LD in a shadow root:** no direct test found, no Google doc addresses it.
  Mechanism is decisive though — inside a DSD `<template>` the script isn't even a child
  of the template per spec; inside an imperative shadow root it's outside normal document
  traversal. **Recommendation [VERIFIED-by-reasoning, high confidence]: keep JSON-LD in
  `<head>` or light DOM.** Failure mode itself is **[INFERRED]**.
- **Microdata in shadow roots:** chased the most promising lead
  ([Scott Nath, June 2024](https://scottnath.com/blahg/microdata-jsonresume-dsd/)) — it's
  about performance/FOUC, not SEO. **No evidence either way. Genuine gap.**

### 1.8 Component-library teams are conspicuously hedged **[VERIFIED]**

None make the strong claim SEO blogs make:

- **Lit** ([SSR overview](https://lit.dev/docs/ssr/overview/)): only *"while the major
  search-engine web crawlers render pages with full JavaScript-enabled browsers, not all
  web crawlers support JavaScript."* Does **not** claim DSD is indexed by non-JS crawlers.
  That silence is telling.
- **Web Awesome / Shoelace** ([SSR docs](https://webawesome.com/docs/ssr)): *"Progressive
  enhancement is not a goal"*; *"SSR components are **NOT** meant to fully work without
  JavaScript."* Their SSR targets layout shift and FOUC, not crawlers. Also notes
  `adoptedStyleSheets` is **incompatible with DSD serialization** — directly relevant,
  since aihu uses constructable stylesheets.
- **Salesforce LWC** [Light DOM guide](https://developer.salesforce.com/docs/platform/lwc/guide/create-light-dom.html):
  lists five reasons to opt out of shadow DOM — and **none of them is SEO**. Worth noting
  since LWC light DOM is often cited as an SEO workaround; Salesforce doesn't argue that.
- **Production sites relying on DSD for indexed content:** could not verify any.
  **[UNVERIFIED]**

---

## 2. Peer framework SEO surfaces (July 2026)

Versions confirmed during research: Next.js **16.2.10** · Astro **7.0** (2026-06-22),
`@astrojs/sitemap` **3.7.3** · SvelteKit **2.70.1** stable / **3.0.0-next.10** ·
`@nuxtjs/seo` · React Router **v7**.

**Out-of-the-box completeness ranking: Nuxt SEO ≫ Next.js > Astro > React Router v7 ≈ SvelteKit.**
Next wins on meta field coverage and type safety; Nuxt on automation and zero-per-page
defaults; Astro on sitemap ergonomics specifically while shipping nothing for meta;
SvelteKit and React Router are deliberate minimalists where SEO is entirely userland.

### 2.1 Capability matrix

| Capability | Next 16 | Astro 7 | SvelteKit 2 | RR v7 | Nuxt SEO |
|---|---|---|---|---|---|
| Sitemap auto-derived from route table | ❌ hand-written `sitemap.ts` | ✅ walks routes | ❌ hand-written | ❌ hand-written | ✅ most thorough |
| Typed JSON-LD in meta API | ❌ community `schema-dts` | ❌ | ❌ | ✅ **only one** | ✅ auto-graph |
| Shared cross-module site config | `metadataBase` only | partial (`site`) | ❌ | ❌ | ✅ **only real one** |
| Auto-canonical | ❌ | partial | ❌ | ❌ | likely **[UNVERIFIED]** |
| Dynamic OG image generation | ✅ `next/og` | ❌ | ❌ | ❌ | ✅ `nuxt-og-image` |
| Official meta API | ✅ Metadata API | ❌ **none** | ❌ markup only | ✅ `meta` export | ✅ `useSeoMeta` |

### 2.2 Nuxt's `nuxt-site-config` — the prior art that matters most

Exists specifically to break the "N modules × M duplicated config" problem. Declare
`site: { url, name, description, env, indexable, trailingSlash, defaultLocale }` **once**
in `nuxt.config`, and robots, sitemap, schema.org, og-image, and `@nuxtjs/i18n` all read
it. Settable three ways (config key, env vars, programmatically at runtime). Module-author
APIs: `useSiteConfig`, `createSitePathResolver`, `withSiteUrl`, `getNitroOrigin`.

**This is the direct analogue of aihu's `@aihu/seo` ÷ `plugin-agent-readiness` problem** —
two packages each carrying their own bot list, site identity, and defaults. The inverted
AI-bot default is what duplicated config eventually produces. Nuxt is the only surveyed
framework with a real answer, and the answer is a **shared config layer, not a merged
package**.

Nuxt SEO bundles: `@nuxtjs/robots` (≥6.0), `@nuxtjs/sitemap` (≥8.0), `nuxt-og-image`
(≥6.2), `nuxt-schema-org` (≥6.0), `nuxt-link-checker` (≥5.0), `nuxt-seo-utils` (≥8.1),
`nuxt-site-config` (≥4.0). Note the renames — the old `nuxt-simple-*` names were promoted
to official `@nuxtjs/*` scope.

`nuxt-schema-org` **auto-generates `WebSite` + `WebPage` nodes** (linked via `isPartOf`,
with a `ReadAction` potentialAction) from site config on every page, zero code. That is
the bar for "SOTA out of the box."

### 2.3 Audience-differentiated serving has precedent **[VERIFIED]**

Next 15.2+ streams metadata for dynamically-rendered pages, appending resolved metadata
to `<body>` rather than `<head>`. Bots that execute JS are fine; **"HTML-limited bots"**
(`facebookexternalhit`, `Twitterbot`, `Slackbot`, `Bingbot`) are **UA-sniffed** and served
blocking `<head>` metadata instead. Configurable via `htmlLimitedBots` in `next.config.ts`.

So "same content, different serving by consumer class" is established practice, not a
novel risk.

### 2.4 Notable API details worth stealing or avoiding

- **Next metadata merging is shallow, root→leaf, and nested objects are REPLACED
  wholesale.** Set `openGraph` in a child and you lose the parent's `openGraph.description`.
  Recurring bug source; the documented workaround is hoisting shared fragments and
  spreading. **Avoid this design.**
- **React Router v7 `meta` returns an array of `MetaDescriptor`**, supporting repeated
  properties and `"script:ld+json"` descriptors. Merge is **override, not merge** — the
  last matching route wins outright, deliberately, with `matches` passed in so you build
  your own composition. `links` by contrast **do** accumulate.
- **Astro requires `site` in config** for sitemap; `entryLimit` default 45000 auto-splits;
  `serialize` is the per-entry escape hatch; `chunks` (v3.7.0+) splits by custom logic.
- **Next `generateSitemaps()`** shards large sitemaps; in v16 the `id` prop became a
  **Promise** (breaking change from v15).
- **`useServerSeoMeta` is deprecated** in Nuxt — use `if (import.meta.server)` instead.
- **Astro's `hybrid` output mode is gone** — only `static | server`, with per-route
  `export const prerender`.

---

## 3. SEO mechanics — constraints that bind implementation

### 3.1 `lastmod` auto-stamping backfires **[VERIFIED]** ⚠️ design constraint

`<priority>` and `<changefreq>` are **ignored by Google entirely**. `<lastmod>` is the one
sitemap field carrying weight — **and it actively backfires if auto-stamped with the build
date**. Google detects this and then discounts the signal **site-wide**.

Nuxt defaults `autoLastmod: false` deliberately, which is independent corroboration.

**Consequence for aihu:** "derive the sitemap automatically" must mean *derive URLs
automatically; derive `lastmod` from real content mtime, or omit the field.* A naive
`lastmod: new Date()` default is **worse than emitting nothing**.

### 3.2 Sitemap limits **[VERIFIED]**

50,000 URLs / 50MB uncompressed per file. Sitemap index files may reference up to 50,000
sitemaps. Large sites need index generation, not just a bigger file.

### 3.3 `rel=next/prev` is dead for Google **[VERIFIED]**

Deprecated as an indexing signal March 2019. Google treats paginated pages as normal pages
and relies on internal linking. Bing reportedly still uses it, so it's cheap to emit —
but it should not be a framework priority.

### 3.4 hreflang is genuinely framework-level **[VERIFIED]**

Requires **bidirectional** links and exactly **one `x-default`**. Valid via `<link>` tags,
HTTP headers, or XML sitemap — the sitemap route being the sane choice at scale.
Correctness depends on knowing the **whole route table**, not one page, which is why this
cannot be userland.

### 3.5 `fetchpriority` — large known-win gap **[VERIFIED]**

Supported across all modern browsers. Per the 2025 Web Almanac, images are the LCP element
on **85% of desktop pages**, but only **17% of pages set `fetchpriority`** on it. An
unusually large gap between "known win" and "actually done" — which argues for the
framework emitting it rather than documenting it.

### 3.6 Core Web Vitals — resist fabricated precision **[VERIFIED]**

[Google's CWV docs](https://developers.google.com/search/docs/appearance/core-web-vitals)
publish **no weight, no percentage, no quantified ranking impact** — only that CWV "aligns
with what our core ranking systems seek to reward," plus thresholds: **LCP <2.5s,
INP <200ms, CLS <0.1**. Any source quoting a percentage is fabricating.

### 3.7 Structured data types that matter **[VERIFIED]**

Google's rich-result gallery lists ~25 types. Only a handful matter for most sites:
**Article, Breadcrumb, Organization, Product, FAQ-adjacent, Video, LocalBusiness.**

---

## 4. Implications for aihu (design, not yet decided)

Recorded so the reasoning isn't re-derived. **These are conclusions, not ratified decisions.**

1. **aihu has no structural SEO problem for Google** — shadow DOM is flattened and indexed.
2. **It has a structural problem for its own thesis.** aihu is "agent-first by design," yet
   AI crawlers don't execute JS, so page content is invisible to exactly the consumers the
   framework targets. Google sees everything; GPTBot/ClaudeBot/PerplexityBot see a shell.
3. **DSD is not the fix** (§1.3). It's a hydration-correctness feature, not an
   indexability one. Do not scope it as the SEO precondition.
4. **Three independent mitigations, in priority order:**
   1. `<head>` metadata server-rendered (OG, Twitter, canonical, title/description,
      JSON-LD). DOM-independent, non-negotiable, fixes social unfurlers.
   2. **Markdown content negotiation on real page requests** — if an AI crawler fetches a
      page and receives `text/markdown`, the DOM question is moot for that audience.
      `MarkdownResolver` shipping as an interface with **no implementation** is the
      highest-leverage gap in the agent story. Current negotiation is `Accept:`-header-only
      with **no UA sniffing**, which is useless when AI crawlers don't send that header
      (cf. Next's `htmlLimitedBots`, §2.3).
      ⚠️ **Do not conflate this with llms.txt** — that manifest has ~zero verified adoption
      (§5.1). This mitigation rides page fetches the crawler is *already making*, which is
      why it survives the llms.txt finding intact.
   3. Light-DOM rendering for primary content (`shadowMode: 'none'` for page-level
      components) — the structural fix; also simplifies the shard track.
5. **Four audiences, not two.** The inverted-defaults bug exists because both packages
   modeled a binary that doesn't exist: `search` (Googlebot) · `ai-training` (GPTBot,
   CCBot, Google-Extended) · `ai-assistant` (ChatGPT-User, PerplexityBot) ·
   `agent-caller` (MCP/A2A, authenticated, can *act*). "Block training, allow citation"
   is a real and common intent that neither package can express.
6. **aihu's differentiator is the Rust compiler.** All five surveyed frameworks are JS, so
   none can validate SEO at build time. aihu already emits `route_json` and
   `agent-manifest.json` sidecars, so it could derive sitemaps from `@route` blocks,
   validate JSON-LD against schema.org types as **compile errors**, and warn on routes
   missing description/canonical. Nobody ships this.

---

## 5. GEO, llms.txt, and AI-surface optimization

### 5.1 llms.txt has ~zero verified adoption **[VERIFIED]** ⚠️ deflates a common assumption

[Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
(updated **2026-07-10**), verbatim:

> "You don't need to create new machine readable files, AI text files, markup, or Markdown
> to appear in Google Search (including its generative AI capabilities), as Google Search
> itself doesn't use them."

John Mueller, [Bluesky](https://bsky.app/profile/johnmu.com/post/3lrshm4gggs2v),
**2025-06-17** (verified against the AT Protocol API, not trade press):

> "FWIW no AI system currently uses llms.txt."

And via [SEJ](https://www.searchenginejournal.com/google-says-llms-txt-comparable-to-keywords-meta-tag/544804/)
(2025-04-17):

> "AFAIK none of the AI services have said they're using LLMs.TXT (and you can tell when
> you look at your server logs that they don't even check for it). To me, it's comparable
> to the keywords meta tag."

**Attribution warning:** the widely-circulated version of that quote is attributed to
*Illyes on Bluesky*. It is **Mueller, on Reddit**. The `illyes.bsky.social` account was
checked via AT Protocol — created 2026-03-23, 1 post, 0 followers, not credible. Likewise
the Illyes "You don't need GEO, LLMO or anything else" line is a paraphrase laundered
through one attendee's LinkedIn recap; it carries no quotation marks at source. **Do not
repeat either as verbatim.**

**Consequence for aihu:** `plugin-agent-readiness`'s llms.txt / llms-full.txt endpoints
are **aspirational, not load-bearing**. Keep them (cheap, standards-adjacent, costs
nothing to serve), but do not scope work as though they drive traffic.

### 5.2 Page-level markdown negotiation is a *different* claim, and it survives **[INFERRED, high confidence]**

Critically: §5.1 is about a *manifest file*. It does **not** bear on what happens when an
AI crawler fetches an actual page. Those fetches are real and enormous — GPTBot 569M and
ClaudeBot 370M per month (§1.2) — and none of those crawlers execute JS (§1.2), so what
they receive from a shadow-DOM app is a shell.

Serving `text/markdown` (or server-rendered light-DOM HTML) on those page requests
therefore remains valuable **regardless of llms.txt adoption**, because the delivery
mechanism is content negotiation on a request the crawler is already making, not a file
it must be persuaded to read.

Marked INFERRED because no study directly measures ingestion quality by content-type.
The underlying facts (crawler volume, no JS execution) are VERIFIED.

### 5.3 "GEO" is mostly vendor-driven **[VERIFIED, with a real caveat]**

Google's consistent line across four documents and three spokespeople:

- AI features doc (2025-12-10): *"There are no additional requirements to appear in AI
  Overviews or AI Mode, nor other special optimizations necessary."*
- Optimization guide (2026-07-10): *"optimizing for generative AI search is optimizing for
  the search experience, and thus still SEO."*
- Danny Sullivan, WordCamp US 2025-08-28: *"Good SEO is good GEO, or AEO, AI SEO, LLM SEO,
  or LMNOPEO."*
- Mueller, 2025-08-14: *"The higher the urgency, and the stronger the push of new acronyms,
  the more likely they're just making spam and scamming."*

Independent data supports this: **seoClarity** (362k queries, Oct 2025) found **94% of AI
Overviews cited at least one top-20 source, 90% top-10**. **BrightEdge** found AIO/organic
overlap *grew* 32.3% → 54.5% (May 2024 → Sept 2025) — converging toward classic ranking,
not diverging.

**The real caveat:** Google admits **query fan-out** — *"a set of concurrent, related
queries generated by the model to request more information and fetch additional relevant
search results."* That concedes the mechanism by which AI visibility *can* diverge from
classic ranking, and it is exactly the gap GEO vendors sell into. The
[Princeton/Georgia Tech GEO study](https://arxiv.org/abs/2311.09735) (KDD 2024) found
quotations +41%, statistics +32%, inline citations +30% on generative citation visibility —
real peer-reviewed work, but predating mature AI Overviews.

⚠️ **Why vendor numbers don't reconcile:** they measure different units — "did *any* cited
source rank top-10?" (inflates overlap) vs "what share of *all* citations rank top-10?"
(deflates it). Most commentary doesn't disclose which. Claimed CTR declines span
**15%–89%** across vendors; a 5× spread is evidence that methodology, not reality, drives
the numbers.

**Consequence for aihu: do not build "GEO features."** Solid fundamentals — server-rendered
`<head>`, structured data, fast pages, crawlable content — are the documented answer.

### 5.4 Google shipped a real AI opt-out, June 2026 **[VERIFIED]** — validates the audience model

This obsoletes the long-standing "you cannot opt out of AI Overviews without leaving
Search" constraint.

Through May 2026: AI Overviews and AI Mode are Search features fed by **Googlebot**, and
`Google-Extended` governed only Gemini Apps / Vertex AI grounding —
[explicitly](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers)
*"Google-Extended does not impact a site's inclusion in Google Search."* So opting out of
AI Overviews meant leaving Search. The UK CMA said publishers *"currently do not have
sufficient choice."*

**2026-06-03**, [Google blog](https://blog.google/products-and-platforms/products/search/new-controls-website-owners/):

> "Sites that opt out will not receive traffic or impressions from our generative AI
> features."
> "This control will not be used as a ranking signal for search results outside of these
> generative AI Search features."

Rolling out **UK-first**. **[CONTESTED — causation]** Google frames this as product
evolution; the timeline reads as compliance (Strategic Market Status Oct 2025 → CMA
conduct-requirement proposals 28 Jan 2026 → control ships UK-first June 2026).

**Why this matters for aihu's design:** Google now ships, in its own product, the exact
distinction the four-audience model proposes (§4.5) — *search* separable from
*AI-generative*, with an explicit guarantee that opting out of one does not penalize the
other. The audience axis is no longer a bet; it's mirrored by the largest player.

Granular controls remain blunt: `nosnippet`, `data-nosnippet`, `max-snippet`, `noindex`.
`nosnippet` removes the ordinary search snippet too, and the new Search Console toggle is
site-level all-or-nothing. **There is still no way to appear in AI Overviews on your own
terms — only in, or out.**

### 5.5 Traffic-impact evidence **[CONTESTED]**

Recorded because it will come up, not because it drives a design decision.

- **Google's claim is unsupported.** Liz Reid, [2025-08-06](https://blog.google/products-and-platforms/products/search/ai-search-driving-more-queries-higher-quality-clicks/):
  *"total organic click volume... relatively stable year-over-year"* and *"slightly more
  quality clicks."* The post contains **no charts, percentages, baseline period, geography,
  or methodology**, and "quality clicks" is a Google-defined, unaudited metric with no
  prior existence in the literature. Still unsupported eleven months later.
- **Best independent counter-evidence:** [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
  (900 US adults, 68,879 real searches, Mar 2025) — clicked a traditional result in **8%**
  of visits with an AI summary vs **15%** without; clicked a link *inside* the summary in
  **1%**. *Honest caveat critics omit: observational, not causal — Google chooses which
  queries get AIOs, disproportionately informational ones that always had lower CTR.*
- **Reuters Institute / Chartbeat:** 2,500+ sites, Google organic **−33% global, −38% US**
  (Nov 2024→Nov 2025) — but *"hard news has been largely exempted from overviews"*; harm
  concentrates in lifestyle/utility content.
- **Penske Media v. Google** (1:25-cv-03192, D.D.C., filed 2025-09-12) pleads **antitrust,
  not copyright**. Motion to dismiss fully briefed Mar 2026; no ruling, no discovery.
  Untested allegations.

**Three misattributions circulating widely — do not repeat:** (a) "58% click decline from
the Penske filing" — the complaint cites 34.5%; 58% is a separate Feb 2026 Ahrefs study;
(b) NMA's "90% of users never leave Google" — unsourced, inconsistent with Pew;
(c) the llms.txt/meta-keywords quote attributed to Illyes on Bluesky (§5.1).

---

## 6. Open / pending

- **DSD indexing by Googlebot** — no empirical test exists publicly (§1.4). Running one
  would be a genuine contribution.
- **Microdata in shadow roots** — no evidence either way (§1.7).
- **AI crawler JS execution** — recheck the Dec 2024 Vercel/MERJ finding periodically;
  it's the single most load-bearing external fact here and it is ~19 months old.

---

## Related

- `docs/domain-hints/prop-read-form.md` — ⚠️ **partially stale**: it records the plain
  `@state` const → `$prop` TDZ as "defect #3, unfixed". Prop bindings were hoisted above
  the plain body in #279, so the TDZ is fixed and the C205 guard now rejects valid code.
  See the C205 entry in `TODOS.md`.
- `docs/plans/2026-07-19-twenty-issue-remediation.md` — the slice plan these findings feed.
</content>
