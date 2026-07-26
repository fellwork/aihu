# Scaffold experience design — minimal vs full, meta, llms.txt, agent cards, DX

**Date:** 2026-07-26
**Status:** Design + first implementation slice (see §8). Founder direction incorporated:
`full` becomes the kitchen-sink template demonstrating the dual (human + agent) experience
via **a word game a human plays and a model can be invited into** — local LLM or BYOK —
and the standalone `agent` template folds into it rather than being deleted.
**Method legend, used throughout:** **[M]** measured (read from source in this worktree at
`origin/main` = `3ac389f5`, cited `file:line`) · **[R]** researched (fetched live from the
web on 2026-07-26, cited by URL) · **[D]** designed (proposed here) · **[A]** assumed
(stated as such, with the verification step named).

---

## 0. Summary

| | |
|---|---|
| **The lineup** | `minimal` = the honest smallest thing (counter, 8 files + README). `full` = the kitchen sink: a co-op word game whose one component is played by a human, an invited model (Ollama/BYOK), and any external MCP agent — **through the same `$action` surface** — folding #601's `server.ts`/`mcp.ts`/`readiness.ts` in. `docs` unchanged this pass. `agent` becomes an alias of `full` (§3.4). |
| **The 10x claim, grounded** | No mainstream scaffold emits llms.txt or agent metadata at all (§1.8 [R]). aihu already emits them — but the static build's documents overclaim (§2.3 [M]). The redesign makes the *dual experience visible on screen* and makes every emitted document honest per build target (§5). |
| **Honesty rule** | A build's discovery documents may only describe what that build serves. Static client build: `elide_agent` strips agent metadata by design (`packages/compiler/src/codegen/emit.rs:206` [M]) → its llms.txt is a *content* document with no tool claims. Server build: documents derive from the live registry (#601's mechanism) and cannot drift. |
| **DX layer** | Every template gets a README with an annotated tree + file→effect table + second-file checklist; the first-run page names the exact file to edit; the orphaned `AGENTS.md` (`packages/cli/src/templates/AGENTS.md` [M], currently emitted by nothing) is fixed and shipped into scaffolds (§6). |
| **Visual language** | No new language invented. Warm-paper neutrals + terracotta(human)/graphite(agent) duality per `.tastemaker/style-lock.md`; game-tile feedback uses the #608 semantic state tokens, whose pairings are machine-verified (`check_contrast.py --pairings` run clean during this pass [M]). Semantic recipe classes (`.btn` …) are **not used** — that layer is designed but unimplemented (§7.3 [M]). |

---

## 1. Phase 1 — what the good scaffolds actually do [R]

Full survey gathered live from GitHub/raw.githubusercontent/framework sites on 2026-07-26
(create-next-app, create-astro, SvelteKit `sv create`, Nuxt, React Router v7/Remix,
create-vite, astro.build/themes). Condensed to what changed this design; each claim
carries its source.

### 1.1 Where the minimal/kitchen-sink line is drawn

- **create-next-app**: 9 minimal template variants in the CLI; the kitchen sink lives
  entirely outside it as `--example` over a 230-entry `examples/` directory
  (api.github.com/repos/vercel/next.js/contents/examples). There is an explicit
  de-branded floor: `app-empty`'s page is literally `<main><div>Hello world!</div></main>`
  (raw.githubusercontent.com/vercel/next.js/canary/packages/create-next-app/templates/app-empty/ts/app/page.tsx).
- **create-astro**: three tiers in one prompt — `minimal` (empty), `basics`
  ("A basic, helpful starter project *(recommended)*"), `blog` (working product with
  content collections, RSS, sitemap, MDX)
  (raw.githubusercontent.com/withastro/astro/main/packages/create-astro/src/actions/template.ts).
  The basics→blog line is exactly where **content + SEO infrastructure** enters
  (`site:`, `integrations: [mdx(), sitemap()]` appear only in blog's astro.config).
- **SvelteKit `sv create`**: templates self-describe via `.meta.json` — `minimal`
  "barebones scaffolding", `demo` "showcase app with a word guessing game that works
  without JavaScript" (sveltejs/cli, `packages/sv/src/create/templates/*/.meta.json`).
  The demo is a *feature tier* demonstrating the framework's thesis, not a deploy variant.
- **Nuxt**: one starter only ("# Nuxt Minimal Starter", nuxt/starter branch v4, 9 files);
  the kitchen sink is delegated to the module ecosystem.
- **React Router v7**: deploy-target variants of one minimal SSR app; repo README says
  "We intend to keep the number of templates in this repository to a minimum". Kitchen
  sink delegated to community stacks (Epic Stack); Remix classic's indie-stack README is
  the canonical kitchen-sink manifest (Docker, SQLite, auth, Prisma, Cypress, Vitest).
- **create-vite**: the control group — 18 templates, all the same single counter screen,
  no tiers, no README in `template-vanilla`.
- **astro.build/themes**: the tier beyond kitchen-sink is a marketplace, not the CLI.

**What this changed here:** the industry line is *minimal = toolchain proof; kitchen-sink
= the framework's thesis made runnable* (Sverdle for progressive enhancement is the gold
standard). aihu's thesis is dual-audience components — so `full` must be a thesis demo,
not "more pages" (today's `full` is minimal + one about page + one layout [M]
`packages/cli/src/index.ts:738-742`).

### 1.2 How scaffolds teach (the devices, ranked by observed effectiveness)

1. **"Edit THIS file" on the first-run page** — universal among the good ones: Next
   "To get started, edit the `page.tsx` file"; Vite "Edit `src/main.js` and save to test
   HMR"; Svelte demo "try editing src/routes/+page.svelte"; Astro "open the `src/pages`
   directory"; Nuxt's welcome card is a self-destruct instruction ("Remove this welcome
   page by replacing `<NuxtWelcome/>` in app.vue with your own code").
2. **Second-file checklist as visible page copy** — Astro blog's index: "Here are a few
   ideas on how to get started with the template:" + 5 concrete file edits
   (raw.githubusercontent.com/withastro/astro/main/examples/blog/src/pages/index.astro).
   The only device in the survey that reliably produces a second edit.
