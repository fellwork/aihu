# state · cli-templates

**Track:** `cli-templates` · **Mode:** 2 (build/refactor, L-scope)
**Opened:** 2026-05-05 · **Director round:** 001
**Active milestone:** v0.2.0 (single end-to-end happy path)

---

## §1 Track thesis

Build a `create-aihu`-class CLI template system on top of the existing
`@aihu/cli` (`aihu app`, `create-aihu`) so that `bunx create-aihu@latest <name>`
produces a project that **compiles cleanly post-scaffold**
(`bun install && bun run build` exits 0; no type errors; no missing deps),
matches the **SOTA-on-par-or-better bar** of competitor CLIs
(`create-next-app`, `create-svelte`, `create-vue`, `create-vite`,
`create-remix`, `create-astro`, `create-t3-app`, `nuxi init`,
`bunx create-solid`) on every option dimension we offer, and
**makes Aihu the only mainstream framework for which agent-protocol features
(A2A / ACP / MCP) are first-class scaffolding choices, not opt-in afterthoughts.**

Success in v0.2.0 = one end-to-end happy path that proves the contract
(prompt flow → option matrix → file emission → install → build green →
agent-host MCP server registered in `.mcp.json`) on Cloudflare Workers
deploy target, with zero runtime deps in the generated app and the
existing `@aihu/cli` zero-dep contract preserved.

This serves Directive 0 — *"agentic discovery and interaction, for human
purpose"* — by collapsing the gap between "I scaffolded a project" and
"my project is discoverable by agents" to one prompt answer.

---

## §2 Option dimension inventory (the matrix)

For each dimension: **choices** offered, **default**, **compatibility
constraints**, and **sources** (existing `@aihu/*` packages, packages
to add, deferred items). Dimensions 9–11 are added by the Director on
top of the user's eight; competitors all prompt for #10–11 already.

### D1 · CSS

| Choice | Status | Notes |
|---|---|---|
| **Vanilla SFC `@style` block** (default) | shipped | Native to `.aihu` SFC; `$reactive`, `$tokens`, `$global`, `$media`, `$when` macros + arch-5 `$container`, `$prefers` (M2). No external dep. **This is the differentiator** — every competitor punts to a CSS framework; Aihu has scoped CSS first-class. |
| Tailwind 4 | M2 | Vite plugin; `@tailwindcss/vite`. Document interaction with `@style` block (Tailwind utility classes used inline, scoped CSS for component-specific). |
| Panda CSS | deferred v0.3 | Type-safe build-time CSS. |
| UnoCSS | deferred v0.3 | Atomic, on-demand. |
| Open Props | deferred v0.3 | Just CSS custom properties. |

**Compatibility:** Tailwind 4 is Vite-only (the v4 architecture). If
local-dev choice is "Bun-only / no Vite" (D4), Tailwind option is
disabled. Vanilla `@style` works under both.

### D2 · Security/Auth

