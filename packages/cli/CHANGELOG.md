# @aihu/cli

## 0.8.0

### Minor Changes

- [#374](https://github.com/fellwork/aihu/pull/374) [`6a0d8e4`](https://github.com/fellwork/aihu/commit/6a0d8e426fa2ab53c37fa5d1d4e6ae63ca671e0d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - add `create-aihu --template agent` + publish `@aihu/agent-server`

  - **New opt-in `agent` template** (`create-aihu --template agent`, or option 4 in the
    wizard): the headline aihu thesis made runnable. A durable on-screen `<task-list>`
    Web Component that BOTH a human and an external AI agent drive — the agent reaches the
    same visible instance over `@aihu/agent-server`'s capability bridge (server = policy
    gate, browser = sole executor). Two-process app (Bun bridge server + Vite, client-target
    compiler). Verified end-to-end: typing in the input AND an external
    `curl /agent/call` both append to the same live instance; unexposed actions are rejected.
  - **`@aihu/agent-server` first publish** (added to the release allowlist). Includes the
    fix that lets `createAgentServer`'s `node` mount path stand up its own server-side DOM
    internally (no consumer jsdom/`createHost` glue) when the runtime has no `document`.

  The bridge in the template is unauthenticated (local dev/demo); the generated server
  warns against exposing it to untrusted networks.

- [#374](https://github.com/fellwork/aihu/pull/374) [`6a0d8e4`](https://github.com/fellwork/aihu/commit/6a0d8e426fa2ab53c37fa5d1d4e6ae63ca671e0d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - create-aihu: fix `bun run dev` + ship the agent surface out of the box

  - **`bun run dev` no longer crashes.** The generated `vite.config.ts` now sets
    `optimizeDeps: { exclude: ['@aihu/app'] }` — esbuild's dep pre-bundle can't
    resolve the `virtual:aihu-routes` / `virtual:aihu-layouts` modules that
    `@aihu/app`'s client entry imports (the router plugin resolves them at request
    time), so excluding `@aihu/app` from pre-bundling is required for dev to boot.
  - **The default scaffold now delivers the agentic surface.** `vite.config.ts`
    wires `viteAgentReadinessIntegration` (imported directly from
    `@aihu-plugin/agent-readiness`, now a scaffolded devDependency), so
    `vite build` emits `llms.txt`, `llms-full.txt`, `robots.txt`, the MCP server
    card at `/.well-known/mcp/server-card.json`, and JSON-LD — all served in
    `vite dev` too. The hello-world page is now an agent-callable component: its
    counter exposes `increment` / `reset` as `$action` tools, mirrored into the
    card's `skills`. (A live, callable MCP endpoint still requires running
    `@aihu/server`; the static card is discovery metadata — noted in the config.)

## 0.7.0

### Minor Changes

- [#368](https://github.com/fellwork/aihu/pull/368) [`e237cf3`](https://github.com/fellwork/aihu/commit/e237cf3820180e2e98807af0dbc253eeb9afa2e0) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix create-aihu / `bun create aihu` public-release blockers

  - **P0 — scaffolded apps now declare `trustedDependencies: ["@aihu/compiler"]`.**
    Without it, `bun install` blocks `@aihu/compiler`'s postinstall (the step
    that arch-validates and downloads the correct native binary), so the
    wrong-arch binary baked into the published tarball stayed in place and
    `bun run build` failed with `ENOEXEC` (`Unknown system error -8`) on
    macOS/Windows. `npm install` was unaffected (npm runs postinstall by
    default); the break was bun-specific — and bun is the flagship path.
  - **Non-interactive / pipe-safe scaffolding.** New flags `--template`,
    `--pm`, `--yes` / `-y`, `--no-git`. When `--yes` is passed or stdin is not a
    TTY, the wizard runs fully non-interactively with documented defaults. This
    fixes the prior behavior where piped input silently created nothing and
    exited 0 (Node `readline.question` losing buffered lines at EOF), and
    unblocks CI/scripted use.
  - **Template selection now actually differentiates output.** `minimal`,
    `full`, and `docs` previously produced byte-identical scaffolds;
    `scaffoldApp` now honors the choice (`full` adds a default layout + a second
    page; `docs` ships a docs-flavored landing + guide page). Every variant
    scaffold → install → build is verified on both bun and npm.

## 0.6.0

### Minor Changes