3. **Why-comments at the decision point, in the scaffolded file** — SvelteKit:
   `// since there's no dynamic data here, we can prerender` on the exact
   `export const prerender = true` it explains; Sverdle's "This logic always runs on the
   server, so that people can't cheat by peeking at the JavaScript".
4. **Commented-out stubs as invitations** — SvelteKit `app.d.ts` ships every interface
   commented out with a docs link.
5. **Self-destruct culture** — Astro: "🧑‍🚀 **Seasoned astronaut?** Delete this file.
   Have fun!" and `// Don't want to use any of this? Delete everything in this file… and
   start fresh.`
6. **Deliberate gaps the learner fills** — React Router's address-book tutorial ships
   `export default [] satisfies RouteConfig;` and dead links the tutorial converts.

### 1.3 First-run pages

Mostly logo + docs/Discord links (Next, RR, Astro basics, Nuxt). The exception —
SvelteKit's demo — demonstrates the thesis *as the page*: Sverdle is fully playable with
JavaScript disabled and its About page dares you to try ("Try using it with JavaScript
disabled!"). That dare-not-disclaimer register is the model for aihu's agent surface:
"`curl localhost:5108/llms.txt` — your app is already legible to agents."

### 1.4 Meta/SEO defaults

Baseline is thin everywhere: Next `title: "Create Next App", description: "Generated by
create next app"` + favicon; Vite has **no meta description at all**; RR sets title +
description via its `meta` export; SvelteKit minimal ships a commented permissive
`robots.txt` but no title/description; Nuxt injects charset/viewport as framework
defaults + permissive robots.txt. The full kit exists only in Astro **blog**:
`BaseHead.astro` = title + description + canonical + og:* + twitter:card + sitemap link
+ RSS, with each concern labeled by an HTML comment ("<!-- Open Graph / Facebook -->").

### 1.5 llms.txt / agent metadata

**No mainstream scaffold emits llms.txt or any agent-readable metadata by default** —
verified against the full template trees of all six [R]. What exists: docs-site-level
llms.txt (svelte.dev/llms.txt, nuxt.com/llms.txt), and the opt-in `nuxt-llms` module.
Scaffold-emitted llms.txt + MCP/A2A cards is genuinely unoccupied territory; aihu is
already alone here — the work is making the emission *honest* (§5), not inventing it.

### 1.6 What the survey says aihu's scaffolds lack (ranked by first-hour impact)

1. No "edit THIS file" line on the first-run page (only `docs` has one [M]
   `packages/cli/src/index.ts:560`).
2. No second-file checklist anywhere.
3. Teaching comments live in the *generators*, not the emitted files — e.g. the
   excellent `$shadow`/DA4/derivation explanations at `packages/cli/src/index.ts:319-343`
   are never seen by a user [M].
4. No README in `minimal`/`full`/`docs` (only `agent` has one [M]
   `packages/cli/src/index.ts:727-736` vs `:717`).
5. No meta description / og tags in the emitted `index.html` [M]
   `packages/cli/src/index.ts:263-277` (head = charset, viewport, title only).
6. `AGENTS.md` authoring rules exist but are emitted by nothing [M] — no reference
   anywhere in `packages/cli/src` outside the file itself; and its rule 5 example block
   contradicts its own prose (`$on:click` in the "Correct" sample where the prose and
   every shipped template use `on:click`, e.g. `packages/cli/src/templates-agent.ts:766`).

---

## 2. Current state of aihu's scaffolds [M]

### 2.1 The four built-in templates (`packages/cli/src/index.ts:57`, `scaffoldApp` at `:674-750`)

- **minimal** (default): 8 files — package.json, vite.config.ts, tsconfig.json,
  index.html, src/main.ts, src/pages/index.aihu (counter with a 3-action `$action`
  block), .vscode/{extensions,settings}.json.
- **full**: minimal + `src/layouts/default.aihu` + `src/pages/about.aihu` (`:738-742`).
  The about page is three lines of static prose (`:508-530`) — it demonstrates "the
  router resolves more than one page" and nothing else.
- **docs**: distinct index + a guide page (`:743-747`).
- **agent** (`packages/cli/src/templates-agent.ts`, 1174 lines): the real thesis demo —
  two-process (Bun capability-bridge server :5208 + Vite :5108), a durable
  `<task-list>` driven by human AND external agent, with #601's live registry-derived
  discovery surface (`readiness.ts`), governed gate (404→401→403→429), and MCP-stdio
  entry (`mcp.ts`).

### 2.2 What is real and load-bearing (keep)