| Choice | Status | Notes |
|---|---|---|
| **None** (default) | shipped | `<$guard>` UI boundary already ships (arch-5 §2.4); fallback renders correctly with no plugin. Zero-friction default. |
| `@aihu/auth` | M2 (gated on RFC #56 RATIFY) | Per arch-3 §2.4 — STRONGEST FIT. JWT, `$user`, `<$guard>` enforcement, `<$signin>`/`<$signout>`. Dep-free except for jose at app level. |
| Clerk (third-party adapter) | deferred v0.3 | Document + scaffold env vars; user wires SDK. |
| Lucia (third-party adapter) | deferred v0.3 | Server-side session lib. |
| better-auth (third-party adapter) | deferred v0.3 | Newer entrant; track adoption. |

**Compatibility:** `@aihu/auth` requires live-binding RATIFY. Until then,
"None" is the only option that works without stub-glue. Defer `@aihu/auth`
out of v0.2.0 if RFC #56 hasn't ratified by the Architect's read.

### D3 · Data/schemas

| Choice | Status | Notes |
|---|---|---|
| **None / in-memory** (default) | shipped | `$resource` + signals work without any backing store. Beats "must pick an ORM" friction every other CLI imposes. |
| `@aihu/magna` (GraphQL bridge) | M2 (skeleton M1) | Per arch-3 §2.6 — backbone for auth, search, commerce, seo. Build-time SDL codegen via `magna-gqlmin`. |
| Drizzle ORM | M3 | Type-safe SQL builder, edge-compatible. Decouples from magna for users who want raw SQL. |
| Prisma | deferred v0.3 | Heavier; cold-start cost on edge. Behind a flag. |
| `@aihu/data` runtime (existing) | shipped | The `$resource` macro lowering — already in core. Always available. |

### D4 · Local dev server

| Choice | Status | Notes |
|---|---|---|
| **Vite** (default) | shipped | `aihu dev` already detects + spawns Vite via dynamic `import()`. Existing path. |
| Rolldown-watch | shipped | Existing scaffold uses `rolldown -c --watch` directly; no Vite layer. Simpler for non-SSR apps. |
| Bun-only (no bundler) | deferred v0.3 | Bun's own bundler + dev server. Niche today; revisit when bun.serve coverage is strong. |

### D5 · Linting

| Choice | Status | Notes |
|---|---|---|
| **Biome** (default) | shipped | Already used framework-internally; SOTA per `create-next-app` 2026 prompt set (Biome is now an option there). |
| ESLint + Prettier | M3 | Two-config combo; legacy compatibility. |
| None | shipped | Zero-config option for tiny apps. |

### D6 · Git pipelines / CI

| Choice | Status | Notes |
|---|---|---|
| **GitHub Actions** (default) | shipped | Aihu's own CI is GH Actions; templates emit a known-good `ci.yml` that runs `bun install && bun run build && bun run test`. |
| None | shipped | Skip CI entirely. |
| GitLab CI | M3 | Mirror of the GH Actions YAML. |
| Inferred from Vercel/CF Pages | deferred v0.3 | Platform infers; no explicit CI file. |

### D7 · Repo management

| Choice | Status | Notes |
|---|---|---|
| **Single-package** (default) | shipped | One `package.json` at root; simplest path. |
| Bun workspaces monorepo | M2 | `apps/web` + `packages/*` shape; mirrors Aihu's own repo layout. |
| Turborepo | deferred v0.3 | Adds turbo.json + remote caching config. |
| nx | deferred v0.4+ | Heavier; not on adoption signal yet. |

### D8 · Deployment platform

| Choice | Status | Notes |
|---|---|---|
| **Cloudflare Workers** (default) | shipped | `@aihu/adapter-cloudflare` package exists. Wrangler.toml + worker entry. Edge-first matches Aihu's runtime story. |
| Vercel | M2 | `@aihu/adapter-vercel` package exists. `vercel.json` + edge function shape. |
| Fly.io | M3 | Container-based; emit Dockerfile + fly.toml. |
| Railway | deferred v0.3 | Similar to Fly; deferred until adoption signal. |
| "I'll wire this myself" / static | shipped | Just emit `dist/`. No platform metadata. |

### D9 · 🆕 Agent surface (added by Director)

| Choice | Status | Notes |
|---|---|---|
| **Minimal** (default) | shipped | Emits `.mcp.json` (already in arch-4 §6.6) + a single-`@expose`-block example. Discoverable by Cursor / Claude Desktop / VS Code MCP without configuration. |
| Full (A2A + ACP + MCP) | M3 | Adds `@aihu/agent-acp` + `@aihu/agent-a2a` adapters wired in a server route, plus an example `@agent` block with `$scope` and `$rate-limit`. Gates on live-binding RATIFY (arch-3 §3) for `$scope`/`$rate-limit` enforcement. |
| None / opt-out | shipped | No `.mcp.json`, no `@aihu/agent` import. For users who explicitly do not want the agent surface. |

**Why this dimension is non-negotiable:** Every competitor (Next, Svelte,
Vue, Astro, Remix, T3) prompts for *zero* agent-protocol features. Aihu's
existing infra (`@aihu/agent-host`, `.mcp.json` convention, AgentManifest
registry) means we can default-on a real, working agent surface in M1
with no extra packages. **This is the headline differentiator and must
not be deferred.**

### D10 · 🆕 Test runner (added by Director — every competitor prompts)

| Choice | Status | Notes |
|---|---|---|
| **Vitest** (default) | shipped | Already used framework-internally. Pairs with Vite local-dev cleanly. |
| Bun test | shipped | If user picked Bun-only local dev; native `bun test` runner. |
| Playwright (E2E) | M2 | Optional add-on alongside unit runner; matches `create-svelte` 2026 prompt. |
| None | shipped | Skip tests. |

### D11 · 🆕 Component library starter (added by Director — controls what the user sees first)

| Choice | Status | Notes |
|---|---|---|
| **`<live-counter>` example** (default) | shipped | The repo's polished EX-01 example — proves SFC + signals + `@agent` exposure end-to-end in <50 lines. Perfect first-touch artifact. |
| Empty (just `index.aihu` + `<h1>Hello</h1>`) | shipped | Zero noise; hand-roll from there. |
| Full landing page | M3 | Hero + features + footer + theme toggle; pulls arch-5 a11y primitives + `<$theme>`. Ships as a "marketing site" template at `bunx create-aihu --template landing`. |

---

## §3 Phasing recommendation

The full matrix is **11 dimensions × ~3.4 avg choices = ~37
permutations**. Trying to validate all of them in v0.2.0 would trigger
the 5-iteration hard-stop within one Architect → Builder cycle.

### v0.2.0 (M1) — One end-to-end happy path

**Locked choices** (no prompt; or prompt with one safe default):

| Dim | M1 choice |
|---|---|
| D1 CSS | Vanilla `@style` |
| D2 Auth | None |
| D3 Data | None / in-memory |
| D4 Local dev | Vite |
| D5 Lint | Biome |
| D6 CI | GitHub Actions |
| D7 Repo | Single-package |
| D8 Deploy | Cloudflare Workers |
| D9 Agent | Minimal (`.mcp.json` + `@expose` example) |
| D10 Test | Vitest |
| D11 Starter | `<live-counter>` example |

**Why these specifically:** every choice is a package or workflow that
**already ships in the Aihu monorepo today**. No new dependency to
publish. No RFC gate. The Architect can write `arch-6-cli-templates.md`
and Builder can land it without any external block.

**The prompt UX in v0.2.0** is intentionally narrow: project name → use
recommended defaults? (Y/n) → if N, override 4 choices (CSS, Deploy,
Agent surface, Starter); D4/D5/D6/D7/D10 stay locked. This mirrors
`create-next-app`'s 2026 "Yes, use recommended defaults" / "No,
customize" toggle — proven UX for cutting prompt fatigue.

### v0.2.1 (M2) — Plugin breadth

Add (gated on packages shipping in arch-3 M2):
- D1: Tailwind 4
- D2: `@aihu/auth` (post RFC #56 RATIFY)
- D3: `@aihu/magna`
- D7: Bun workspaces monorepo
- D8: Vercel
- D10: Playwright E2E add-on

### v0.2.2 (M3) — Long-tail and full agent surface

Add:
- D2: Clerk / Lucia / better-auth third-party adapters
- D3: Drizzle
- D5: ESLint + Prettier
- D6: GitLab CI
- D8: Fly.io
- D9: Full A2A + ACP + MCP agent surface (post live-binding RATIFY)
- D11: Full landing page starter

### v0.3.0 — Generators + ejectability

- `aihu generate component|page|agent|plugin|composable` with template
  parametrization (already drafted in arch-4 §3 as `aihu generate <kind>`).
- Post-scaffold codemods: `aihu add @aihu/auth` rewrites
  `aihu.config.ts` to register the plugin (drafted in arch-4 §3).
- "Ejectable templates" philosophy: templates are not vendored into
  `@aihu/cli`; they live in a sibling `packages/create-aihu-templates/`
  package or in a separate `@aihu/templates-*` family. See §6 R-CT-04.

---

## §4 SOTA-on-par-or-better acceptance bar

For each dimension, the LEFT column is the SOTA option that competitor
CLIs prompt for; the RIGHT column is Aihu's v0.2.0 equivalent (or the
deferral with justification).

| SOTA / competitor | Aihu v0.2.0 |
|---|---|
| TypeScript on by default (`create-next-app`, `create-svelte`, T3) | ✅ TypeScript on; `tsconfig.json` pre-wired |
| Tailwind 4 (Next, Astro 5.2+, T3) | ⏸ deferred v0.2.1 — vanilla `@style` is the differentiator default; Tailwind add later |
| Biome OR ESLint (Next 2026 prompts both) | ✅ Biome on by default |
| App Router / file-based routing (Next, SvelteKit) | ✅ `@aihu/router` + virtual module already shipped |
| Edge-first deploy adapter (Next/Vercel, Astro/Vercel-CF, Remix/CF) | ✅ Cloudflare Workers via `@aihu/adapter-cloudflare` default |
| Test runner (Vitest in svelte/vue/astro; Bun test) | ✅ Vitest default |
| Playwright add-on (svelte/vue) | ⏸ deferred v0.2.1 — unit runner first |
| ORM choice (T3: Drizzle/Prisma) | ⏸ deferred v0.2.1+ — no in-memory equivalent in T3 means our default is *narrower friction* than T3's |
| Auth (T3: NextAuth) | ⏸ deferred v0.2.1 — gated on RFC #56 |
| `AGENTS.md` for AI assistants (Next 2026 default) | ✅ ship `.mcp.json` (deeper than `AGENTS.md` — actually wires Cursor/Claude Desktop) AND ship `AGENTS.md` if user opted into "minimal agent" |
| `--no-interactive` / preset flags (every CLI) | ✅ `bunx create-aihu name --template <T> --options <opts.json>` (see §5) |
| Package manager auto-detect (every CLI) | ✅ already in `create.ts` (bun > pnpm > yarn > npm) |
| Git init (every CLI) | ✅ already in `create.ts` |
| Monorepo template (T3-Turbo, Vite) | ⏸ deferred v0.2.1 |

**Substantively, on the dimensions we ship in v0.2.0, we are SOTA-on-par
with every named competitor.** The four deferred items (Tailwind, ORM,
Auth, Playwright) all have credible defaults (vanilla `@style`,
in-memory, none, Vitest) that don't leave the user stuck — a v0.2.0
scaffold can ship a real Aihu app to Cloudflare Workers without any of
the deferred features.

**The differentiator on top:** D9 (Agent surface). No competitor offers
this. v0.2.0 has it.

---

## §5 Compile-after-scaffold acceptance test

The brief said: *"they need to compile after scaffolding."* Define the
runnable check the Architect must adopt as the v0.2.0 acceptance gate.

```bash
# scripts/test-cli-templates.sh — runs in CI on every PR touching
# packages/cli/** or packages/create-aihu-templates/**

set -euo pipefail
TMP=$(mktemp -d)
cd "$TMP"

for opts in "$@"; do
  name="test-$(echo "$opts" | sha256sum | head -c 8)"
  bunx --bun "@aihu/cli@workspace:*" app "$name" \
    --options-json "$opts" --no-interactive
  cd "$name"
  bun install --frozen-lockfile
  bun run build      # must exit 0
  bun run typecheck  # must exit 0
  bun run test       # must exit 0 (Vitest, even if zero tests — runner exits 0)
  cd ..
  rm -rf "$name"
  echo "PASS: $opts"
done
```

The Architect provides the `opts` JSON fixtures. For v0.2.0 the matrix
collapses to **3 prompted dimensions × 3 starter choices × 3 agent-surface
choices = 27 combinations** — but with the five locked dimensions, many
are redundant. The minimal sufficient set the Architect must ship as
fixtures:

1. **default-everything** — all defaults (most-trodden path)
2. **opt-out-agent** — D9 = none (verifies clean removal)
3. **vanilla-css-empty-starter** — D11 = empty (verifies starter swap)
4. **deploy-static** — D8 = "I'll wire this myself" (verifies no
   wrangler.toml emitted)
5. **no-tests** — D10 = none (verifies test scaffolding is removable)

That's **5 named fixtures, ~15 sec each in CI, total <90s**. Recommend
running ALL 5 on every PR; do not sample. The whole point is "compile
after scaffold" is a hard contract.

---

## §6 Risks

| ID | Risk | Severity | Mitigation |
|---|---|---|---|
| R-CT-01 | Cross-platform shell scripting in postinstall (Windows vs POSIX) | MEDIUM | Existing `@aihu/cli` is zero-dep Node; templates emit no shell scripts. Any cross-platform helper (`bun install` post-scaffold) goes through `spawnSync` with `shell: false`, mirroring `create.ts`. CI matrix covers ubuntu + macos + windows. |
| R-CT-02 | Lock-in to Tailwind 4 (when added in v0.2.1) — Tailwind 3 → 4 migration is breaking | LOW | Defer Tailwind to v0.2.1; pin `tailwindcss@^4`. When Tailwind 5 ships, the template metadata version bumps independently of `@aihu/cli` core. |
| R-CT-03 | Cloudflare adapter `wrangler.toml` format drift (CF revisits the schema yearly) | MEDIUM | Template emits the *minimal* wrangler.toml — only `name`, `main`, `compatibility_date`. Pin compat date. CI smoke runs `wrangler --version --dry-run` on the emitted toml monthly. |
| R-CT-04 | Generator template drift over time — once shipped, every prompt-flow change requires a major bump | HIGH | **Version templates separately from `@aihu/cli`**. Recommend `@aihu/templates-*` family OR a `templates/` subpackage with its own SemVer. CLI declares a templates *range*; templates can ship patch fixes without `@aihu/cli` rebuild. The "ejectable" question (do users vendor their own templates?) deferred to v0.3 — for v0.2.0, templates live in-tree. |
| R-CT-05 | A2A / ACP protocol churn — Anthropic/Cursor/spec authors revise frequently | MEDIUM | v0.2.0 ships **MCP only** (Aihu has had MCP support since v1; spec is `2025-06-18` pinned). A2A + ACP enter D9's "Full" choice in M3 only after Aihu's `@aihu/agent-a2a` + `@aihu/agent-acp` packages stabilize. |
| R-CT-06 | Existing `aihu app <name>` scaffold (in `packages/cli/src/index.ts`) vs new template-driven scaffold — interaction unclear | HIGH | **Backward-compat contract:** the existing `aihu app` keeps working with no flags (current default = "minimal" template). The new prompt flow only fires if invoked as `bunx create-aihu` OR `aihu app --interactive`. `aihu app foo` (no flags) emits today's output unchanged. The Architect must test this on its own fixture in CI. |
| R-CT-07 | npm publish discipline — when does the CLI template metadata bump? | MEDIUM | Decision needed (surface to user — see §7): publish templates as `@aihu/cli` minor bumps (simpler, single tag) OR as a separate `@aihu/templates-*` package family (more flexible, independent versioning). Director recommends bundled-in-CLI for v0.2.0 to ship faster; split if a v0.2.x has > 3 template-only patch releases. |
| R-CT-08 | Brand fit — making sure the agent surface choice doesn't feel like opt-in spam | LOW | D9 default = "Minimal" (silent `.mcp.json` emission, single `@expose` line in the example component). The user only sees a prompt "Agent surface: Minimal / Full / None" with one-sentence descriptions. Not aggressive. |

---

## §7 Director's brief for the next role

**Recommendation:** dispatch an **Architect** (Mode 2, single-track,
no parallel work) to produce **`docs/roadmap/arch-6-cli-templates.md`** —
a new architecture spec doc, sibling to arch-1..5.

### Architect deliverable shape (the spec must answer all of these)

**(a) Where templates live in the repo, how they compose, and how they're versioned alongside `@aihu/cli`.**

- Recommended path: `packages/cli/templates/<template-name>/` for v0.2.0
  (single-tier, in-tree). Each template directory is a self-contained
  scaffold root with a `template.json` manifest declaring which option
  dimensions it supports.
- Versioning: tied to `@aihu/cli` for v0.2.0; split decision in §6 R-CT-07.

**(b) The `aihu app <name>` interactive flow — exact CLI prompt sequence for v0.2.0.**

- Mirror `create-next-app`'s 2026 UX: name → "Use recommended defaults?"
  Y/N. If N, prompt the 4 unlocked dimensions in order: CSS, Deploy,
  Agent surface, Starter.
- Existing flow in `packages/cli/src/create.ts` (template select +
  package manager + git init) stays — extend, don't replace.
- Non-interactive flag matrix: `--template <T>`, `--options <opts.json>`,
  `--no-interactive`, `--use-defaults`. All four must work in CI.

**(c) The option-matrix-to-final-files transformation pipeline.**

- Pure functions (extend `packages/cli/src/index.ts` pattern). Each
  option dimension is a function `<D>: (opts) => Array<[path, content]>`.
- Composition rule: for each (D1..D11) chosen, append its file-tuple set;
  `package.json`/`tsconfig.json`/etc. merge via a known-good merge
  function (deep object merge for JSON, line-append for plain text).
- Template files are TS string-template generators (already the existing
  pattern — see `appPackageJson` etc.) so no runtime file-read I/O,
  preserving `@aihu/cli`'s zero-dep-at-runtime contract.

**(d) How the compile-after-scaffold test runs in CI.**

- `scripts/test-cli-templates.sh` runs the §5 fixture set on Ubuntu,
  macOS, Windows.
- Wired to `.github/workflows/ci.yml` as a separate job from the main
  test job (so monorepo PRs touching `packages/cli/**` rebuild + test
  the scaffolds).
- Fixture set: 5 named JSON files in `packages/cli/test-fixtures/`.

**(e) Backward compatibility with the existing `aihu app` scaffolding.**

- **Hard contract:** `aihu app foo` (no flags, no interaction) must
  produce identical files to today's output. The new prompt UX is
  additive only.
- Test fixture: snapshot of today's `aihu app test-app` output committed
  to `packages/cli/test-fixtures/legacy-snapshot/`; CI diffs against
  this snapshot on every PR.

**(f) Explicit IS-NOT-IN-V0.2.0 list (so Builder doesn't scope-creep).**

- Tailwind, Vercel adapter, Fly adapter, ESLint+Prettier, monorepo,
  Drizzle, Prisma, `@aihu/auth`, `@aihu/magna`, full A2A+ACP+MCP scaffold,
  third-party auth adapters, GitLab CI, Playwright, full-landing-page
  starter, post-scaffold `aihu add` codemods.

### Architect acceptance criteria

- arch-6 spec landed at `docs/roadmap/arch-6-cli-templates.md`
- Sections (a)–(f) above each have a concrete answer (not a "TBD")
- §3 phasing of state file referenced and not contradicted
- §5 test harness pseudocode promoted to a real `scripts/` path
- Backward-compat contract (e) cited verbatim with a runnable diff command

The Architect should NOT write code, NOT touch `packages/cli/`, and NOT
publish anything. Spec doc + test fixture stubs only. Builder rounds
follow.

---

## Continuity / handoff state

- **AGENTS.db at session start:** clean slate. No prior records on
  `cli-templates` topic. (Searches for "cli scaffolding", "create-next-app",
  "agent protocol scaffolding", "plugin contract auth data" returned only
  unrelated mail-system + api-scope content.) Director-note 001 is the
  first artifact for this topic.
- **Open packages already shipped in Aihu monorepo that v0.2.0 depends on:**
  `@aihu/cli`, `@aihu/compiler`, `@aihu/runtime`, `@aihu/signals`,
  `@aihu/arbor`, `@aihu/router`, `@aihu/data`, `@aihu/agent`,
  `@aihu/agent-service`, `@aihu/agent-readiness`,
  `@aihu/adapter-cloudflare`, `@aihu/server`. **No new package required
  for v0.2.0.**
- **First Architect read should also pull:** `examples/live-counter/`
  (D11 starter source), existing `packages/cli/src/{index,bin,create}.ts`
  (the surface to extend), `examples/_shared/` (token CSS that templates
  may want to inherit).
