# M2 Track Decomposition — Roadmap Milestone 2 (Weeks 3-5)

**Topic:** `aihu-m2` · **Director:** Topic Director (round 0) · **Date:** 2026-05-27
**Layer:** delta · **Round:** 0
**GBrain unavailable — used file fallback.** (GBrain MCP tools `mcp__gbrain__search`/`mcp__gbrain__put_page` are not surfacing in this harness. Wrote to `.context/m2/decomposition.md`. Recommend per-track Directors re-check tool availability before round 1; fallback path is layer:delta in this file.)

**Source roadmap rows:** `docs/roadmap/SUMMARY.md:187-208` (the 18 M2 deliverables).
**Source per-arch M2 sections:** `arch-1-website.md:241-251`, `arch-2-examples.md:163-169`, `arch-3-plugins.md:174-182`, `arch-4-dx-tools.md:250-260`.
**User directives in force:** all of `docs/roadmap/_user-directives.md` (Directive 0 mantra, Directive 1 playground P0 already shipped in M1, Directive 3 locked decisions).

---

## Decisions needed from user before tracks can start

These are NOT internal track risks — they are user-decisions that can change the decomposition itself. Surface and resolve before round 1 Architect dispatches.

1. **D-A3-MAGNA-SCOPE:** Roadmap SUMMARY.md:192 reads `@aihu/magna` (full bridge). Section 7 of SUMMARY says "M1 skeleton / M2 full." `packages/magna/` does NOT exist yet — the M1 skeleton was not built (`packages/` listing shows no `magna`, no `seo`). **Question:** Is `@aihu/magna` greenfield in M2, or does an M1-skeleton hotfix need to land first as A3 round 0? Affects A3 starting slice (greenfield package scaffold) and A2 EX-11 plugin-demo. **Default assumption (proceeding without answer): greenfield in M2; first A3 deliverable is the `@aihu/magna` package skeleton + `beforeCompile` SDL pipeline.**
2. **D-A3-MAGNA-V02:** SUMMARY.md:192 says `magna-gqlmin optional`. Per Directive 3 #5, v0.2-gated features (FTS native, upsert, NOTIFY) ship via fallback paths in v1.1. **Question:** For M2 specifically, is `magna-gqlmin` napi distribution expected to work (per arch-3 R6, this is a known-broken pipeline), or are tracks authorized to ship with the napi dep as `optionalDependency` + graceful skip + warning? **Default assumption: optionalDependency + graceful skip; SDL validation is best-effort, NOT a CI gate.**
3. **D-A1-IA-DESTRUCTION:** SUMMARY.md:202 says "12 existing docs migrated under new IA." The existing 12 `docs/site/*.md` pages today are addressable via the docs renderer in `apps/docs/`. **Question:** Does migration mean (a) leave originals in `docs/site/`, copy/transform into `apps/docs/src/content/docs/`, OR (b) MOVE originals (`git mv`) into `apps/docs/`? Affects whether A1 freezes `docs/site/` from other tracks during migration. **Default assumption: COPY-then-deprecate. `docs/site/` stays read-only-warning for one milestone, then deletes in M3. A1 writes to `apps/docs/src/content/docs/`; other tracks may continue adding to `docs/site/` only with prior A1 coordination.**
4. **D-A4-LSP-VOLAR:** `packages/language-server/` exists but uses raw `vscode-languageserver` (not Volar). Per Directive 3 #2, Volar approach is APPROVED (`@volar/language-server` for M2). **Question:** Is the existing `core/` allowed to be deleted/replaced wholesale, or must hover/completion be added incrementally on top of the current scaffold? **Default assumption: clean refactor into `@volar/language-server`-based plugin; existing `core/` deleted in the same Architect-led PR.**
5. **D-A4-VSCODE-MARKETPLACE-CREDS:** SUMMARY.md:198 "VS Code LSP client + marketplace publish." **Question:** Does the repo already have the Marketplace `vsce` publisher token in `.github/secrets`, or does the user need to provision one? Blocks the actual publish step (extension build/CI can land without it). **Default assumption: publish is a manual user-driven gate at end of A4. Track lands the extension; user runs the publish.**
6. **D-A2-EX-11-INTERFACE:** SUMMARY.md:207 lists EX-11 plugin-demo as M2 A2. arch-2 §8.3 says EX-11 depends on `@aihu/plugin` `definePlugin`/hooks stability. **Question:** Does the `@aihu/plugin` API need an Architect-led interface spec (cross-track A2↔A3) before EX-11 starts, or is the current `packages/plugin/` API frozen? **Default assumption: a short cross-track interface note from A3 Architect → A2 (≤1 day) before A2 starts EX-11. EX-06/07/09/10/12/13 are independent and can start immediately.**