- The `$action`-derived agent surface: compiler emits `registerAgentMetadata` from
  `$action` blocks; readiness documents derive from the registry (#601, merged) — the
  advertised surface cannot drift from the callable one.
- Live-served discovery in the agent template: llms.txt, llms-full.txt, robots.txt,
  sitemap.xml, `/.well-known/mcp/server-card.json`, `/.well-known/agent-card.json`
  (+ deprecated `agent.json` alias), `/.well-known/mcp.json`
  (`templates-agent.ts:259-296`).
- The head pipeline: app-level `HeadConfig` applied into built index.html
  (`packages/app/src/head.ts:31-46`, config-overrides-source precedence) and per-route
  `head:` sidecar → `RouteHead { title, description, canonical, og, twitter }`
  (`packages/router/src/router.ts:36-48`).
- Router auto-registration of `src/components/*.aihu`
  (`packages/router/src/vite-plugin.ts:27-28`; used with zero imports by
  `examples/hacker-news/src/pages/item/[id].aihu:58`).
- The e2e harness: scaffold → real `bun install` → typecheck → `vite build`, gated
  behind `AIHU_SCAFFOLD_E2E=1` (`packages/cli/tests/scaffold-default-e2e.test.ts`).

### 2.3 What is broken or dishonest (fix)

1. **The static templates' emitted documents overclaim.** `minimal`/`full`/`docs` wire
   `viteAgentReadinessIntegration` (`packages/cli/src/index.ts:206-226`), which emits
   llms.txt + MCP card as static assets from a **browser-target build where the
   `@aihu/agent` registry is empty** — `elide_agent = target == BuildTarget::Client &&
   is_agent_component` (`packages/compiler/src/codegen/emit.rs:206`) strips
   `registerAgentMetadata` by design. Result: an ~84-byte llms.txt with zero tools,
   while the integration's own `summary` string claims "agent-callable by default"
   (`index.ts:208`) and the page prose claims "These actions are exposed to AI agents
   as MCP tools" (`index.ts:394,435`). The vite.config comment block (`:213-225`) is
   honest — but comments are not the documents agents read.
2. **`full` is not a kitchen sink** — one trivial about page (§2.1).
3. **`agent` overlaps `full`'s mandate** — the founder-agreed direction: fold, don't
   delete. #601's machinery is the fold's payload.
4. **No DX layer** (§1.6 items 1-6).
5. **Off-brand accent in an aihu-shipped component**: `--tl-accent: #2b59ff` — AI-blue —
   at `templates-agent.ts:779`, in the template whose design doc mandates
   "terracotta, never AI-blue" (`.tastemaker/style-lock.md:14` scopes first-party
   surfaces, but a template aihu *ships* is aihu's first impression even if the user
   later reskins it).

### 2.4 Coordination constraints active right now [M]

- **#609 (open)** moves aihu config inline into `vite.config.ts` via
  `declareAihuModule()` / `loadAihuConfig(root)`; touches `packages/cli/src/index.ts`,
  `commands/{build,dev}.ts`, `load-project-config.ts`, and scaffold tests. A live agent
  owns those files. Anything this design lands in `index.ts` must be line-local and
  announced. `aihu add` reads `aihu.config.ts → ui.*` today
  (`packages/cli/src/commands/add.ts:6`); READMEs must not hard-document either config
  location until #609 settles — say "see `aihu add --help`".
- **#606 (merged)**: no fabricated shadowMode; scaffolds emit `css: { shadowMode }` only
  on explicit user choice (`packages/cli/src/create.ts:243-244`).
- **Option-4/daisyUI plan** (`docs/plans/2026-07-26-option-4-daisyui-design.md`):
  semantic recipe classes are Slice 4, **unimplemented** ("There is no `.btn` anywhere
  in the engine", §1.2 G1). Templates may use today: authored `@style`, atomic
  utilities + `@apply` (css-engine opt-in), brand + #608 state tokens, and the 11
  `aihu add` registry recipes (`packages/ui/registry/`).
- **Dark mode**: `.dark`-class works end-to-end; `data-theme` on `<html>` resolves token
  values (Slice 1) but **not** `dark:` utilities (Half B unlanded, option-4 §4.3).
  Templates therefore use `prefers-color-scheme` media queries only — no toggle, no
  flag-day exposure.

---

## 3. The designed lineup [D]

### 3.1 Principles

1. **Minimal proves the toolchain and teaches the authoring model; full demonstrates the
   thesis.** (§1.1's industry line, applied.)
2. **The no-key path is the product.** `full` must be excellent with zero API keys: the
   game is fully human-playable out of the box, and the *agent* story also works
   key-free two ways (an MCP client the user already has, or a local model via Ollama).
   BYOK is the upgrade, never the entry fee.
3. **Every emitted document tells the truth about its own build** (§5).
4. **The scaffold teaches from inside** (§6) — comments in emitted files, README,
   on-page copy; the docs site is the second line, not the first.

### 3.2 `minimal` — the honest smallest thing

Keeps its 8 files and the counter (which earns its place: `@state`/`$action`/template
binding in 40 lines), plus:

```
my-app/
├─ README.md              ← NEW (§6.2)
├─ AGENTS.md              ← NEW — the fixed authoring-rules file (§6.4)
├─ index.html             ← head grows description + og:title/description (§4)
├─ package.json
├─ vite.config.ts         ← honest readiness config (§5.2)
├─ tsconfig.json
├─ .vscode/{extensions,settings}.json
└─ src/
   ├─ main.ts
   └─ pages/index.aihu    ← honest copy + "edit this file" line + second-file checklist
```

Page copy changes (the counter UI is unchanged):
- Under the `<h1>`: `Edit src/pages/index.aihu — save, and this page hot-reloads.`
- "Agent surface" card reworded to the truth for a static build:
  *"These actions are **declared** agent-callable. This static build publishes the
  declaration (llms.txt); serving them as live MCP tools is what the `full` template's
  server does — `npx create-aihu my-app --template full`."*
- A "Next three edits" list (§6.3).

### 3.3 `full` — the kitchen sink: a word game both audiences play

**The game (design judgement, made and justified):** a five-letter word-guessing board
(Wordle-shape), played **co-operatively**: the human types guesses; at any point they
can hand the next guess to an invited model, or an external MCP agent can call the same
action from outside. One board, three players, one `$action` surface.

Why this game and not another:
- **Legible action surface**: exactly two actions — `guess(word)`, `newGame()` — plus
  readable state (board with per-letter feedback, status, guesses left). An agent card
  listing two tools is readable at a glance; a reader can predict what the model will do.
- **A model playing it is genuinely interesting** — constraint reasoning over feedback is
  visible thinking; watching an LLM guess is the demo. (Hangman/anagrams are trivial for
  a model; 20-questions needs a model to exist at all, breaking the no-key rule.)
- **Fun in ten seconds, zero assets**, and the feedback grid is *made* of state
  signaling — the one place the #608 amendment explicitly legalizes non-terracotta hues.
- **Wordlist cost measured, not assumed**: ~470 curated answers ≈ 3 kB of source in
  the user's app, validated 5-letter/no-dupes by script (no `.size-limit.json` row is
  involved — templates are not packages; the budget contract is untouched). Guesses
  accept any five letters, which removes the need for a 60 kB+ dictionary — and the
  relaxation is itself a teaching hook: the emitted comment invites "swap in a real
  dictionary" as a next edit.
- **Precedent, inverted**: SvelteKit's Sverdle uses a word game to prove *progressive
  enhancement*; aihu's proves *dual audience*. Same legibility, different thesis —
  and co-op (not versus) maximizes surface-sharing visibility while removing turn
  enforcement complexity.

**Who plays, and the no-key ladder:**

| Player | Needs | Mechanism |
|---|---|---|
| Human | nothing | the on-screen board |
| External agent | an MCP client the user already has (Claude, Cursor) — no key handled by the app | `mcp.ts` (stdio) / `POST /agent/call` through the governed gate |
| Local model | Ollama running — no key | server-side fetch to `MODEL_BASE_URL` (default `http://localhost:11434/v1`), OpenAI-compatible chat-completions shape |
| Hosted model (BYOK) | a key, in `.env` (gitignored), **server-side only** | same fetch, `MODEL_API_KEY` header; the browser never sees the key |

**Model wiring is template-local, deliberately.** `@aihu/ai` today is server-only stream
adapters with zero hard deps (`packages/ai/src/index.ts:1-13`; SDKs are optional peers,
`packages/ai/package.json:27-43`) — there is **no** BYOK helper and no local-model
support in any package [M]. The template's model player is a ~50-line plain `fetch` in
`server.ts` speaking the OpenAI-compatible wire shape (which Ollama, OpenAI, and the
OpenAI-compat endpoints of Gemini/Anthropic all serve), so it exists honestly today with
no new package surface. If a `@aihu/ai` "byok/local" helper is wanted later, this
template is its extraction source — not its blocker. The model player calls the **same
gate** (`server.callTool('word-duet/guess', …)`) an external agent uses: the model is
just another governed caller, which is the thesis said in architecture.

**Key handling rules (emitted into the scaffold as comments + README):** the key lives
in `.env` (shipped `.gitignore` covers it; `.env.example` documents the three variables);
never in source, never in the browser bundle, never in localStorage. Absent/wrong key →
`GET /model/status` reports `unconfigured`/`unreachable`, the "invite the model" button
renders disabled with the reason, and the game is untouched.

**File tree:**

```
my-app/
├─ README.md                     ← quickstart, tree, file→effect table, recipes (§6.2)
├─ AGENTS.md                     ← authoring rules for AI assistants (§6.4)
├─ package.json                  ← two-process scripts (dev = server + vite)
├─ vite.config.ts                ← proxy /agent, /bridge, discovery paths → :5208
├─ tsconfig.json
├─ index.html                    ← full head kit (§4)
├─ .env.example                  ← MODEL_BASE_URL / MODEL_NAME / MODEL_API_KEY
├─ .gitignore                    ← includes .env
├─ server.ts                     ← governed gate + bridge + model player + readiness
├─ mcp.ts                        ← MCP stdio entry (same registry, same actions)
├─ readiness.ts                  ← llms.txt/cards, derived live (#601 mechanism)
├─ .vscode/{extensions,settings}.json
└─ src/
   ├─ main.ts                    ← mount + capability-bridge client
   ├─ aihu-modules.d.ts
   ├─ components/word-duet.aihu  ← the game: board, $action surface, state tokens
   └─ pages/                     ← (Shape B only — see integration risk below)
      ├─ index.aihu              ← hosts <word-duet> + the player panel
      └─ how-it-works.aihu       ← the agent story + curl dares + second-file list
```

**One stated integration risk [A], with its verification step:** the bridge client takes
the compiler-injected per-instance dispatcher off the mounted element
(`_takeAgentDispatcher`, `templates-agent.ts:637`), proven under the raw
`aihuCompilerPlugin({ target: 'client' })` path. Whether the dispatcher survives the
`viteAihuPlugin` router path (Shape B: pages + layouts + auto-registered components) is
unverified. Verification: scaffold Shape B, `bun install`, run, assert the dispatcher is
non-null. If it fails, `full` ships Shape A (the agent template's proven single-page
architecture, game instead of task-list) and the dispatcher gap is filed as a compiler/
app issue — the game, the gate, the model player, and every document are identical in
both shapes; only the pages/layout demonstration moves to `docs`' shoulders temporarily.
**The implementation slice (§8) ships Shape A for exactly this reason: every part of it
is proven machinery.**

**Visual design [D], inside the locked system:** warm-paper neutrals; terracotta =
human-axis accents (your controls, the brand dot device); graphite = agent/model-axis
(the model panel, agent-surface chips) — the style-lock duality applied, no new hue.
Tile feedback uses the #608 state tokens exactly as amended into the lock
(`.tastemaker/style-lock.md:60-70`): success `#3f6f4f`/`#84b898` = correct spot, warning
`#945f0e`/`#d8a848` = present/wrong spot, neutral `#363c47`/`#636a72` = absent — game
feedback *is* state signaling, the amendment's legal placement. Every pairing used
(`success-fg/success` 5.50, `warning-fg/warning` 5.07, `neutral-fg/neutral` 10.45 light;
7.7-8.3 dark) is already in the lock's verified table — `check_contrast.py --pairings`
re-run clean during this pass; no new pairings are introduced. Dark mode via
`prefers-color-scheme` only (§2.4). The AI-blue `#2b59ff` accent dies in the fold.

### 3.4 `agent` — folded, not deleted

`--template agent` remains accepted and scaffolds `full` with a one-line notice
(`agent is now part of full — scaffolding full`). The generators in
`templates-agent.ts` are the fold's substrate (adapted, not discarded); the catalog
entry moves to a "historical alias" row. Nothing that #601 landed is lost — its
architecture, endpoints, and honesty rationale *are* `full`'s server story.

### 3.5 `docs` — explicitly out of this pass

Gets the shared DX layer (README, AGENTS.md, head kit) when the lineup lands, but its
content redesign is deferred — it competes with `apps/docs-next` for design attention
and neither audience is blocked on it.

---

## 4. Meta / SEO defaults and overrides [D]

**Default `<head>` every template emits** (replacing today's 3-tag head,
`packages/cli/src/index.ts:263-277`) — each block labeled with an HTML comment in the
Astro-BaseHead style, because the comment *is* the documentation of where to override:

```html
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>my-app</title>
  <!-- Search & link previews. Override per-route in a page's @route { head: { … } }
       block, or app-wide via the aihu head config (config wins over this file). -->
  <meta name="description" content="my-app — built with aihu: Web Components a human uses and an agent can drive.">
  <meta property="og:title" content="my-app">
  <meta property="og:description" content="my-app — built with aihu: Web Components a human uses and an agent can drive.">
  <meta property="og:type" content="website">
  <!-- Replace with your own icon: any .svg dropped at public/favicon.svg wins. -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
```

- The description string never claims agent callability — it says "an agent can drive",
  which is true of the framework model, and the template-specific summaries (§5) carry
  the per-build truth.
- `favicon.svg` ships as the terracotta dot on transparent — the same replace-me role
  as `vite.svg`/Astro's favicon, commented as such.
- **Override story, two real hooks, both existing [M]:** app-wide `HeadConfig`
  (title/charset/viewport/meta; config overrides source —
  `packages/app/src/head.ts:19-31`); per-route `@route { head: { title, description,
  canonical, og, twitter } }` sidecar (`packages/router/src/router.ts:36-48`) consumed
  by SSG prerender. `full`'s `how-it-works.aihu` demonstrates the per-route form so the
  override is *shown*, not described.
- **Not emitted, and why:** `robots.txt`/`sitemap.xml` are not static-emitted in `full`
  (the server serves live ones — #601's SPA-fallback lesson at `templates-agent.ts:269-273`:
  an unserved path 200s with index.html, which a reader cannot distinguish from content);
  `minimal` gains a static permissive `robots.txt` (SvelteKit precedent, no honesty
  hazard — robots.txt claims nothing about capabilities). `twitter:*` tags are omitted
  by default (og covers previews; fewer tags to keep honest); the per-route hook
  supports them for users who want them.

---

## 5. llms.txt and agent cards — honest per build target [D]

### 5.1 The rule, restated as a test

For every emitted document D of build B: every capability D names must be servable by B
alone. A grader cannot distinguish a well-formed empty document from a real one — so the
*words* must differ by target, not just the tool count.

### 5.2 Static client build (`minimal`, and `full`'s `vite build` without the server)

`viteAgentReadinessIntegration` stays (it is the only scaffold-emitted llms.txt in the
industry, §1.5) but reconfigured as a **content document that names its own limits**:

```
# my-app

> my-app is a reactive Web Components app built with aihu. This is a static
> client build: pages are readable below; component actions are DECLARED in
> the source (and listed in the source's $action blocks) but this deployment
> serves no live tool endpoint. To make them callable, run the app's server
> build — see "Upgrading" below.

## Pages

- [Home](https://example.com/): interactive counter (human-usable; actions declared agent-callable)

## Upgrading

- [aihu agent guide](https://github.com/fellwork/aihu): serving these declared actions as live MCP tools requires a server process (the `full` template ships one).
```

- summary string in vite.config drops "agent-callable by default" → *"A reactive Web
  Components app built with aihu. Static build — component actions are declared in
  source; no live tool endpoint is served here."*
- `mcpDiscovery`/`endpoint` are **not configured** in the static templates — a card
  advertising an endpoint nothing answers is the exact failure class being fixed. No
  MCP card, no A2A card, from static builds. (The integration already omits the
  `## Components` section when the registry is empty [M]
  `packages/plugin-agent-readiness/src/llms-txt.ts:151-155`; this change makes the
  remaining prose match the reality instead of contradicting it.)

### 5.3 Server build (`full`, `bun run dev` / deployed server)

Documents derive live from the populated registry (#601 mechanism, unchanged). Designed
rendered output for the game surface:

```
# my-app

> An aihu app whose <word-duet> component is played by a human on screen AND
> drivable by agents: an approved call executes against the same live
> on-screen instance over a capability bridge.

## Agent interface

- [Call an action](http://localhost:5108/agent/call): POST application/json
  { "tool": "word-duet/<action>", "params": [...], "jwt": "game:play" }. The
  transport status is always 200; READ THE BODY — { "result": … } or
  { "error", "code" } with 404 (undeclared tool), 401 (no credential),
  403 (missing game:play), 429 (rate-limited).
- [Read live state](http://localhost:5108/agent/state): GET — the board an
  approved guess would act on.
- [MCP server card](http://localhost:5108/.well-known/mcp/server-card.json)
- [A2A agent card](http://localhost:5108/.well-known/agent-card.json)

## Components

### <word-duet>
Co-op word game: guess the five-letter word; feedback per letter.
Actions: guess — Submit a five-letter guess for the current game.
         newGame — Start a new game with a fresh word.
State:   board — Guesses so far with per-letter feedback (correct/present/absent).
         status — 'playing' | 'won' | 'lost'.
         guessesLeft — Remaining guesses (starts at 6).

## Optional

- [MCP over stdio](http://localhost:5108/.well-known/mcp.json): register
  `bun mcp.ts` with your MCP client; /agent/call speaks the aihu call shape,
  not MCP streamable-http.
```

**MCP server card** (registry-derived; designed shape of the rendered JSON):

```json
{
  "name": "my-app",
  "version": "0.1.0",
  "summary": "An aihu app whose <word-duet> component is played by a human on screen and drivable by agents.",
  "transport": { "type": "streamable-http", "endpoint": "http://localhost:5108/agent/call" },
  "tools": [
    { "name": "word-duet/guess",
      "description": "Submit a five-letter guess for the current game.",
      "inputSchema": { "type": "object", "properties": { "params": { "type": "array", "items": { "type": "string" } } } } },
    { "name": "word-duet/newGame",
      "description": "Start a new game with a fresh word." }
  ]
}
```

(The `transport.type` caveat from #601 stands and stays documented in-file: the card
shape cannot express stdio, so llms.txt's Optional section carries the correction —
`templates-agent.ts:316-322` [M].)

**A2A agent card**: `a2aCard: { skills: skillsFromRegistry() }` (never bare
`a2aCard: true`, which emits a skill-less shell — #601's finding,
`templates-agent.ts:330-334` [M]), rendering skills `word-duet/guess`,
`word-duet/newGame` with the same descriptions — two cards, one registry, zero drift.

---

## 6. The DX / teaching layer [D]

The founder's ask — "where to start, what and place things to get intended effects" —
made legible from the scaffold itself, using the surveyed devices (§1.2).

### 6.0 Voice: human and short, or cut

The register is Astro's, whose entire teaching layer in `basics` is two comments and a
headline — *"Wondering what to do next? Check out the Astro documentation"* and *"Don't
want to use any of this? Delete everything in this file, the 'assets', 'components',
and 'layouts' directories, and start fresh."* [R §1.2]. Rules applied to every emitted
comment in this design: one idea per comment; second person; permission over
instruction ("delete this when…" beats "this file contains…"); no comment that restates
what the code line already says; if it reads like it was produced to satisfy a
checklist, it is cut. The long why-explanations stay in the generators for maintainers —
the emitted files get the one line a person actually needs at that spot.

### 6.1 First-run page: name the file, then the second file

Every template's index page carries, in visible copy:
1. `Edit src/pages/index.aihu — save, and this page hot-reloads.` (device 1)
2. A "Next three edits" block (device 2), template-specific — for `full`:
   - *Change how a correct tile looks* → `src/components/word-duet.aihu` `@style`
   - *Add a page at /stats* → create `src/pages/stats.aihu` (or `npx aihu page /stats`)
   - *Add a third action and watch it appear* → add to the `$action` block, then
     `curl localhost:5108/llms.txt` — **the aihu-native second-file device: the edit is
     visible in the agent surface, not just on screen.**
3. The dare, not the disclaimer (Sverdle register): for `full`,
   `curl localhost:5108/llms.txt — your app is already legible to agents.`

### 6.2 README.md per template — the file→effect table is the core

Structure (full's version; minimal's is the subset):

```markdown
# my-app

Built with [aihu](https://github.com/fellwork/aihu) — Web Components that
humans use and agents drive, from one source.

## Run it
bun install && bun run dev        # game on :5108, agent surface proxied from :5208

## Play it three ways
1. You — open http://localhost:5108 and type a guess.
2. A model — copy .env.example to .env (Ollama needs no key), press "model plays next".
3. Any MCP agent — register `bun mcp.ts` with your MCP client, or:
   curl -XPOST localhost:5108/agent/call -H 'content-type: application/json' \
     -d '{"tool":"word-duet/guess","params":["crane"],"userId":"you","jwt":"game:play"}'

## Which file does what
| You want to…                       | Edit                                  |
|------------------------------------|---------------------------------------|
| Change the page                    | src/pages/index.aihu                  |
| Change the game/board/styles       | src/components/word-duet.aihu         |
| Add a page at /foo                 | src/pages/foo.aihu (auto-routed)      |
| Add a component                    | src/components/<name>.aihu (auto-registered) |
| Change what agents may call        | the $action block in word-duet.aihu — llms.txt and both cards follow automatically |
| Gate/rate-limit agent calls        | server.ts (authPlugin / rateLimitPlugin) |
| Wire a model (local or BYOK)       | .env (never commit a key; .gitignore already covers .env) |
| Page <title>/description/og        | @route { head: { … } } in that page   |

## Delete-me path
Seasoned? Delete word-duet.aihu, how-it-works.aihu and this README; keep
server.ts + readiness.ts — they are your agent surface, not demo code.
```

(Config-location row deliberately says nothing about `aihu.config.ts` vs
`vite.config.ts` until #609 settles — §2.4.)

### 6.3 Why-comments move into the emitted files

The generator-only explanations (§1.6 item 3) get user-facing one-line versions at the
decision point in the *emitted* file — e.g. above the `@route` block: `// name must
contain a hyphen — it becomes the custom-element tag this page mounts as`; above
`$action`: `// each entry here is simultaneously a click handler and an agent-callable
tool; the describe: string is what agents read in llms.txt and both cards`.

### 6.4 AGENTS.md — fix it, then actually ship it

`packages/cli/src/templates/AGENTS.md` [M] is shipped by nothing and its rule-5
"Correct" example uses the `$on:click`/`$bind:value` forms its own prose forbids.
Fix the example to `on:click`/`bind:value` (matching every shipped template,
`templates-agent.ts:758-767`), then emit it at every scaffold root. aihu is the only
framework shipping agent-facing authoring rules (§1.5) — currently as dead code.

### 6.5 Rendering modes, explained for someone who has never heard the acronyms

The rendering choice **determines what the app can truthfully claim about itself**
(§5) — so it cannot be a footnote, and it also cannot be a scaffold-time prompt (a
person who doesn't know the acronyms cannot answer it; §1.2's survey shows no good
scaffold asks). The design: **each template has an honest default, and the explanation
lives where the choice lives** — a "How this app is served" section in the README plus
a one-line comment on the config line a user would change:

> **Static (this `minimal` app):** `vite build` turns your pages into plain files any
> static host can serve. Cheapest, fastest, nothing to operate. Agents can *read* your
> pages; nothing is *callable* — which is why this build's llms.txt says exactly that.
>
> **Static + a small server (the `full` app):** your pages are still static files, and
> a little Bun server runs beside them answering agent calls against the live page.
> This is the mode where "agents can drive it" is true, so its llms.txt says *that*.
>
> **Server-rendered (SSR):** pages are produced per-request by `@aihu/server`. You need
> it when page *content* must be computed at request time. Not what this template does.

Switching cost stated plainly in the same section: static→full is "add the server
files — the `full` template is the worked example"; nothing silently changes claims,
because the documents are derived per §5. The honest default for someone who does not
know is the one each template already embodies; the section's job is to tell them which
one they are standing in.

### 6.6 Hosting: as far as honesty allows, no further

What exists today [M]: `@aihu/adapter-cloudflare` and `@aihu/adapter-vercel` packages;
the cf-team npm template ships working deploy wiring — `wrangler.toml.tmpl`,
`.github/workflows/deploy.yml.tmpl` (checkout → bun install → build →
`cloudflare/wrangler-action@v3` with `secrets.CLOUDFLARE_API_TOKEN` +
`secrets.CLOUDFLARE_ACCOUNT_ID`) (`packages/templates/cf-team/template/…` [M]).

Designed scaffold behavior:
- **README "Deploy" section in every template**, ordered and honest about the human
  steps: static templates → "any static host (`vite build`, upload `dist/`)"; `full` →
  "the page deploys anywhere static; the agent server needs a Bun-capable host (or the
  Cloudflare adapter) — and until it is deployed, your public llms.txt must not claim
  callable tools" (the §5 rule surfacing as deploy guidance).
- **Human steps named, never implied away**: create the account; `wrangler login` (or
  an API token); put `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` in repo secrets;
  first deploy from CI happens on the next push. Four steps, listed as four steps.
- **Slice 2+ (not this PR):** lift cf-team's `wrangler.toml.tmpl`/`deploy.yml.tmpl`
  shape into an opt-in `--deploy cf` for the built-ins. Not landed now because the
  built-ins are single-package (cf-team's tmpl paths assume its monorepo layout) and
  the adapter wiring deserves its own exercised-not-claimed pass.

### 6.7 Agent tooling: batteries included, uniformly, with one honest opt-out

**The gap [M]:** built-in templates emit only `.vscode/{extensions,settings}.json` —
no `AGENTS.md`, no `CLAUDE.md`, no `.mcp.json`. The batteries exist on the path almost
nobody takes: cf-team ships `.mcp.json` + `AGENTS.md`
(`packages/templates/cf-team/template/`), and `aihu mcp serve` is a real command
(`packages/cli/src/bin.ts:278-282`) starting `@aihu/mcp`'s stdio server with two real
tools: `aihu_example` (canonical cookbook lookup) and `aihu_validate` (compile-check an
`.aihu` source) (`packages/mcp/src/index.ts:24,46`). The bar is create-astro, which
generates `AGENTS.md` + a `CLAUDE.md` symlink at scaffold time, on by default,
uniformly [R] — and ships no runtime discovery at all, which is aihu's territory.

**File conventions verified against primary sources [R]** (agents.md; Claude Code
memory + MCP docs; cursor.com/docs/context/rules; antigravity.google docs/changelog;
Codex agent-configuration docs; GitHub Copilot custom-instructions docs; create-astro
source — full citations in the research record):
- `AGENTS.md` is the converged standard, read natively by Codex (its originator),
  Cursor, GitHub Copilot, Google Antigravity (alongside GEMINI.md), Jules, Gemini CLI,
  Zed, Devin, Amp, Windsurf, and more. Nearest-file-wins nesting; Codex caps at 32 KiB.
- Claude Code reads `CLAUDE.md`, **not** AGENTS.md — and Anthropic's own docs recommend
  a one-line `CLAUDE.md` containing the `@AGENTS.md` import. The import beats
  create-astro's symlink (Windows-safe; create-astro itself falls back to a hard link
  and silently skips when both fail).
- Root `.mcp.json` (`{"mcpServers": {name: {command, args}}}`) is Claude Code's
  project-scope registration; Cursor uses the same schema at `.cursor/mcp.json`;
  VS Code uses an incompatible `servers`-keyed `.vscode/mcp.json`.

**Designed layer, emitted by every built-in template:**
- `AGENTS.md` — the existing 5-rules file with its rule-5 example fixed (§6.4), plus a
  short, *per-template-true* "Commands" block (dev/build/typecheck as that template's
  package.json actually defines them) and a five-line project map.
- `CLAUDE.md` — one line: the `@AGENTS.md` import (rationale above).
- `.mcp.json` — registers the aihu MCP server as `npx aihu mcp serve` (**not** cf-team's
  bare `aihu`, which resolves only when globally installed; the scaffold's CLI is a
  devDependency, so it must go through the package runner — a cf-team bug this pass
  records). The README notes `cp .mcp.json .cursor/mcp.json` for Cursor (same schema).
- `.vscode/` — unchanged (extensions.json already recommends `fellwork.vscode-aihu`,
  which fronts `@aihu/language-server`).
- Nothing else until evidence demands it: `.cursor/rules/*.mdc`,
  `.github/copilot-instructions.md`, GEMINI.md are all *covered by* AGENTS.md support
  in their tools; every extra file is another thing to keep true.

**The repo-level half — the aihu Skill (daisyUI's shipped pattern, studied [R]):**
`saadeghi/daisyui` ships `.claude-plugin/plugin.json` (+ marketplace.json declaring a
free skill and a paid MCP surface), `skills/daisyui/SKILL.md` with reference dirs, and
mirrored `.codex-plugin/`/`.cursor-plugin/`/`.grok-plugin/` manifests — a working model
of library-level agent tooling. Two artifacts, two owners, both needed because aihu is
*both a library and a scaffolder*:
1. **In the aihu repo** (Slice 2, designed here, not landed): `skills/aihu/SKILL.md` +
   `.claude-plugin/{plugin,marketplace}.json` (+ per-agent mirrors as adoption
   warrants) teaching **current `.aihu` grammar**. This is not collateral: `.aihu`
   syntax is novel, and an unskilled agent reliably produces hard compile errors —
   `$on.click`, v1 statement macros, `@scribe/*` imports (C606/C607; the exact
   mistakes AGENTS.md enumerates). daisyUI's skill makes agents pick better class
   names; aihu's makes the language *writable at all* from inside the user's editor.
   Its trigger posture: fire on `.aihu` file edits — honest scope, not daisyUI's
   "TRIGGER on any HTML even if the user does not ask" aggression.
2. **In every scaffolded project** (`--no-agent-tooling` governs only this half): the
   AGENTS.md/CLAUDE.md/.mcp.json above — *this project's* context (its commands, its
   map, its MCP validation loop), which a marketplace skill can never carry.

**The opt-out — `--no-agent-tooling` (founder-settled name).** Two different "AI"
surfaces exist in an aihu scaffold and the flag must not conflate them: (1) *developer
tooling* — the files above, which help a coding assistant work **on** the codebase, and
which a user may legitimately not want; (2) *the runtime agent surface* — `$action`,
llms.txt, the cards, the bridge — which is the product thesis, and which the flag
**never touches** (removing it is not a cleaner scaffold, it is a worse framework).
`--no-agent-tooling` removes (1) only; help text carries the distinction in one line:
`--no-agent-tooling   Skip AGENTS.md/CLAUDE.md/.mcp.json (coding-assistant files). Your app's own agent surface is unaffected.`
Astro's `--no-ai` name is rejected precisely because in aihu it would read as (2).

**Uniform across templates, deliberately** (Astro's position, adopted): the developer's
editor does not care which tier was scaffolded; a `minimal` user's agent needs the
signal-mutation rules exactly as much as a `full` user's. Uniformity also makes the
answer to the founder's real question — *"does the agent immediately know how to work
in this codebase?"* — template-independent: rules (AGENTS.md) + validation + canonical
examples (MCP tools) + language server (.vscode), on every scaffold, honestly
described, with one flag to decline.

### 6.8 Safe-to-delete, in the files and the README

Every demo artifact names its own exit (§6.0 voice): the game component's header
comment — *"This is the demo. When you start your real app: delete this file and
src/pages/how-it-works.aihu, point src/pages/index.aihu at your own component — and
keep server.ts + readiness.ts, which are your agent surface, not demo code."* — and the
README's "Delete-me path" section (§6.2) says the same thing in the same words. The
keep/delete line is the important design act: demo (game, how-it-works page, wordlist)
vs infrastructure (server, readiness, mcp, tooling files) — a newcomer's second act is
deletion, and getting it wrong should be hard.

### 6.9 Catalog legibility

Prompt lines gain thesis + recommendation (create-astro/sv pattern, §1.2):
```
1) minimal  — smallest runnable aihu app; the counter teaches @state/$action  (recommended)
2) full     — the dual-experience demo: a word game you, a model, and any MCP agent play
3) docs     — docs-site starter
```
(`agent` leaves the picker; the flag stays as the §3.4 alias.)

---

## 7. What a template may use today vs what it must wait for [M]

| Capability | Today | Waits on |
|---|---|---|
| Authored `@style`, tokens as plain CSS values | ✅ | — |
| Atomic utilities / `@apply` | ✅ with `--css engine` | — |
| #608 state tokens as values | ✅ (values inlined; the css-engine token *names* need option-4 Slice 3) | — |
| Semantic classes (`.btn`, `.card`) | ❌ — no recipe channel exists (option-4 §1.2 G1) | option-4 Slice 4 |
| `aihu add` registry components | ✅ (11 recipes) but requires `aihu.config.ts` | #609 for the config-file story |
| Dark via `.dark` / media query | ✅ | — |
| Dark via `data-theme` switcher | ❌ utilities don't resolve (Half B) | option-4 Slice 6 |
| Static agent metadata in client builds | ❌ by design (`emit.rs:206`) | never — the server target is the answer, not a compiler change |
| Per-route `head:` sidecar | ✅ (`router.ts:36`) | — |

---

## 8. Ordered implementation plan

**Slice 1 — this PR (chosen because every part is proven machinery, none of it waits on
the recipe layer, the compiler, or #609):**
1. This design document.
1b. **The agent-tooling layer (§6.7)**: `templates-tooling.ts` (new file) emitting
   `AGENTS.md` (fixed) + `CLAUDE.md` + `.mcp.json` uniformly; `--no-agent-tooling` in
   `create.ts`; the `.mcp.json` command exercised, not assumed.
2. **`full` v2 = the word game on the agent template's proven architecture** (Shape A:
   raw client-target compiler, two processes, single game page): new
   `packages/cli/src/templates-full.ts` (new file — near-zero conflict surface),
   containing the `<word-duet>` component, the governed `server.ts` (+ model player +
   `/model/*` endpoints), `mcp.ts`, `readiness.ts` with the §5.3 surface, `.env.example`,
   `.gitignore`, README (§6.2), fixed AGENTS.md, §4 head kit.
3. `scaffoldApp` routes `full` → the new generator set and `agent` → the §3.4 alias
   (line-local edits in `index.ts`, announced for #609 reconciliation).
4. Honesty edits to the static templates' three overclaiming strings
   (`index.ts:208`, `:394`, `:435`) + drop `mcpDiscovery`/`endpoint` from the static
   readiness config (§5.2).
5. Tests: generator unit tests (house pattern) + e2e via the existing
   `AIHU_SCAFFOLD_E2E` harness; model player exercised against a mock
   OpenAI-compatible endpoint (no key exists in CI, and none is needed — by design).

**Slice 2 — the repo-level aihu Skill** (§6.7): `skills/aihu/SKILL.md` + plugin
manifests teaching current `.aihu` grammar, sourced from AGENTS.md's rules + the docs
guides, exercised against `aihu_validate` before shipping. Also: Shape B verification
(§3.3 risk) — probe the dispatcher under `viteAihuPlugin`; if it survives, move `full`
onto pages+layouts+components; if not, file the gap. Sequenced after #609 to avoid
`index.ts` churn.

**Slice 3 — DX layer for `minimal`/`docs`**: README + AGENTS.md + head kit + first-run
copy (§3.2, §6) — after #609 lands, because both READMEs and `vite.config.ts` strings
are in its blast radius.

**Slice 4 — catalog copy** (§6.5) in `templates-registry.ts`/`create.ts` prompts.

**Slice 5+ (blocked, tracked):** semantic-class usage in templates (option-4 Slice 4);
`data-theme` toggle (option-4 Slice 6); `aihu add` in READMEs (#609); a possible
`@aihu/ai` local/BYOK helper extracted from the template's model player (decision
deferred until the template proves the shape).

---

## 9. Verification record for this pass

- `check_contrast.py --pairings`: **run, clean** — "All claimed pairings hold" (light +
  dark, incl. the #608 state trio). No new pairings introduced by the game design.
- Framework survey: fetched live 2026-07-26 (sub-agent + direct fetches; URLs inline in
  §1). A second sub-agent assigned to the repo landscape stalled and returned nothing;
  every repo claim in this document was therefore verified first-hand and cited [M].
- Slice-1 implementation verification is recorded in the PR (what was exercised: unit
  tests; scaffold + install + typecheck + build; live server curl transcript; mock-model
  e2e; screenshots light/dark/desktop/360px — and anything *not* exercised is listed
  there, not implied).
