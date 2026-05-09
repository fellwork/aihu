# @aihu/cli

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
