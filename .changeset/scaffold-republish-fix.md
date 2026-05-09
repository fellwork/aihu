---
"@aihu/router": patch
"@aihu/app": patch
"@aihu/cli": patch
---

Scaffold install path fixes.

`@aihu/cli`:
- `aihu app <name>` now emits `package.json` with `latest` ranges for all `@aihu/*` deps instead of the aspirational `^1.0.0` (no 1.x exists on npm; the old pins broke `bun install` immediately).
- Adds the missing `@aihu/app` (used by `src/main.ts`) and `@aihu/compiler` (used by `rolldown.config.ts`) to the generated dependency list.
- Drops the malformed `bun@1` `packageManager` fallback — detects bun via `globalThis.Bun?.version`, omits the field when no real version is detectable.
- Generates `.vscode/extensions.json` (recommends `fellwork.vscode-aihu`) and `.vscode/settings.json` (file association for `.aihu`) so new adopters get language support out of the box.

`@aihu/router`, `@aihu/app`:
- Republish so transitive pins point at clean versions. Previously `@aihu/router@0.1.1` pinned `@aihu/server@0.1.0` (carries the `workspace:*` leak) and `@aihu/app@0.1.4` peer-pinned `@aihu/router@0.1.0` (also leaked). Combined effect: `bun install` of any scaffolded app failed at the workspace-protocol resolution step. Both republish with deps targeting the post-leak versions.
