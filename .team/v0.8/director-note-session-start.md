# Director Note — v0.8 Session Start

**Date:** 2026-05-03
**Round:** v0.8 kickoff
**Mode:** Mode 2 (Build) — single TypeScript Builder stream
**Gate state at entry:** main `4128169` — 209 Rust / 534 TS tests green; all 8 size rows pass

---

## Substance direction

v0.8 = `@scribe/cli` package (build-time only; zero runtime size impact).

**Do NOT start a Vite dev server or attempt browser testing.** The acceptance
criterion says "produces a running Hello World", but `bun run dev` requires
network/Vite and is out of scope for this session. The concrete testable bar is:

1. The CLI scaffolds the correct file tree.
2. Tests verify file content and structure programmatically.
3. `bun run test` stays green.
4. `bun run build` stays green (no new size rows needed — CLI is build-time only).

---

## Sub-items in scope

### v0.8.1 — `@scribe/cli` package

New `packages/cli/` package. Binary entry: `packages/cli/src/bin.ts`.

**CLI commands:**
- `scribe app <name>` — scaffold a new app (Hello World template)
- `scribe page <route>` — add a new page to an existing project
- `scribe component <name>` — scaffold a single `.scribe` component
- `scribe plugin <name>` — scaffold a plugin npm package skeleton
- `scribe migrate` — auto-convert v0.1.x SFC HTML-tag syntax to `@blockname {}` format

CLI arg parsing: stdlib-only (`process.argv`); no external CLI libraries (v3 dep-free thesis).

`package.json` for `@scribe/cli`:
```json
{
  "name": "@scribe/cli",
  "version": "0.8.0",
  "bin": { "scribe": "./dist/bin.js" },
  "type": "module",
  "exports": { ".": "./dist/index.js" },
  "dependencies": {},
  "devDependencies": {}
}
```
No runtime dependencies of any kind (build-time tool). No size limit row needed.

### v0.8.2 — Hello World template

`scribe app <name>` produces this file tree:
```
<name>/
  package.json
  scribe.config.ts
  vite.config.ts
  src/
    pages/
      index.scribe
    layouts/
      default.scribe
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
    "@scribe/server": "latest",
    "@scribe/router": "latest",
    "@scribe/runtime": "latest",
    "@scribe/arbor": "latest",
    "@scribe/signals": "latest",
    "@scribe/agent": "latest"
  },
  "devDependencies": {
    "@scribe/cli": "latest",
    "vite": "^5.0.0"
  }
}
```

**`scribe.config.ts`** (in the generated app):
```ts
import { defineScribeConfig } from '@scribe/server'
import { data } from '@scribe/data'
import { agent } from '@scribe/agent-service'

export default defineScribeConfig({
  build: { target: 'universal' },
  plugins: [data(), agent()],
})
```

**`vite.config.ts`** (in the generated app):
```ts
import { defineConfig } from 'vite'
import { viteRouterIntegration } from '@scribe/router'
import { viteAgentReadinessIntegration } from '@scribe/agent-readiness'

export default defineConfig({
  plugins: [
    viteRouterIntegration(),
    viteAgentReadinessIntegration(),
  ],
})
```

**`src/pages/index.scribe`**:
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

**`src/layouts/default.scribe`**:
```
@template {
  <slot />
}
```

### v0.8.3 — First-run UX (documented, not executed)

The template itself IS the first-run UX deliverable. The `scribe app` command
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
- `npx scribe app my-app` walkthrough
- What each generated file does
- The dev → build → preview cycle
- `scribe migrate` usage for v0.1.x consumers

### v0.8.5 — Plugin scaffold template

`scribe plugin <name>` produces:
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
    "@scribe/plugin": "latest"
  }
}
```

**`src/index.ts`** (in the generated plugin):
```ts
import { definePlugin } from '@scribe/plugin'

export default definePlugin({
  name: '<name>',
  version: '0.1.0',
  namespace: '<name>',
  contributes: {},
})
```

### `scribe migrate` (deprecation policy sub-item)

Auto-converts HTML-tag form SFCs to `@blockname {}` format:
- `<script setup>` → `@state { ... }`
- `<template>` → `@template { ... }`
- `<style>` → `@style { ... }`
- `<agent>` → `@agent { ... }`

Input: one or more `.scribe` file paths (or a glob). Output: rewrites in-place
with `@blockname {}` blocks. Dry-run flag: `--dry-run` (prints diff, no writes).

---

## Acceptance criteria (testable in this session)

1. `packages/cli/src/bin.ts` + `packages/cli/src/index.ts` exist and compile.
2. `scribe app <name>` produces all 6 expected files in a temp dir.
3. `scribe page <route>` adds a page file at the correct path.
4. `scribe component <name>` produces a `.scribe` file.
5. `scribe plugin <name>` produces the plugin skeleton.
6. `scribe migrate` converts HTML-tag form blocks to `@blockname {}` form.
7. TS tests covering the above: at minimum one test per CLI command.
8. `bun run test` stays at ≥534 passing (new tests only increase count).
9. `bun run build` stays green (no size failures).
10. No new non-`@scribe/*` runtime dependencies.

---

## Safety constraints

- **Do NOT** add `@scribe/cli` to the size-limit config — it is build-time only.
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

The `scribe migrate` tool only needs to handle the 4 HTML-tag block renames.
Edge-case SFC syntax variations are out of scope for v0.8.

---

## Test count target

534 (current) + 15 minimum new CLI tests = 549 minimum at gate.
