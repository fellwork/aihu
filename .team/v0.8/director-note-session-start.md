# Director Note — v0.8 Session Start

**Date:** 2026-05-03
**Round:** v0.8 kickoff
**Mode:** Mode 2 (Build) — single TypeScript Builder stream
**Gate state at entry:** main `4128169` — 209 Rust / 534 TS tests green; all 8 size rows pass

---

## Substance direction

v0.8 = `@aihu/cli` package (build-time only; zero runtime size impact).

**Do NOT start a Vite dev server or attempt browser testing.** The acceptance
criterion says "produces a running Hello World", but `bun run dev` requires
network/Vite and is out of scope for this session. The concrete testable bar is:

1. The CLI scaffolds the correct file tree.
2. Tests verify file content and structure programmatically.
3. `bun run test` stays green.
4. `bun run build` stays green (no new size rows needed — CLI is build-time only).

---

## Sub-items in scope

### v0.8.1 — `@aihu/cli` package

New `packages/cli/` package. Binary entry: `packages/cli/src/bin.ts`.

**CLI commands:**
- `aihu app <name>` — scaffold a new app (Hello World template)
- `aihu page <route>` — add a new page to an existing project
- `aihu component <name>` — scaffold a single `.aihu` component
- `aihu plugin <name>` — scaffold a plugin npm package skeleton
- `aihu migrate` — auto-convert v0.1.x SFC HTML-tag syntax to `@blockname {}` format

CLI arg parsing: stdlib-only (`process.argv`); no external CLI libraries (v3 dep-free thesis).

`package.json` for `@aihu/cli`:
```json
{
  "name": "@aihu/cli",
  "version": "0.8.0",
  "bin": { "aihu": "./dist/bin.js" },
  "type": "module",
  "exports": { ".": "./dist/index.js" },
  "dependencies": {},
  "devDependencies": {}
}
```
No runtime dependencies of any kind (build-time tool). No size limit row needed.

### v0.8.2 — Hello World template

`aihu app <name>` produces this file tree:
```
<name>/
  package.json
  aihu.config.ts
  vite.config.ts
  src/
    pages/
      index.aihu
    layouts/
      default.aihu
```

**`package.json` content** (in the generated app):
```json
{
  "name": "<name>",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@aihu/server": "latest",
    "@aihu/router": "latest",
    "@aihu/runtime": "latest",
    "@aihu/arbor": "latest",
    "@aihu/signals": "latest",
    "@aihu/agent": "latest"
  },
  "devDependencies": {
    "@aihu/cli": "latest",
    "vite": "^5.0.0"
  }
}
```

**`aihu.config.ts`** (in the generated app):
```ts
import { defineAihuConfig } from '@aihu/server'
import { data } from '@aihu/data'
import { agent } from '@aihu/agent-service'

export default defineAihuConfig({
  build: { target: 'universal' },
  plugins: [data(), agent()],
})
```

**`vite.config.ts`** (in the generated app):
```ts
import { defineConfig } from 'vite'
import { viteRouterIntegration } from '@aihu/router'
import { viteAgentReadinessIntegration } from '@aihu/agent-readiness'

export default defineConfig({
  plugins: [
    viteRouterIntegration(),
    viteAgentReadinessIntegration(),
  ],
})
```

**`src/pages/index.aihu`**:
```
@state {
  $prop name: string = 'world'
}

@template {
  <div>Hello {{ name }}</div>
}

@route {
  path: /
  name: home
}
```

**`src/layouts/default.aihu`**:
```
@template {
  <slot />
}
```

### v0.8.3 — First-run UX (documented, not executed)

The template itself IS the first-run UX deliverable. The `aihu app` command
should print a post-scaffold message:

```
✓ Created <name>/
  cd <name>
  bun install
  bun run dev
```

### v0.8.4 — Light-off procedure docs

A `docs/cli.md` file (in the repo, not a separate site) covering:
- Prerequisites: Bun ≥1.0 or Node ≥18
- `npx aihu app my-app` walkthrough
- What each generated file does
- The dev → build → preview cycle
- `aihu migrate` usage for v0.1.x consumers

### v0.8.5 — Plugin scaffold template

`aihu plugin <name>` produces:
```
<name>/
  package.json
  src/
    index.ts
```

**`package.json`** (in the generated plugin):
```json
{
  "name": "<name>",
  "type": "module",
  "exports": { ".": "./dist/index.js" },
  "peerDependencies": {
    "@aihu/plugin": "latest"
  }
}
```

**`src/index.ts`** (in the generated plugin):
```ts
import { definePlugin } from '@aihu/plugin'

export default definePlugin({
  name: '<name>',
  version: '0.1.0',
  namespace: '<name>',
  contributes: {},
})
```

### `aihu migrate` (deprecation policy sub-item)

Auto-converts HTML-tag form SFCs to `@blockname {}` format:
- `<script setup>` → `@state { ... }`
- `<template>` → `@template { ... }`
- `<style>` → `@style { ... }`
- `<agent>` → `@agent { ... }`

Input: one or more `.aihu` file paths (or a glob). Output: rewrites in-place
with `@blockname {}` blocks. Dry-run flag: `--dry-run` (prints diff, no writes).

---

## Acceptance criteria (testable in this session)

1. `packages/cli/src/bin.ts` + `packages/cli/src/index.ts` exist and compile.
2. `aihu app <name>` produces all 6 expected files in a temp dir.
3. `aihu page <route>` adds a page file at the correct path.
4. `aihu component <name>` produces a `.aihu` file.
5. `aihu plugin <name>` produces the plugin skeleton.
6. `aihu migrate` converts HTML-tag form blocks to `@blockname {}` form.
7. TS tests covering the above: at minimum one test per CLI command.
8. `bun run test` stays at ≥534 passing (new tests only increase count).
9. `bun run build` stays green (no size failures).
10. No new non-`@aihu/*` runtime dependencies.

---

## Safety constraints

- **Do NOT** add `@aihu/cli` to the size-limit config — it is build-time only.
- **Do NOT** add external libraries (no `commander`, `yargs`, `chalk`, etc.).
  Use `process.argv`, `process.stdout.write`, template literals, and `fs`/`path`.
- Branch: `feat/v0.8-cli-scaffolder`
- Tests go in: `packages/cli/tests/` (vitest)
- Include `packages/cli/` in the workspace `packages` array in root `package.json`.

---

## Guidance on scope boundary

v0.8 does NOT need:
- An actual working Vite build of the generated app (that requires consumers' infra)
- A published npm package flow
- Integration with the Rust compiler (build-time only)

The `aihu migrate` tool only needs to handle the 4 HTML-tag block renames.
Edge-case SFC syntax variations are out of scope for v0.8.

---

## Test count target

534 (current) + 15 minimum new CLI tests = 549 minimum at gate.
