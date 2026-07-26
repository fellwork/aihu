# Finding working aihu code — cookbook and examples

Never invent a pattern that already exists. The repo ships two corpora, both
CI-compiled:

- **`cookbook/`** — 21 single-concept recipes. Every recipe compiles in CI
  (`bun run test:cookbook`) and carries machine-readable frontmatter with
  anti-patterns. This is the fluency corpus; match its style.
- **`examples/`** — 26 runnable apps, including the 9 "governed" examples that
  are the live proof for each subsystem.

Three ways in, best first:

1. `aihu_example` MCP tool — pass a natural-language `intent`; returns the
   best-matching recipe source.
2. This index (below) → read the file directly.
3. `llms-cookbook.txt` at the repo root — the whole cookbook in one file for
   agents with no repo access (linked from `llms.txt`).

## Task index — cookbook recipes

| I need… | Recipe |
|---|---|
| minimal counter / prop + actions | `cookbook/aihu-counter.aihu` |
| modal / dialog (Escape, backdrop, aria) | `cookbook/aihu-modal.aihu` |
| tabs / segmented panels | `cookbook/aihu-tabs.aihu` |
| accordion / expand-collapse | `cookbook/aihu-accordion.aihu` |
| toast / auto-dismiss notification | `cookbook/aihu-toast.aihu` |
| clock / interval + cleanup lifecycle | `cookbook/aihu-clock.aihu` |
| form validation (form-associated element) | `cookbook/form-validation.aihu` |
| accessible form (aria(), form()) | `cookbook/aria-form.aihu` |
| async fetch with loading/error states | `cookbook/fetch-resource.aihu` |
| debounced search input | `cookbook/search-debounce.aihu` |
| sortable data table | `cookbook/data-table.aihu` |
| infinite scroll (IntersectionObserver) | `cookbook/infinite-scroll.aihu` |
| observer / third-party host lifecycle | `cookbook/aihu-controller.aihu` |
| share state down the tree (context) | `cookbook/context-provider.aihu` + `context-consumer.aihu` |
| theme toggle / dark mode | `cookbook/theme-toggle.aihu` |
| localStorage persistence | `cookbook/theme-toggle.aihu` |
| agent-drivable component (expose/describe) | `cookbook/agent-weather.aihu` |
| permission-gated UI | `cookbook/guard-ui.aihu` |
| SSR-safe hydration from dataset | `cookbook/ssr-hydration.aihu` |
| Tailwind utilities + scoped @style | `cookbook/tailwind-style.aihu` |
| composables (@aihu/use, getter reads) | `cookbook/use-mouse.aihu` |

Read the frontmatter `anti-patterns:` list of any recipe you use — the don'ts
are as load-bearing as the source.

## Task index — example apps

The governed set (live CI proof per subsystem):

| Subsystem | Example |
|---|---|
| core reactivity + template grammar | `examples/todo-mvc` |
| SSR meta-framework, loaders, dynamic routes | `examples/hacker-news` |
| router / layouts / navigation | `examples/layouts` |
| data + app-state platform, context, auth | `examples/storefront` |
| streaming / realtime / websockets | `examples/realtime-scores` |
| styling system / css-engine utilities | `examples/css-engine-utility` |
| agent surface + governance | `examples/agent-driven-demo` |
| SSG / static output + SEO head | `examples/ssg-site` |
| agent protocols (A2A + ACP) | `examples/agent-hub` |

Others worth knowing: `examples/blog-router` (routing basics),
`examples/currency-converter` and `examples/temperature-converter` (two-way
binding), `examples/weather-card`, `examples/timer`, `examples/live-counter`,
`examples/agent-durable-room` (Durable Object state), `examples/cf-adapter`
(Cloudflare deploy), `examples/css-pluggability` (BYO Tailwind/UnoCSS).

## Coverage honesty

`cookbook/COVERAGE-MATRIX.md` is the authoritative construct-by-construct map of
what is live, what is documented, and what has zero coverage. If a construct is
marked ⛔ there (`stream()`, `event()`/`$emit`, `@aihu/store`, `<suspense>`,
`memo`/`once`/`raw`, `beforeNavigate`), prefer a covered alternative or verify
extra carefully with `aihu_validate` — you are off the corpus.
