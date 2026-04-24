# scribe v0 — Plan A: TypeScript Runtime Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four TypeScript packages (`@scribe/signals`, `@scribe/arbor`, `@scribe/runtime`, `@scribe/agent`) that together let a developer hand-write reactive custom elements with signals, mount them in a browser, and retrieve static agent metadata — all within a ~4 KB gzipped bundle, with a full test pyramid running in CI.

**Architecture:** pnpm monorepo, four focused packages. `@scribe/signals` provides reactive primitives (signal, computed, effect). `@scribe/arbor` builds a persistent reactive tree (branch/leaf) on top of signals with lifecycle scopes. `@scribe/runtime` wires arbor into Web Components via `defineElement`. `@scribe/agent` exposes a static-metadata accessor. Every package is individually buildable, testable, and size-gated.

**Tech Stack:** Node 20+, pnpm 9+, TypeScript 5.5+, vitest 2+, fast-check 3+, jsdom 24+, tsup (package builds), size-limit (bundle gates), GitHub Actions (CI).

**Out of scope:** Rust crates, Vite plugin, SFC compiler, `.scribe` files, Playwright e2e. All of those land in Plans B and C.

---

## File Structure

```
fellwork/scribe/
├── package.json                        # workspace root; scripts, dev deps
├── pnpm-workspace.yaml                 # workspace definition
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

### Task 1: Initialize pnpm workspace root

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`

- [ ] **Step 1: Create `.nvmrc`**

Create file at `C:\git\scribe\.nvmrc`:
```
20.18.0
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

Create file at `C:\git\scribe\pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'tests'
```

- [ ] **Step 3: Create root `package.json`**

Create file at `C:\git\scribe\package.json`:
```json
{
  "name": "fellwork-scribe",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20.18.0"
  },
  "scripts": {
    "build": "pnpm -r --filter './packages/*' run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config tests/vitest.config.ts",
    "typecheck": "pnpm -r --filter './packages/*' run typecheck",
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

- [ ] **Step 4: Install dependencies**

Run: `cd /c/git/scribe && pnpm install`
Expected: Creates `node_modules/` and `pnpm-lock.yaml`. No packages yet so this just installs devDeps.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml .nvmrc pnpm-lock.yaml
git commit -m "chore: initialize pnpm workspace"
```

---

### Task 2: Root TypeScript config

**Files:**
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Create `tsconfig.base.json`**

Create file at `C:\git\scribe\tsconfig.base.json`:
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

- [ ] **Step 2: Create root `tsconfig.json`**

Create file at `C:\git\scribe\tsconfig.json`:
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["packages/*/src/**/*.ts", "packages/*/tests/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Verify TypeScript compiles nothing yet**

Run: `cd /c/git/scribe && pnpm exec tsc --noEmit`
Expected: Exits 0 with no errors (no source files yet).

- [ ] **Step 4: Commit**

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

- [ ] **Step 1: Create `.prettierrc`**

Create file at `C:\git\scribe\.prettierrc`:
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

- [ ] **Step 2: Create `.prettierignore`**

Create file at `C:\git\scribe\.prettierignore`:
```
node_modules
dist
coverage
pnpm-lock.yaml
target
```

- [ ] **Step 3: Create `.eslintrc.cjs`**

Create file at `C:\git\scribe\.eslintrc.cjs`:
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

- [ ] **Step 4: Create `.eslintignore`**

Create file at `C:\git\scribe\.eslintignore`:
```
node_modules
dist
coverage
target
*.cjs
```

- [ ] **Step 5: Run lint to verify clean start**

Run: `cd /c/git/scribe && pnpm lint`
Expected: Exits 0 (nothing to lint yet).

- [ ] **Step 6: Commit**

```bash
git add .eslintrc.cjs .prettierrc .prettierignore .eslintignore
git commit -m "chore: add lint and format config"
```

---

### Task 4: Root vitest config

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

Create file at `C:\git\scribe\vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/*/tests/**/*.test.ts'],
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

- [ ] **Step 2: Run vitest to verify config loads**

Run: `cd /c/git/scribe && pnpm test`
Expected: "No test files found" — exits 0 or with a "no tests" warning. Config loads without error.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add root vitest config with package aliases"
```

---

### Task 5: size-limit config and CI workflow

**Files:**
- Create: `.size-limit.json`
- Create: `.github/workflows/plan-a.yml`

- [ ] **Step 1: Create `.size-limit.json`**

Create file at `C:\git\scribe\.size-limit.json`:
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

- [ ] **Step 2: Create CI workflow**

Create file at `C:\git\scribe\.github\workflows\plan-a.yml`:
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
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - run: pnpm build
      - run: pnpm size
```

- [ ] **Step 3: Commit**

```bash
git add .size-limit.json .github/workflows/plan-a.yml
git commit -m "ci: add size-limit gate and Plan A workflow"
```

---

## Status checkpoint

Phase 1 (scaffolding) complete after Task 5. Repo has workspace tooling, lint/format, tests, builds, and CI. No source code yet. Remaining phases:

- **Phase 2:** `@scribe/signals` — reactive primitives (Tasks 6–11)
- **Phase 3:** `@scribe/arbor` — persistent reactive tree (Tasks 12–19)
- **Phase 4:** `@scribe/runtime` — WC wiring (Tasks 20–22)
- **Phase 5:** `@scribe/agent` — metadata registry (Tasks 23–24)
- **Phase 6:** Integration tests and bundle verification (Tasks 25–27)

*Phases 2–6 follow in the next document edits.*