If any of these come back differently from the defaults, surface to all four track Directors in their kick-off Architect briefs.

---

## 1. Track roster

| Track ID | Theme | Branch convention | State file |
|---|---|---|---|
| `aihu-m2-a1` | Docs site content + IA migration + doc CI gates | `feat/m2-a1-docs/<deliverable>` | `state-aihu-m2-a1.md` |
| `aihu-m2-a2` | Advanced examples EX-06/07/09-13 + portfolio rewrite | `feat/m2-a2-examples/<deliverable>` | `state-aihu-m2-a2.md` |
| `aihu-m2-a3` | Plugins core: `@aihu/auth`, `@aihu/magna`, `@aihu/seo`, `@aihu/scraping` | `feat/m2-a3-plugins/<deliverable>` | `state-aihu-m2-a3.md` |
| `aihu-m2-a4` | LSP basics + CLI commands + editor configs | `feat/m2-a4-dx/<deliverable>` | `state-aihu-m2-a4.md` |

(IDs match the arch-doc numbering. State files at repo root, consistent with current `state-<track>.md` convention.)

### Owning paths

| Track | Owns (write freely) | Must NOT write to without coordination |
|---|---|---|
| A1 | `apps/docs/src/content/**`, `apps/docs/src/pages/**`, `apps/docs/src/components/**` for doc-only components, `apps/docs/scripts/check-doc-coverage.ts`, `apps/docs/tests/**`, `docs/site/**` (only for accuracy fixes per TASK-DOC-001..010) | `apps/docs/playground/**` (M1-shipped, owned by maintenance), `packages/*/src/**` (A3/A4 own their packages — A1 only opens issues), `examples/**` (A2 owns) |
| A2 | `examples/agent-hub/`, `examples/cf-adapter/`, `examples/plugin-demo/`, `examples/realtime-scores/`, `examples/storefront/`, polish in `examples/{weather-card,blog-loader,blog-router}/`, `examples/README.md`, `examples/_shared/agent-panel.aihu` (extend) | `apps/docs/**` (gallery/per-example pages land in M3, not M2), `packages/**` |
| A3 | `packages/auth/**`, `packages/magna/**` (greenfield create), `packages/seo/**` (greenfield create), `packages/scraping/**`, `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` (append-only for plugin macros post-RFC ratification), RFC-001/002/003 spec files under `docs/superpowers/specs/` | `packages/arbor/**`, `packages/agent-service/**` (live-binding is M1, frozen for M2 except security review fixes — coordinate with maintainer), `apps/docs/**` (file an issue for A1 to write plugin docs) |
| A4 | `packages/language-server/**`, `packages/cli/src/commands/**`, `packages/cli/src/bin.ts`, `packages/vscode-aihu/**` (extension client), `editors/` (new dir for Neovim/Helix configs), `.github/workflows/release.yml` (only for marketplace publish step) | `packages/compiler/**` (API surface frozen at 0.5.1 — file issue if needs change), `packages/agent/**`, `apps/docs/**` (A1 writes LSP install docs; A4 supplies snippets) |

### Frozen / shared paths (all tracks)