- [#276](https://github.com/fellwork/aihu/pull/276) [`22234fa`](https://github.com/fellwork/aihu/commit/22234fa1d34e913d84bcdbcc9c2bcf1fb315186b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Scaffold `@aihu/css-engine` out of the box, with a shadow-mode choice.

  `aihu app <name>` gains two flags on the legacy scaffold path:

  - `--css <engine|none>` (with `--css-engine` as a boolean alias for
    `--css engine`) — includes `@aihu/css-engine` in `dependencies` and emits a
    utility-class starter page (`flex gap-4 max-w-7xl mx-auto p-8`, `text-3xl
font-bold`, …) instead of the hand-written `@style` starter.
  - `--shadow <open|closed|none>` — the shadow mode threaded into the compiler
    when css-engine is on (default `open`). `--shadow` without `--css engine`
    warns and is ignored.

  The `create-aihu` interactive wizard asks the same two questions. The default
  css-engine mode is `open` (scoped shadow fold), which is the compiler default —
  so the default css-engine scaffold writes **no** `css` block; only
  `closed`/`none` emit an explicit `css: { shadowMode }`. The plain (no-flag)
  scaffold output is unchanged.

  `@aihu/app` patch: corrected the `CssConfig` JSDoc — `@aihu/css-engine` is
  scoped by design and works in any shadow mode (its utilities fold into each
  component's shadow style); `shadowMode: 'none'` is only needed for
  global-cascade frameworks (Tailwind/UnoCSS/Pico) or to style light-DOM /
  external (slotted) children. (Wording only; no type or validation change.)

## 0.5.3

### Patch Changes

- [#255](https://github.com/fellwork/aihu/pull/255) [`af25c7c`](https://github.com/fellwork/aihu/commit/af25c7cfa47d29112e4f8a017b59a0432031a32d) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Surface the `--template=cf-team` option in `aihu app` usage text and clarify in `llms-full.txt` that the no-flag `aihu app <name>` is a client-only Vite + router SPA while `--template=cf-team` scaffolds the deployable Cloudflare monorepo (workspaces, wrangler, auth, agent surface).

  Docs-only patch. The underlying scaffolder fix already shipped in `@aihu/cli@0.5.2` (PR [#247](https://github.com/fellwork/aihu/issues/247)); this addresses follow-up discoverability friction reported by users who expected an SPA-first scaffold and weren't aware of the `--template` flag.

## 0.5.2

### Patch Changes

- [#249](https://github.com/fellwork/aihu/pull/249) [`6ed33f8`](https://github.com/fellwork/aihu/commit/6ed33f80bfdf193382e9fb1d192c0c1d4e6ef069) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Default `bunx @aihu/cli app NAME` scaffold switches from rolldown to Vite + `viteAihuPlugin()`. The prior rolldown output was not runnable end-to-end — `createApp()` from `@aihu/app/client` imports `virtual:aihu-routes`, a Vite-plugin virtual module with no rolldown equivalent, so `bun run dev` produced an app that could not route. Mirrors `examples/blog-router`; matches the direction `apps/docs` already moved.

  Also: `index.html` now uses `<div id="outlet">` + `./src/main.ts` (matches `createApp()`'s default mount target — the prior `<demo-root>` custom element threw on boot); `@aihu/router` is now an explicit runtime dependency; the dead `commands/app.ts` divergent Vite scaffold and the unreachable `appRolldownConfig` / `appViteConfig` back-compat alias have been removed.

  Marked as `patch` rather than `minor`: the user-facing contract (`aihu app` command) is functionally additive (it now produces a runnable project instead of a broken one), and the removed JS exports (`appRolldownConfig`, `appViteConfig`) are not depended on by any in-repo consumer. Patch avoids cascading a major bump onto `@aihu/templates-cf-team`'s `^0.5.1` peer range.

## 0.5.1

### Patch Changes

- [#203](https://github.com/fellwork/aihu/pull/203) [`a6f9b53`](https://github.com/fellwork/aihu/commit/a6f9b536620115e0e3bed8551c165d4634aed7f8) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix(cli-templates): bring all scaffolder grammar to v1 (compiler@0.4.0) so a freshly scaffolded project compiles clean

  Every scaffold path previously emitted stale grammar that the v1 compiler rejects, so each new aihu project started broken:

  - `create-aihu` / `aihu app` (`packages/cli/src/index.ts`): `$on:click={…}` (C305) → `$on.click={…}`; `{{ count }}` → `{count}`.
  - `aihu app` legacy + `APP_INDEX_SCRIBE` (`commands/app.ts`, `templates/app.ts`): bare `$prop name: T = d` → collection-form `$prop: { name: { default, type } }`; `{{ name }}` → `{name}`.
  - `aihu component` (`index.ts`): comment-only `<div>` body ("expected tag name") → a real heading element.
  - `@aihu/templates-cf-team` (`live-counter.aihu`, `expose.aihu`, `app.aihu`): bare `@state` entries → collection-form `$prop`/`$action`; removed `@agent { $expose / $describe }` (C440) → per-entry `expose:` / `describe:` on `@state` macros (the v2 agent surface); `{{ … }}` → `{ … }`.

  Adds a scaffold-AND-compile guard (`scaffold-compile-clean.test.ts`) that scaffolds every path and runs the current `aihu-compile` on each emitted `.aihu`, asserting zero compile errors — the regression class the prior file-presence harness silently passed.

## 0.5.0

### Minor Changes

- [#196](https://github.com/fellwork/aihu/pull/196) [`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Wire up the `aihu migrate <files...>` command. The v0→v1 grammar codemod was
  fully implemented but never registered in the CLI entrypoint; it is now
  available and listed in `aihu --help`, which makes the `C304`/`C305`/`C306`
  compiler errors' "Run: npx aihu migrate" guidance accurate. Fixes upstream
  Bug 9c.

## 0.4.0

### Minor Changes

- [#171](https://github.com/fellwork/aihu/pull/171) [`7577bd1`](https://github.com/fellwork/aihu/commit/7577bd10f391b9f3996048371706c9be34b08e2e) Thanks [@srmcguirt](https://github.com/srmcguirt)! - v1.0.9 — Naming Scheme A: rename `@aihu/data` → `@aihu-plugin/data` and
  `@aihu/agent-readiness` → `@aihu-plugin/agent-readiness`.

  The two plugin-contract packages move from the framework-core `@aihu/*`
  scope into the new `@aihu-plugin/*` scope so that plugin-contract and
  framework-core surfaces can evolve at independent cadences. Decision
  record `6c7aa75b-...` (Amendment 04) ratified the scope on 2026-05-09 and
  v1.0.9 §400-416 of the v1 framework plan covers the cutover mechanics.

  **Per-package effect**

  - `@aihu-plugin/data` (new) — first publish at `1.0.0`. Same public API as
    `@aihu/data@0.1.0`; only the npm name changed.
  - `@aihu-plugin/agent-readiness` (new) — first publish at `1.0.0`. Same
    public API as `@aihu/agent-readiness@0.1.1`; only the npm name changed.
  - `@aihu/data@1.0.0` — published as a **moved stub**. The legacy name now
    installs a tiny package that re-exports `@aihu-plugin/data`. Carries
    `"deprecated"` metadata so npm surfaces the move on `npm install`.
  - `@aihu/agent-readiness@1.0.0` — same moved-stub treatment.
  - `@aihu/cli` — extends `aihu migrate` with a v1.0.9 pass that rewrites
    package.json `dependencies` blocks, static imports, dynamic imports, and
    JSDoc / Markdown URL references. Idempotent on already-renamed input.

  **Migration**

  Existing installs keep working via the deprecated stubs. To upgrade:

  ```sh
  bun add @aihu-plugin/data @aihu-plugin/agent-readiness
  bun remove @aihu/data @aihu/agent-readiness
  bunx aihu migrate
  ```

  `@aihu/agent-service` is explicitly **out of scope** for this rename and
  stays under the framework-core `@aihu/*` scope.

## 0.3.6

### Patch Changes

- [#163](https://github.com/fellwork/aihu/pull/163) [`38d3171`](https://github.com/fellwork/aihu/commit/38d3171f33a402fa3be954d2452677f9be026da8) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix mojibake in `package.json` description: `â€"` → `—` (em dash). The
  character was double-encoded somewhere in the original write; npm shows the
  mangled string on the package page. Doc-only.

  (This bump also serves as the verification release for npm OIDC trusted
  publishing — the previous smoke shipped before `NPM_PROVENANCE=1` was in repo
  variables, so its tarball lacks attestations.)

## 0.3.5

### Patch Changes

- [#161](https://github.com/fellwork/aihu/pull/161) [`025e7c7`](https://github.com/fellwork/aihu/commit/025e7c79fd859b5d214db6cbdd5b5dc66642c0b6) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Update `scaffoldApp` JSDoc to list the two `.vscode/` files it now emits.
  Doc-only; no behavior change. (Smoke release for npm OIDC trusted publishing
  - `--provenance`.)

## 0.3.4

### Patch Changes

- [#157](https://github.com/fellwork/aihu/pull/157) [`94425d7`](https://github.com/fellwork/aihu/commit/94425d70e94d07dd8b1401efe0cd0810a2920466) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix two scaffold-output bugs surfaced by the e2e harness:

  - `rolldown.config.ts`: quote the input key so kebab-case app names (`my-app`)
    don't produce a JS parse error. Was emitting `input: { my-app: 'src/main.ts' }`
    which fails at config load with "Expected , or } but found -".
  - `rolldown.config.ts`: import `aihuCompilerPlugin` from `@aihu/compiler` (the
    package's main export) instead of `@aihu/compiler/plugin` — the latter
    subpath doesn't exist in the published `exports` map.

  After this release, `bunx @aihu/cli app <name>` followed by `bun install` and
  `bun run build` succeeds end-to-end against fresh npm.

## 0.3.3

### Patch Changes

- [#153](https://github.com/fellwork/aihu/pull/153) [`f2421b1`](https://github.com/fellwork/aihu/commit/f2421b17a534d518c4f21c22d7f5e47a45c030da) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Scaffold install path fixes.

  `@aihu/cli`:

  - `aihu app <name>` now emits `package.json` with `latest` ranges for all `@aihu/*` deps instead of the aspirational `^1.0.0` (no 1.x exists on npm; the old pins broke `bun install` immediately).
  - Adds the missing `@aihu/app` (used by `src/main.ts`) and `@aihu/compiler` (used by `rolldown.config.ts`) to the generated dependency list.
  - Drops the malformed `bun@1` `packageManager` fallback — detects bun via `globalThis.Bun?.version`, omits the field when no real version is detectable.
  - Generates `.vscode/extensions.json` (recommends `fellwork.vscode-aihu`) and `.vscode/settings.json` (file association for `.aihu`) so new adopters get language support out of the box.

  `@aihu/router`, `@aihu/app`:

  - Republish so transitive pins point at clean versions. Previously `@aihu/router@0.1.1` pinned `@aihu/server@0.1.0` (carries the `workspace:*` leak) and `@aihu/app@0.1.4` peer-pinned `@aihu/router@0.1.0` (also leaked). Combined effect: `bun install` of any scaffolded app failed at the workspace-protocol resolution step. Both republish with deps targeting the post-leak versions.

## 0.3.2

### Patch Changes

- [#150](https://github.com/fellwork/aihu/pull/150) [`4ad09a4`](https://github.com/fellwork/aihu/commit/4ad09a4369bebaf6dffa49dfd726383651f06c0b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Re-publish `@aihu/cli` without the broken `@aihu/mcp` workspace dependency.

  `@aihu/cli@0.3.1` shipped with `"@aihu/mcp": "workspace:*"` in its published
  manifest. The `workspace:*` protocol is monorepo-internal — outside the workspace
  it cannot resolve, so `bunx @aihu/cli ...` failed at install time with:

  ```
  error: Workspace dependency "@aihu/mcp" not found
  error: @aihu/mcp@workspace:* failed to resolve
  ```

  If you hit this on 0.3.1, pin to the previous good version as a workaround:

  ```
  bunx @aihu/cli@0.3.0 app my-app
  ```

  0.3.2 ships from a clean manifest (no `@aihu/mcp` runtime dep) and the release
  pipeline now publishes via `scripts/publish-all.sh`, which runs `bun publish`
  per-package. `bun publish` rewrites `workspace:*` to a real version range at
  pack time, so the protocol cannot leak into a published artifact again.

  0.3.1 has been deprecated on npm.

## 0.3.0

### Minor Changes

- [#86](https://github.com/fellwork/aihu/pull/86) [`86af1be`](https://github.com/fellwork/aihu/commit/86af1beb2b34cd0dc270fdd9ad8ba1de4d19de90) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Adds the `@aihu/templates-*` family as a separate package family (per arch-6 §13 Q2 RESOLVED). `@aihu/cli` ships the template-manifest contract, scaffold pipeline, conditional-eval evaluator, hand-rolled prompts library, and `KNOWN_TEMPLATES` baked registry. `@aihu/templates-cf-team` is the first published template — Cloudflare Workers + bun workspaces + moon + better-auth (default) | kinde | supabase. Backward-compatible: `aihu app foo` (no flags) produces byte-identical output to today.

### Patch Changes

- [#94](https://github.com/fellwork/aihu/pull/94) [`8e258e7`](https://github.com/fellwork/aihu/commit/8e258e7b12fbb1ad1a1942d42606fc889dc94f25) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix `bunx @aihu/cli --template cf-team` on Windows (Node.js runtime path).

  `bunx` resolves the `#!/usr/bin/env node` shebang and runs the CLI under Node.js,
  which cannot dynamically import `.ts` files. `loadTemplateConfig` was silently
  swallowing the import error and throwing a misleading "file not found" message even
  when `template.config.ts` was present on disk.

  - `@aihu/templates-cf-team`: ship compiled `template.config.js` alongside the
    TypeScript source so Node.js falls back to the JS module. Bun still prefers `.ts`.
  - `@aihu/cli`: surface the last import error in the `loadTemplateConfig` throw
    message so future failures are immediately diagnosable.
