# session retro — downstream-driven SEO/SSR + css-engine adoption + cross-repo kindly-note (v0.4.15 + v0.4.16)

**Topics:** seo-ssr, css-engine, kindly-note, plugins-data, examples-polish, language-server, docs-site, bench-baseline
**Date:** 2026-05-25
**Status:** session-end close-out. ALL work shipped to npm via **v0.4.15** + **v0.4.16** (aihu) and a **fellwork/kindly-note** publish. The release saga (four tags, two failures) is the headline lesson of this session.

---

## The arc

A downstream consumer — a content/marketing site built on aihu — drove the session by filing two batches against the framework:

- **SEO/SSR (R1–R5):** per-route `<head>` control + a static/SSG output mode so the marketing site could ship pre-rendered HTML for crawlers.
- **css-engine adoption (R6) + a runtime slotted-prop bug (R7):** real adoption blockers the consumer hit while wiring css-engine into its build.

Alongside the consumer-driven work ran **Wave-2 framework work** (data plugins, examples portfolio, a `.aihu` language server, docs-site accuracy) and a **cross-repo kindly-note markdown arc**.

## What shipped (all published)

**SEO/SSR — per-route `@route` head + `static`/SSG output mode:**
`@aihu/app@0.2.0`, `@aihu/compiler@0.5.0`, `@aihu/server@0.2.0`, `@aihu/router@0.1.6`, `@aihu/adapter-cloudflare@0.1.10`. Build chain: `@route` head → `.route.json` sidecar → router head threading → server head lowering (`routeHeadToSsrHead`) → SSG static output → per-route `<head>` on client SPA navigation; adapter-cloudflare emits a routes-manifest for SSR.

**css-engine adoption (R6):**
`@aihu/css-engine@0.2.0` + four per-platform native binaries `@aihu/css-engine-{darwin-arm64,darwin-x64,linux-x64-gnu,win32-x64-msvc}@0.1.2`; the `compileSfc` compiler hook (css-engine integration lives inside `@aihu/compiler`); pack exports (`./packs` + `./styles/*.css`).

**runtime fix (R7):**
`@aihu/runtime@0.1.6` — pre-connect reactive `$prop` binding fix (a slotted-prop set before `connectedCallback` was dropped).

**New packages:**
`@aihu/language-server@0.1.0` (Volar-style LSP for `.aihu`: bin + core seam + client trim); `@aihu-plugin/drizzle@0.1.0` (plugins-data Wave-1 item 1, Drizzle ORM adapter); `@aihu-plugin/kindly-note@0.2.0` (highlight + markdown, Shape A adapter).

**Cross-repo kindly-note (published from fellwork/kindly-note):**
`@kindly-note/core@0.2.0`, `@kindly-note/emitters-markdown@0.1.0`, `@kindly-note/render-markdown@0.1.0`.

## The release saga (the headline)

Four tags, two failures, five real release-engineering hazards caught and fixed (not papered over):

1. **v0.4.11 — premature tag (no-op publish).** Tagged at `main` HEAD *before* the changesets Version PR (which applies the version bumps) had merged. `publish-all.sh`'s idempotency check then saw the still-un-bumped versions as "already published" and published nothing new. → lesson `tag-after-version-pr-merge`.
2. **v0.4.14 — FAILED.** Two co-occurring causes: (a) a stale `bun.lock` after manual version corrections → `release.yml`'s `--frozen-lockfile` install rejected the mismatch (→ `version-pr-correction-refresh-lockfile`); (b) a `resolveBinary()` `EACCES` — a non-executable in-source placeholder `aihu-css-compile` (made resolvable by the lockfile refresh) shadowed the dev `target/` fallback and died in `execFileSync` (→ `resolvebinary-executability-fallback`).
3. **Pre-1.0 cascade correction (v0.4.14 target).** Before tagging, inspection of the Version PR bump table revealed a 0.x **minor** changeset had mis-projected dependents — including **UNCHANGED** packages like `adapter-vercel` — to **1.0.0**. Corrected every anomaly to the intended 0.x version (`app` 1.0.0→0.2.0, `compiler` 1.0.0→0.5.0, `adapter-cloudflare` 1.0.0→0.1.10), reverted pure-cascade packages (`adapter-vercel`) to `origin/main`, and set brand-new packages to their initial version (`language-server`/`drizzle` PR-mis-set 0.2.0 → 0.1.0; `kindly-note` 0.3.0 → 0.2.0). No package ended at 1.0.0. → lesson `changesets-pre-1.0-cascade`.
4. **v0.4.15 — shipped the corrected set** after the cascade correction + lockfile refresh + binary fix all landed.
5. **v0.4.16 — mop-up.** A `publish-all.sh` `PKGS`-array gap had SILENTLY skipped 3 of the new packages (they were version-bumped in `package.json` but never `npm publish`'d because the bash loop only iterates the array). Added `language-server`, `plugin-drizzle`, `plugin-kindly-note` to the array in dependency order and re-published. → lesson `publish-all-pkgs-array-gap` (recurrence of round-7's `publish-all-pkgs-array`).

## Repo / infra facts established this session

- **`main` is now PR-protected.** Ruleset "protect main" (active) enforces `pull_request` + `deletion` + `non_fast_forward` on the default branch. Status checks are **NOT** required. Practical effect: branch pushes to main now need a PR; **tag pushes are unaffected** (so the release-tag flow still works).
- **kindly-note now lives at `fellwork/kindly-note`** (public). Its `@kindly-note` npm scope publishes via that repo's own `release.yml` using the org `NPM_TOKEN` — independent of aihu's `publish-all.sh`.

## Key decisions ratified this session

- **SSG-first output mode** (R4.1) over SSR-first.
- **`@route`-block head extension** (R1 API) over a separate `@head` block or runtime `useHead()`.
- **css-engine per-platform native binaries** (R6c) over WASM.
- **css-engine SFC integration hooked in `@aihu/compiler`** (R6b) over a separate plugin.
- **kindly-note Shape-A adapter + markdown cross-repo arc, GFM deferred.**
- **plugins-data Wave-1 = Drizzle first** (then AI-SDK + JWT).

## Lessons promoted to docs/lessons/

`changesets-pre-1.0-cascade`, `tag-after-version-pr-merge`, `publish-all-pkgs-array-gap`, `optional-peer-dynamic-import-variable-specifier`, `resolvebinary-executability-fallback`, `version-pr-correction-refresh-lockfile`.

## What the next session needs

- All eight topics stay ACTIVE (Wave-2 work continues): plugins-data Wave-1 still owes AI-SDK + JWT; examples-polish, language-server, docs-site, bench-baseline each closed one round but have more queued.
- Carry forward the CI-lint debt: a `check-publish-array.sh`-style drift guard between `packages/*/package.json` (`publishConfig.access: public`) and the `PKGS` array would have caught both the v0.4.16 gap and round-7's `auth`/`mcp`/`ai`/`scraping` gap before tagging.