- **Root `package.json`** — workspace globs, scripts. Only A4 may add `aihu` CLI subcommands; only A2 may add `dev:examples`-style scripts. Other writes go through a coordination PR.
- **`.size-limit.json`** — A3 ADDS rows for browser-eligible new plugins (auth, seo). `@aihu/scraping` is server-only → no row. `@aihu/magna` runtime exports `createMagnaFetch` so it's browser-eligible → row required. Coordinate with the CI maintainer before merge.
- **`.changeset/`** — every track produces per-PR changesets. See §4.
- **`packages/compiler/**`** — published at 0.5.1, frozen. A4 LSP uses subprocess `aihu-compile --check`; no API changes.
- **`packages/arbor/**`, `packages/agent-service/**`** — live-binding shipped M1; any M2 change MUST go through security review per arch-3 R3.

---

## 2. Dependency graph

### Hard ordering constraints

1. **A3 RFC-001/002/003 ratification → A4 hover/completion content for plugin macros.** A4 hover docs for "all 39 macros" (SUMMARY.md:196) covers core macros today. The new `$auth.*`, `$cart`, `$query` macros land via A3 RFCs — A4 must absorb these into hover/completion data after A3 ratifies. **Mitigation:** A4 starts with the 39 core macros from the existing spec; plugin-macro hover ships as an A3↔A4 follow-up PR after RFC merge. Both tracks can start in parallel.
2. **D-A3-MAGNA-SCOPE resolution → A3 starting slice + A2 EX-11.** See §6.
3. **A3 `@aihu/auth` `requireAuth` API stable → A2 EX-13 storefront (auth-gated checkout) and A1 docs-page "auth example."** A2 EX-13 falls back to manual JSON serialization with TODO comment if `createResourceSerializer` not yet exposed (per arch-2 §8.3). A2 can START EX-13 with manual JSON; uplift after A3 lands.
4. **A4 `aihu-language-server` published binary → A1 installation page LSP section.** A1 documents Neovim/Helix configs in install page (SUMMARY.md:199); A1 must wait on A4 to land the npm bin to write final config snippets. **Mitigation:** A1 drafts the install page with placeholder snippets; A4 publishes a snippet at `editors/{nvim-lspconfig.lua,helix-languages.toml}`; A1 imports.

### Soft dependencies (coordination, not blocking)

- A1 `scripts/check-doc-coverage.ts` enforces "100% public exports documented" (SUMMARY.md:205). When A3 ships new plugins or A4 ships LSP API, those packages' exports must have a doc page. **Workflow:** A3/A4 add their package doc to `apps/docs/src/content/docs/packages/{name}.md` in the same PR as the package's M2 closeout. A1 owns the CI gate; A3/A4 are the writers.
- A1 Lighthouse 95+ gate (SUMMARY.md:206) lives on `/docs/introduction`. Other tracks' content edits don't usually move Lighthouse, but heavy A3-supplied diagrams or A2-supplied screenshots could. Use `<picture>` + width/height attributes; A1 owns the audit.
- A4 `aihu add <plugin>` CLI command (SUMMARY.md:201, arch-4 §3) needs to know A3's plugin shape to scaffold config edits. **Mitigation:** A3 publishes a `pluginInstallManifest.json` per plugin (paths to edit, default config snippet). A4 reads them. Spec is a 2-paragraph note in A3's first Architect brief.

### Safe parallelism (no coordination required)

- A2 EX-06 (weather-card polish), EX-09 (blog-loader), EX-12 (realtime-scores) — fully independent of A3/A4.
- A4 LSP hover/completion infrastructure (core 39 macros from existing spec) — independent of A3.
- A1 TASK-DOC-001/002 (correct API-ref inaccuracies) — independent, immediate.
- A3 `@aihu/seo` and `@aihu/scraping` — independent of magna/auth.

---

## 3. Starting slices

Each track gets ONE starting slice that can dispatch immediately (with Architect-then-Builder cadence). Subsequent slices come from per-track Directors.

### A1 — Starting slice: TASK-DOC-001/002 + IA migration scaffold

