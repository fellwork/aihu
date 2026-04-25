# scribe v0 — Plan A: TypeScript Runtime Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four TypeScript packages (`@scribe/signals`, `@scribe/arbor`, `@scribe/runtime`, `@scribe/agent`) that together let a developer hand-write reactive custom elements with signals, mount them in a browser, and retrieve static agent metadata — all within a ~4 KB gzipped bundle, with a full test pyramid running in CI.

**Architecture:** bun workspace orchestrated by [moon](https://moonrepo.dev), four focused packages. `@scribe/signals` provides reactive primitives (signal, computed, effect). `@scribe/arbor` builds a persistent reactive tree (branch/leaf) on top of signals with lifecycle scopes. `@scribe/runtime` wires arbor into Web Components via `defineElement`. `@scribe/agent` exposes a static-metadata accessor. Every package is individually buildable, testable, and size-gated.

**Tech Stack:** [proto](https://moonrepo.dev/proto) toolchain manager pinning bun 1.3+ and node 20.18+, [moon](https://moonrepo.dev) for cross-package task orchestration, TypeScript 5.5+, vitest 2+, fast-check 3+, jsdom 24+, tsup (package builds), size-limit (bundle gates), GitHub Actions (CI).

**Out of scope:** Rust crates, Vite plugin, SFC compiler, `.scribe` files, Playwright e2e. All of those land in Plans B and C.

---

## File Structure

```
fellwork/scribe/
├── package.json                        # workspace root; bun workspaces, scripts, dev deps
├── bun.lock                            # bun lockfile
├── .prototools                         # proto-pinned bun + node versions
├── .moon/
│   ├── workspace.yml                   # moon project graph
│   ├── toolchain.yml                   # moon toolchain (bun)
│   └── tasks.yml                       # shared build/typecheck tasks
├── tsconfig.base.json                  # shared TS config
├── .size-limit.json                    # bundle-size CI gate config
├── .eslintrc.cjs                       # lint config
├── .prettierrc                         # format config
├── vitest.config.ts                    # root test config (coverage, aliases)
├── .github/
│   └── workflows/
│       └── plan-a.yml                  # CI workflow for TS runtime family
├── packages/
│   ├── signals/
│   │   ├── package.json                # @scribe/signals
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                # public exports
│   │   │   ├── signal.ts               # signal() primitive
│   │   │   ├── effect.ts               # effect() + dep tracking
│   │   │   ├── computed.ts             # computed() memoized derivations
│   │   │   ├── state.ts                # $state runes-style sugar
│   │   │   └── errors.ts               # SignalError, cycle detection
│   │   └── tests/
│   │       ├── signal.test.ts
│   │       ├── effect.test.ts
│   │       ├── computed.test.ts
│   │       ├── state.test.ts
│   │       └── properties.test.ts      # fast-check invariants
│   ├── arbor/
│   │   ├── package.json                # @scribe/arbor
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                # public exports
│   │   │   ├── types.ts                # Branch, Leaf, AttrMap, ChildList
│   │   │   ├── leaf.ts                 # leaf() + leaf.element()
│   │   │   ├── branch.ts               # branch()
│   │   │   ├── mount.ts                # mount(), MountScope, dispose
│   │   │   ├── attrs.ts                # signal-to-DOM attr bindings
│   │   │   ├── structural.ts           # when()/each() stubs
│   │   │   └── errors.ts               # ArborError
│   │   └── tests/
│   │       ├── leaf.test.ts
│   │       ├── branch.test.ts
│   │       ├── mount.test.ts
│   │       ├── attrs.test.ts
│   │       ├── structural.test.ts
│   │       └── bench.test.ts           # 10k-leaves microbenchmark
│   ├── runtime/
│   │   ├── package.json                # @scribe/runtime
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                # public exports
│   │   │   ├── define-element.ts       # defineElement(spec)
│   │   │   └── types.ts                # ElementSpec, shadow modes
│   │   └── tests/
│   │       └── define-element.test.ts
│   └── agent/
│       ├── package.json                # @scribe/agent
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       ├── src/
│       │   ├── index.ts
│       │   ├── registry.ts             # registerAgentMetadata, getAgentMetadata
│       │   └── types.ts                # AgentMetadata type
│       └── tests/
│           └── registry.test.ts
└── tests/
    └── integration/
        ├── mount-arbor-with-signals.test.ts
        └── define-element-integration.test.ts
```

---

## Phase 1 — Workspace Scaffolding

> **Toolchain note:** versions are pinned by [proto](https://moonrepo.dev/proto) via `.prototools`. Cross-package task orchestration is handled by [moon](https://moonrepo.dev). Package management uses [bun](https://bun.sh) workspaces. There is no `pnpm-workspace.yaml`, no `.nvmrc`, no `pnpm-lock.yaml`.

### Task 1: Initialize bun workspace with proto-pinned toolchain

**Files:**
- Create: `.prototools`
- Create: `package.json`
- Create: `bun.lock` (generated by `bun install`)
- Create: `.moon/workspace.yml`, `.moon/toolchain.yml` (via `moon init`)

**Prerequisite:** `proto`, `bun`, and `moon` must be on PATH. With proto installed, `proto install` will read `.prototools` once written.

- [x] **Step 1: Create `.prototools`**

```toml
bun = "1.3.8"
node = "20.18.0"
```

- [x] **Step 2: Create root `package.json`**

```json
{
  "name": "fellwork-scribe",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "engines": {
    "bun": ">=1.3.0",
    "node": ">=20.18.0"
  },
  "scripts": {
    "build": "moon run :build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config tests/vitest.config.ts",
    "typecheck": "moon run :typecheck",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write .",
    "size": "size-limit"
  },
  "devDependencies": {
    "@size-limit/preset-small-lib": "^11.1.6",
    "@types/node": "^20.16.5",
    "@typescript-eslint/eslint-plugin": "^8.8.0",
    "@typescript-eslint/parser": "^8.8.0",
    "eslint": "^8.57.1",
    "eslint-config-prettier": "^9.1.0",
    "fast-check": "^3.22.0",
    "jsdom": "^25.0.1",
    "prettier": "^3.3.3",
    "size-limit": "^11.1.6",
    "tsup": "^8.3.0",
    "typescript": "^5.6.2",
    "vitest": "^2.1.1"
  }
}
```

> Note: the `tests/` directory is **not** a bun workspace member; it's picked up by `vitest.config.ts` directly. Bun errors if a workspace path doesn't exist.

- [x] **Step 3: Install dependencies**

Run: `bun install`
Expected: Creates `node_modules/` and `bun.lock`. Workspaces glob matches no packages yet, so only root devDeps install.

- [x] **Step 4: Initialize moon workspace**

Run: `moon init --yes --minimal`
Then edit `.moon/workspace.yml` so `vcs.defaultBranch` is `"main"` (moon defaults to the current branch, which may not be main during feature work).
Add `.moon/toolchain.yml`:
```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/toolchain.json
bun:
  version: "1.3.8"
```

- [x] **Step 5: Commit**

```bash
git add .prototools package.json bun.lock
git commit -m "chore: initialize bun workspace with proto-pinned toolchain"
git add .moon/ package.json
git commit -m "chore: add moon workspace config for task orchestration"
```

---

### Task 2: Root TypeScript config

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`

- [x] **Step 1: Create `tsconfig.base.json`**

Create file at the repo root:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  }
}
```

- [x] **Step 2: Create root `tsconfig.json`**

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["packages/*/src/**/*.ts", "packages/*/tests/**/*.ts", "tests/**/*.ts"]
}
```

- [x] **Step 3: Skip verification until Phase 2**

`bunx tsc --noEmit` errors with `TS18003: No inputs were found` until the first package lands. Config itself is valid; the verification step happens at the end of Task 6 when `@scribe/signals/src/index.ts` exists.

- [x] **Step 4: Commit**

```bash
git add tsconfig.base.json tsconfig.json
git commit -m "chore: add root TypeScript config"
```

---

### Task 3: Lint and format config

**Files:**
- Create: `.eslintrc.cjs`
- Create: `.prettierrc`
- Create: `.prettierignore`
- Create: `.eslintignore`

- [x] **Step 1: Create `.prettierrc`**
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

- [x] **Step 2: Create `.prettierignore`**

```
node_modules
dist
coverage
pnpm-lock.yaml
bun.lock
target
```

- [x] **Step 3: Create `.eslintrc.cjs`**
```cjs
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  ignorePatterns: ['dist', 'node_modules', 'coverage', 'target'],
}
```

- [x] **Step 4: Create `.eslintignore`**

```
node_modules
dist
coverage
target
*.cjs
```

- [x] **Step 5: Skip verification until Phase 2**

`bun run lint` errors with `No files matching the pattern "." were found` until packages exist. Config itself is valid; defer verification to Task 6.

- [x] **Step 6: Commit**

```bash
git add .eslintrc.cjs .prettierrc .prettierignore .eslintignore
git commit -m "chore: add lint and format config"
```

---

### Task 4: Root vitest config

**Files:**
- Create: `vitest.config.ts`

- [x] **Step 1: Create `vitest.config.ts`**

> Includes `passWithNoTests: true` so `bun run test` exits 0 in the empty workspace state. Remove this flag (or leave it — it's harmless) once tests exist.

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/*/tests/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@scribe/signals': new URL('./packages/signals/src/index.ts', import.meta.url).pathname,
      '@scribe/arbor': new URL('./packages/arbor/src/index.ts', import.meta.url).pathname,
      '@scribe/runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
      '@scribe/agent': new URL('./packages/agent/src/index.ts', import.meta.url).pathname,
    },
  },
})
```

- [x] **Step 2: Run vitest to verify config loads**

Run: `bun run test`
Expected: "No test files found, exiting with code 0" — config loads without error.

- [x] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add root vitest config with package aliases"
```

---

### Task 5: size-limit config, shared moon tasks, and CI workflow

**Files:**
- Create: `.size-limit.json`
- Create: `.moon/tasks.yml`
- Create: `.github/workflows/plan-a.yml`

- [x] **Step 1: Create `.size-limit.json`**
```json
[
  {
    "name": "@scribe/signals",
    "path": "packages/signals/dist/index.js",
    "limit": "1024 B",
    "gzip": true
  },
  {
    "name": "@scribe/arbor",
    "path": "packages/arbor/dist/index.js",
    "limit": "2048 B",
    "gzip": true
  },
  {
    "name": "@scribe/runtime",
    "path": "packages/runtime/dist/index.js",
    "limit": "1024 B",
    "gzip": true
  },
  {
    "name": "@scribe/agent",
    "path": "packages/agent/dist/index.js",
    "limit": "512 B",
    "gzip": true
  },
  {
    "name": "Combined runtime family",
    "path": [
      "packages/signals/dist/index.js",
      "packages/arbor/dist/index.js",
      "packages/runtime/dist/index.js",
      "packages/agent/dist/index.js"
    ],
    "limit": "4096 B",
    "gzip": true
  }
]
```

- [x] **Step 2: Create shared moon tasks**

Create `.moon/tasks.yml`. These tasks are inherited by every project under `packages/*` so per-package `moon.yml` files only need overrides:
```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/tasks.json
fileGroups:
  sources:
    - "src/**/*"
  tests:
    - "tests/**/*"
  configs:
    - "tsconfig.json"
    - "tsup.config.ts"

tasks:
  build:
    command: "tsup"
    inputs:
      - "@group(sources)"
      - "@group(configs)"
      - "package.json"
    outputs:
      - "dist"
    deps:
      - "^:build"

  typecheck:
    command: "tsc --noEmit"
    inputs:
      - "@group(sources)"
      - "@group(tests)"
      - "@group(configs)"
```

- [x] **Step 3: Create CI workflow**

`moonrepo/setup-toolchain@v0` installs both proto and moon, then `auto-install: true` reads `.prototools` and installs bun + node. One step replaces the previous pnpm/setup-node combo.

```yaml
name: Plan A — TS runtime family
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: moonrepo/setup-toolchain@v0
        with:
          auto-install: true
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test --coverage
      - run: bun run build
      - run: bun run size
```

- [x] **Step 4: Commit**

```bash
git add .size-limit.json .github/workflows/plan-a.yml
git commit -m "ci: add size-limit gate and Plan A workflow"
git add .moon/tasks.yml
git commit -m "chore(moon): add shared build and typecheck tasks"
```

---

## Status checkpoint

Phase 1 (scaffolding) **complete** on branch `plan-a-phase-1`. Repo has workspace tooling, lint/format, tests, builds, and CI wired through bun + proto + moon. No source code yet. Remaining phases:

- **Phase 2:** `@scribe/signals` — reactive primitives (Tasks 6–11)
- **Phase 3:** `@scribe/arbor` — persistent reactive tree (Tasks 12–19)
- **Phase 4:** `@scribe/runtime` — WC wiring (Tasks 20–22)
- **Phase 5:** `@scribe/agent` — metadata registry (Tasks 23–24)
- **Phase 6:** Integration tests and bundle verification (Tasks 25–27)

### Toolchain conventions for Phases 2–6

When detailed task content for Phases 2–6 is authored, the following toolchain conventions apply (replacing all pnpm/`.nvmrc` references in the original plan draft):

- **Per-package `package.json`** — declare scripts only as escape hatches. Build/typecheck flow through moon, not bun's `--filter`. Each `packages/<name>/package.json` should set `"name": "@scribe/<name>"` and a peer/dev dep on workspace siblings via `"workspace:*"`.
- **Per-package `moon.yml`** — minimal; inherits `build` and `typecheck` from `.moon/tasks.yml`. Only override when a package needs custom inputs/outputs (e.g. `arbor` if it adds bench tasks).
- **Adding a dep** — `bun add -D <pkg>` at the root for shared dev deps; `bun add --filter @scribe/<name> <pkg>` for package-scoped deps.
- **Running a single package's tasks** — `moon run signals:build`, `moon run arbor:typecheck`, etc.
- **Tests** — root-level vitest already discovers `packages/*/tests/**/*.test.ts`. No per-package test task needed unless a package wants its own config.
- **CI** — already covers lint → typecheck → test → build → size via root scripts; no workflow change needed when packages land.

*Phases 2–6 follow in the next document edits.*
