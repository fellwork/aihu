# @aihu/cli

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