- **What:** (a) Fix `@aihu/agent` and `@aihu/agent-service` API ref errors (TASK-DOC-001, 002 from arch-1 §5). (b) Create the `apps/docs/src/content/docs/` IA directory tree (introduction, getting-started, installation, guides/, packages/) and copy the 12 existing pages over (no transformation yet — just establish the file map).
- **Acceptance:** `bun run typecheck` passes; visiting `/docs/introduction` in dev server renders the migrated copy; original `docs/site/*.md` unchanged; TASK-DOC-001/002 diffs reviewed.
- **Files touched:** `docs/site/api-reference.md`, `docs/site/authoring-agents.md`, new `apps/docs/src/content/docs/**` (12 page mirrors), `apps/docs/src/pages/docs/[...slug].aihu` (already exists — verify wiring).
- **Rounds:** 2 (Builder lands docs fixes + IA mirror; Verifier confirms render + no broken links).
- **Scout dispatch needed first:** YES — survey what's already in `apps/docs/src/content/` and confirm zero collision with M1 playground content.
- **Architect dispatch needed first:** YES — decide D-A1-IA-DESTRUCTION (default = COPY) and lock the URL/slug mapping table.

### A2 — Starting slice: EX-06 weather-card polish + `agent-panel.aihu` protocol indicators

- **What:** Polish `examples/weather-card/` (Open-Meteo wiring + `@agent` block + agent-panel showing A2A/ACP protocol status indicators stubbed). Expand `examples/_shared/agent-panel.aihu` with the protocol status row. EX-06 is the showcase example arch-2 calls out specifically.
- **Acceptance:** `bun run dev --filter weather-card` renders; agent-panel shows "A2A: stub," "ACP: stub," "Tool call stubbed — live binding pending" badge on invocation (per arch-2 §9.2); smoke test added; portfolio table row updated in `examples/README.md`.
- **Files touched:** `examples/weather-card/src/**`, `examples/_shared/agent-panel.aihu`, `examples/README.md`, new `examples/weather-card/tests/smoke.test.ts`.
- **Rounds:** 1-2.
- **Scout dispatch needed first:** YES — current state of weather-card (is `@agent` block in or stubbed?).
- **Architect dispatch needed first:** NO — arch-2 §M2 + §9.2 specify the pattern.

### A3 — Starting slice: `@aihu/seo` greenfield package

- **What:** `@aihu/seo` is the lowest-coordination M2 plugin (build-time only, no magna dependency, no live-binding requirement per arch-3 §2.2). Scaffold `packages/seo/`, implement `seo({ siteName, baseUrl, ... })` plugin factory, `GET /sitemap.xml` handler, `afterParse` JSON-LD injection.
- **Acceptance:** `bun run --filter @aihu/seo build` succeeds; new unit tests for sitemap pagination + JSON-LD structure pass; `apps/docs/` adopts the plugin and `/sitemap.xml` is valid XML; new `.size-limit.json` row added (build-time only — confirm whether it needs a size row; default no, server-only).
- **Files touched:** `packages/seo/` (new), `apps/docs/aihu.config.ts` (add plugin), `.size-limit.json` (only if browser bundle), `apps/docs/src/content/docs/packages/seo.md` (doc stub).
- **Rounds:** 2-3.
- **Scout dispatch needed first:** YES — confirm `@aihu/agent-readiness` exposes the `llms.txt` delegate hook arch-3 §2.2 assumes.
- **Architect dispatch needed first:** YES — short brief that confirms the API shape, decides whether `@aihu/seo` needs a runtime entry point (default: no).

(NOTE: `@aihu/auth` is a stronger fit per arch-3 §2.4 but already has scaffolding — auth's starting slice is more contentious because it touches live-binding. SEO is the cleanest first round; auth/magna/scraping each get their own slice from the A3 Director in round 1.)

### A4 — Starting slice: Volar refactor + 39-macro hover

- **What:** Refactor `packages/language-server/src/core/` from raw `vscode-languageserver` to `@volar/language-server` per arch-4 §2.1-§2.3. Implement the virtual-file generator for `@state` block only (the M2 minimum per SUMMARY.md:195). Add hover provider sourced from `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` for all 39 core macros.
- **Acceptance:** `bun run --filter @aihu/language-server build` succeeds; `aihu-language-server --stdio` starts; opening a `.aihu` file in `examples/live-counter/` via VS Code extension shows hover docs on `$state`, `$computed`, `$action`; LSP completion latency benchmark (<100ms p95 per SUMMARY.md:200) added to CI as a check (not gate yet).
- **Files touched:** `packages/language-server/src/**` (full rewrite of `core/`), `packages/vscode-aihu/src/extension.ts` (LanguageClient activation), `packages/language-server/tests/hover.test.ts` (new), `packages/language-server/tests/latency.bench.ts` (new).
- **Rounds:** 3 (Architect → Builder big-PR → Verifier round-trip).
- **Scout dispatch needed first:** YES — full read of existing `core/` to size the refactor; confirm `@volar/language-server` v-current API.
- **Architect dispatch needed first:** YES — virtual-file generator schema + source-map design (arch-4 §2.3 is direction, not blueprint).

---

## 4. Shared resources and merge points

### Multi-track files

| File / dir | Tracks that touch it | Protocol |
|---|---|---|
| Root `package.json` | A2 (dev:examples script if absent), A4 (aihu CLI command registration is internal to `packages/cli/`, NOT root) | Touch via PR-of-its-own with the change requestor; rebase others. |
| `.size-limit.json` | A3 (adds rows for new browser plugins) | A3 adds rows in same PR as the package; CI maintainer reviews. |
| `.github/workflows/*` | A1 (deploy-docs.yml — already exists), A4 (release.yml — vsce marketplace step) | Each track owns its workflow. Cross-workflow shared steps (cache, bun version) coordinated via the Director. |
| `apps/docs/src/content/docs/packages/{name}.md` | A1 (IA owner), A3 (writes plugin docs), A4 (writes language-server/cli docs) | A1 owns the directory contract (frontmatter shape, sidebar entry). A3/A4 write content following the contract. A1 reviews. |
| `docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md` | A3 (append-only for plugin macros post-RFC), A4 (read-only — consumed for hover content) | A3 appends; A4 picks up after RFC merge. |
| `examples/README.md` | A2 (portfolio rewrite per SUMMARY.md:208) | A2 only. |

### Coordination protocol

**Land-first order when conflicts are realistic:**
1. A4 ships `aihu-language-server` npm publish FIRST, then A1 references the bin in install docs.
2. A3 ratifies RFC-001/002/003 FIRST, then A4 adds plugin-macro hovers in a follow-up.
3. A1 establishes `apps/docs/src/content/docs/packages/` directory schema FIRST, then A3/A4 add their package docs.

**Rebase rule:** when two tracks must touch the same file (`.size-limit.json`, root `package.json`), the smaller diff rebases on the larger. State file should note "blocked on <other-track>" so the Director can sequence.

### Changeset workflow (resolves SUMMARY.md confusion)

- Every track adds its own `.changeset/<unique-slug>.md` per PR.
- Slug convention: `<track>-<short-deliverable>.md` (e.g., `a3-auth-jwt-middleware.md`, `a4-lsp-hover-39-macros.md`). Globally unique because of the `<track>` prefix.
- changesets/action handles version bumps on merge; no per-track collision because each PR adds a NEW file.
- **Confirmed: no coordination needed at changeset level.** Concurrency is safe.

---

## 5. GBrain track tagging

### Topic + track tags

- Top-level topic: `topic:aihu-m2`
- Per-track topics: `topic:aihu-m2-a1`, `topic:aihu-m2-a2`, `topic:aihu-m2-a3`, `topic:aihu-m2-a4`
- Every page should additionally carry: `track:aihu-m2-a{N}`, `layer:{delta|user|base|local}`, `kind:{director_note|build_manifest|architect_brief|builder_report|verifier_report|scout_finding|retro|interface_spec}`, `round:{0,1,2,...}`.

### Slug convention

`aihu/{layer}/m2/{track}/round-{N}/{kind}-{short-slug}`

Examples:
- `aihu/delta/m2/a3/round-0/architect_brief-seo-package-scaffold`
- `aihu/delta/m2/a4/round-1/builder_report-volar-refactor`
- `aihu/user/m2/decision-magna-greenfield-vs-skeleton-first`

### Per-track recall search examples

Once GBrain is reachable (resolve the MCP tool surfacing first), the canonical "what has my track done" search per Director:

- A1: `mcp__gbrain__search` query: `"track:aihu-m2-a1 kind:builder_report"` filter `layer:delta`
- A2: `mcp__gbrain__search` query: `"track:aihu-m2-a2 kind:verifier_report"` filter `layer:delta`
- A3: `mcp__gbrain__search` query: `"track:aihu-m2-a3 kind:architect_brief OR kind:interface_spec"`
- A4: `mcp__gbrain__search` query: `"track:aihu-m2-a4 round:0"` to recover the initial volar refactor brief

Cross-track interface lookup (e.g., A4 wants the plugin install manifest from A3):
- `mcp__gbrain__search` query: `"kind:interface_spec topic:aihu-m2"` filter `layer:delta`

---

## 6. Risks and surface conditions

(Track-internal risks belong to per-track Directors — these are decomposition-level risks only.)

| Risk | Impact | Mitigation |
|---|---|---|
| **GBrain MCP tools not surfacing in this harness.** | Director-note durability and cross-track recall degrade to file-based. | (a) Resolve MCP server reachability before round 1. (b) In the interim, every Director writes to `.context/m2/<track>/round-N.md` AND tags the same way; promote to GBrain when reachable. |
| **D-A3-MAGNA-SCOPE unresolved.** | A3 cannot start the magna-dependent plugins (`@aihu/auth` uses magna for RLS relay per arch-3 §2.4); A2 EX-11 plugin-demo blocked. | Default to greenfield (no M1 skeleton retroactive). If user disagrees, A3 round 0 becomes "land magna skeleton" rather than "ship `@aihu/seo`." |
| **A4 Volar refactor is bigger than 1 builder round.** | Could spill across M2 weeks; downstream A1 install docs blocked. | Time-box the refactor at 1 week; if it slips, A4 falls back to extending current `vscode-languageserver` plugin with hover only (M2 minimum per SUMMARY.md:195-196). Document the deferral as M3 work. |
| **Security review for live-binding (arch-3 R3) is "before M2 ships."** | If M2 ships before the review, the entire A3 track is conditionally landed (works-but-not-secure). | Schedule the security review as a P0 BLOCKER for A3 closeout. Verifier MUST gate on it. This is NOT a Director-scoped decision — surface to user. |
| **VS Code Marketplace publisher token unknown.** | A4 cannot complete SUMMARY.md:198 ("marketplace publish"). | See D-A4-VSCODE-MARKETPLACE-CREDS. Default: A4 lands extension code and CI workflow; user manually triggers first publish. |
| **`magna-gqlmin` napi distribution broken (arch-3 R6).** | SDL validation in `@aihu/magna` `beforeCompile` may silently skip. | Default per D-A3-MAGNA-V02: graceful skip + warning, not a CI gate. Document the limitation in `apps/docs/src/content/docs/packages/magna.md`. |
| **Lighthouse 95+ regression from A1 doc content.** | A1's own gate may bite mid-track. | Run Lighthouse locally before merge for any PR that touches `/docs/introduction` content. Optimize images, defer non-critical JS. |
| **Cross-track interface specs (A3↔A2 plugin manifest, A3↔A4 plugin install manifest) not yet authored.** | Round 0 Architect briefs need them, but they're not in the roadmap. | A3 Director's first Architect dispatch in round 0 includes "publish `pluginInstallManifest.json` spec" and "publish plugin-demo consumer contract." Both <1 day. |

---

## STATUS

```
STATUS: DONE
- Decomposition location: /Users/smcguirt/conductor/workspaces/aihu/ottawa/.context/m2/decomposition.md
- Track count: 4
- Decisions surfaced to user: 6
- Starting slices proposed: 4
- GBrain tool path tested: YES (search ok? N, put_page ok? N) — tools not surfaced via ToolSearch; used file fallback per protocol.
```
