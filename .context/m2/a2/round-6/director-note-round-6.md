---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: director_note
layer: delta
round: 6
slug: aihu/delta/m2/a2/round-6/director-note-round-6
---

# Director Note — Round 6

## §1 Choice: EX-10 cf-adapter

**Chosen: EX-10 cf-adapter. EX-13 storefront is deferred to round 7.**

Rationale:

1. **No soft deps.** EX-10 is fully self-contained. The `@aihu/adapter-cloudflare` package (v0.1.10) already exists at `packages/adapter-cloudflare/`, exports `cloudflare()`, and has a passing unit-test suite. No cross-track A3 gating. EX-13 requires `createResourceSerializer` (with a documented fallback) and introduces `@aihu/data`/`createResource` for SSR-safe serialization — more surface area. Starting EX-10 now gives EX-13 one more round to let any A3 dust settle.

2. **Lower risk, higher confidence.** EX-10 is primarily a config-layer demo: one SFC, one `aihu.config.ts`, one `wrangler.toml`, a minimal `@agent` block, and a smoke test. The whole adapter API is already exercised in `packages/adapter-cloudflare/tests/`. The smoke test pattern (source-text reads + registry simulation) is identical to what rounds 1-5 delivered.

3. **Portfolio gap.** cf-adapter is the only Tier-3 example that demonstrates the adapter interface. It closes the `@aihu/adapter-cloudflare` coverage matrix entry (arch-2 §2 "File-based routing: 08-10, 13" and "@aihu/adapter-cloudflare: 10"). Delivering it now completes all non-blocked A2 examples except storefront.

4. **Branch continuity.** Builder stays on `feat/m2-a2-examples/ex-07-agent-hub`. Committing EX-10 to the same branch is consistent with how all prior A2 rounds landed (one branch, sequential commits). The branch name no longer matches the deliverable but that is harmless — it was already the case when EX-09, EX-12, and EX-07 all landed on it.

---

## §2 Key Research Findings

### What arch-2 §2 row 10 specifies for cf-adapter

- Slug: `cf-adapter`, Tier 3, Port 5110
- Key features: `cloudflare()` adapter, `wrangler.toml`, agent-readiness survives CF build
- Coverage matrix: `@aihu/adapter-cloudflare`, file-based routing
- arch-2 §4 mandatory files: `index.html`, `package.json`, `vite.config.ts`, `README.md`; additionally `aihu.config.ts` and `wrangler.toml` for adapter examples
- arch-2 §9.2: `agent-panel.aihu` stub badge must be visible (panel must be present)
- arch-2 §9.5: `examples/*/` excluded from `.size-limit.json`
- arch-2 §4 standard `package.json` shape: name `@aihu/example-cf-adapter`, port 5110, scripts dev/build/preview/test

### What is on disk

- `examples/cf-adapter/` — MISSING (greenfield)
- `examples/storefront/` — MISSING (deferred to round 7)
- `examples/_shared/` — EXISTS: `tokens.css`, `agent-panel.aihu`, `example-shell.aihu`, `macro-test.aihu`

### Available packages

- `@aihu/adapter-cloudflare` (workspace:*) at `packages/adapter-cloudflare/` — source at `src/index.ts`
  - Exports: `cloudflare(options?: CloudflareAdapterOptions): AihuAdapter`
  - Options: `name?`, `mode?: 'workers'|'pages'`, `generateWrangler?`, `ssr?`
  - Peer deps: `@aihu/app` (workspace:*), vite >=5.0.0
  - In SPA mode (default): emits `_worker.js` that proxies to `env.ASSETS`; optionally writes `wrangler.toml`
  - In SSR mode: emits `routes-manifest.js` + SSR-hybrid `_worker.js` with SSR→ASSETS→SPA fallback chain
- `@aihu/app` (workspace:*) — exports `defineConfig`, `viteAihuPlugin`, `AihuAdapter`, `AdapterContext`
- `@aihu/compiler` (workspace:*) — exports `aihuCompilerPlugin`
- `@aihu/agent` (workspace:*) — exports `registerAgentMetadata`, `getAllAgentMetadata`

### What the adapter does (smoke-test-relevant)

The `cloudflare()` call returns an `AihuAdapter` object with `name: 'cloudflare'` and an `adapt(context)` method. For the demo, Builder does NOT need to run the adapter at test time — the smoke test only needs to import the function, call it without arguments (or with `{ name: 'cf-adapter-demo' }`), and verify the returned object has the correct shape. No filesystem writes occur unless `adapt()` is called with a real context.

### cf-team template wrangler.toml

`packages/templates/cf-team/template/wrangler.toml.tmpl` provides a reference for a hand-written `wrangler.toml`. The demo example should have a simpler one that matches what `cloudflare()` auto-generates: `name`, `main = "_worker.js"`, `compatibility_date`, `[assets]` binding.

### Agent-readiness in CF build (arch-2 row 10 key feature)

"agent-readiness survives CF build" means the `@agent` block in the SFC is compiled to `registerAgentMetadata` calls before the CF adapter runs. This is a documentation/demo claim — the smoke test verifies the SFC source has an `@agent` block and the registry call works, not that wrangler actually deploys. The `agent-panel.aihu` is used per arch-2 §3 (mandatory in EX-06, 07, 10, 11).

---

## §3 Architectural Decisions

### Branch name

Stay on `feat/m2-a2-examples/ex-07-agent-hub`. Creating a new branch would require a PR merge + rebranch; not worth it for a single-file greenfield example. EX-13 may get its own branch if the scope warrants it.

### SFC design

One primary SFC: `src/cf-adapter-demo.aihu`. This is a Tier-3 demo so it needs:
- A human-readable UI: a card showing the worker name, deployment mode (SPA vs SSR), and a "Deploy" CTA (static, no real deploy)
- An `@agent` block with `$expose` and `$describe`
- `@style` with `var(--token)` only and `@media (max-width: 480px)`
- Import of `agent-panel` from `@shared` (rendered in the page via `example-shell`)

### aihu.config.ts

Demonstrates `cloudflare({ name: 'cf-adapter-demo', mode: 'workers' })` wired as adapter. Uses `defineConfig` from `@aihu/app`. This file is the primary artifact that justifies the example's existence.

### wrangler.toml

Hand-written (not auto-generated at test time). Matches the shape the adapter would generate: `name = "cf-adapter-demo"`, `main = "_worker.js"`, `compatibility_date = "2024-01-01"`, `[assets]` block. Included in smoke test source-text scan.

### Scope phasing

Round 6 = full EX-10 in one shot:
- `examples/cf-adapter/` directory scaffold
- `src/cf-adapter-demo.aihu` — main SFC with `@agent` + `@style`
- `aihu.config.ts` — adapter wiring
- `wrangler.toml` — CF config
- `vite.config.ts` — `aihuCompilerPlugin` + `@shared` alias + workspace aliases
- `package.json` — `@aihu/example-cf-adapter`, port 5110
- `index.html`
- `tests/smoke.test.ts` — 8 tests (source-text checks + registry simulation)
- `examples/README.md` — update cf-adapter row from placeholder to ready

EX-13 storefront deferred to round 7.

---

## §4 CSS + Iron Law Constraints (carry-forward)

All `@style` blocks in the new SFC must use `var(--token)` exclusively — zero hex fallbacks, zero `rgb()` hardcodes. The only permitted token source is `examples/_shared/tokens.css`; no new tokens may be invented. Every `@style` block must include an `@media (max-width: 480px)` responsive section (touch targets ≥ 44×44 px, inputs/buttons stacked vertically). The Iron Law: API-shape questions that are answerable from source (packages on disk, existing examples) must be self-resolved by Builder with an investigation page in `.context/m2/a2/round-6/builder-investigation-round6.md` — Builder proceeds without waiting for Director. Only scope/priority ambiguities are escalated. Do not break previously verified examples: live-counter (2), temperature-converter (3), timer (3), todo-mvc (7), color-theme (4), weather-card (15), blog-loader (8), realtime-scores (8), agent-hub (15).

---

## §5 Builder Brief

```
## Round 6 — EX-10 cf-adapter: Cloudflare Workers adapter demo

### Branch
`feat/m2-a2-examples/ex-07-agent-hub` (continue — no rebranch needed)

### Base SHA
bd1c450

### OVER-1 scope check command
`git log bd1c450..HEAD --name-only`

### Deliverable
Create `examples/cf-adapter/` from scratch. The example demonstrates:
1. `@aihu/adapter-cloudflare`'s `cloudflare()` adapter wired in `aihu.config.ts`
2. A matching `wrangler.toml` (hand-written, mirrors what the adapter auto-generates)
3. A single SFC `src/cf-adapter-demo.aihu` with `@agent` block + token-only CSS + responsive `@media`
4. 8 smoke tests (source-text + registry simulation, same harness as prior rounds)
5. `examples/README.md` — update cf-adapter row to "ready" with full description

---

### File manifest (all files to create/modify)

**NEW files:**

```
examples/cf-adapter/index.html
examples/cf-adapter/package.json
examples/cf-adapter/vite.config.ts
examples/cf-adapter/aihu.config.ts
examples/cf-adapter/wrangler.toml
examples/cf-adapter/src/cf-adapter-demo.aihu
examples/cf-adapter/tests/smoke.test.ts
.context/m2/a2/round-6/builder-investigation-round6.md   (pre-write gate)
.context/m2/a2/round-6/build-manifest-round-6.md         (post-commit)
```

**MODIFIED files:**

```
examples/README.md   (update cf-adapter row)
```

**DO NOT TOUCH:**
- Any file in `packages/`
- Root `package.json` or `.size-limit.json`
- Any file in other examples (except README.md table update)

---

### Pre-write gate

Before writing any file, read and record in `.context/m2/a2/round-6/builder-investigation-round6.md`:
1. `packages/adapter-cloudflare/src/index.ts` — confirm `cloudflare()` signature and return shape (`{ name: string, adapt(ctx): Promise<void> }`)
2. `packages/app/src/config.ts` — confirm `defineConfig` signature accepts `adapter:` key
3. `examples/_shared/tokens.css` — list all `var(--*)` tokens available (pick appropriate ones for the SFC: `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent`, `--agent-bg`, etc.)
4. `examples/agent-hub/src/hub-root.aihu` — confirm `@shared/agent-panel` import pattern
5. `examples/realtime-scores/tests/smoke.test.ts` — confirm `__resetRegistryForTesting` import path
6. `git log bd1c450..HEAD --name-only` — confirm scope is clean before writing

---

### `examples/cf-adapter/package.json`

```json
{
  "name": "@aihu/example-cf-adapter",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5110",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@aihu/adapter-cloudflare": "workspace:*",
    "@aihu/app": "workspace:*",
    "@aihu/agent": "workspace:*",
    "@aihu/compiler": "workspace:*"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "vitest": "^2.1.1"
  }
}
```

---

### `examples/cf-adapter/vite.config.ts`

```typescript
import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [aihuCompilerPlugin()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../_shared'),
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      '@aihu/adapter-cloudflare': resolve(__dirname, 'node_modules/@aihu/adapter-cloudflare'),
    },
  },
})
```

---

### `examples/cf-adapter/aihu.config.ts`

```typescript
import { defineConfig } from '@aihu/app'
import { cloudflare } from '@aihu/adapter-cloudflare'

export default defineConfig({
  adapter: cloudflare({ name: 'cf-adapter-demo', mode: 'workers' }),
})
```

---

### `examples/cf-adapter/wrangler.toml`

```toml
# Cloudflare Workers config for cf-adapter-demo.
# https://developers.cloudflare.com/workers/wrangler/configuration/
# This file mirrors what @aihu/adapter-cloudflare generates automatically.
# For real deploys: run `wrangler deploy --config wrangler.toml`

name = "cf-adapter-demo"
main = "_worker.js"
compatibility_date = "2024-01-01"

[assets]
directory = "."
binding = "ASSETS"
```

---

### `examples/cf-adapter/src/cf-adapter-demo.aihu`

The SFC must:
1. Use `@state` for: `workerName` (string, default `"cf-adapter-demo"`), `deployMode` (string, default `"workers"`)
2. Use `@computed` for: `statusLabel` — returns `"Ready to deploy"` (static demo, no real deploy state)
3. Use `@agent` block with:
   - `$describe "Cloudflare Workers adapter demo: shows adapter config and worker metadata"`
   - `$expose state.workerName, state.deployMode`
4. Use `@style` block:
   - All colors via `var(--*)` tokens only — NO hex, NO rgb hardcodes
   - Include `@media (max-width: 480px)` section stacking card content vertically
   - Tokens to use: `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent` (confirm exact names from `examples/_shared/tokens.css`)
5. Template (`@template`):
   - Render the `<example-shell>` from `@shared/example-shell` wrapping the card
   - Card shows: worker name, deploy mode badge, status label
   - Include `<agent-panel>` from `@shared/agent-panel`

Stub note requirement (arch-2 §9.2): The agent-panel's "Tool call stubbed — live binding pending" badge will be visible — no additional stub text needed in the SFC body itself, but a README.md note is required (see below).

---

### `examples/cf-adapter/index.html`

Standard shell matching other examples (see `examples/agent-hub/index.html` as template). Mount tag: `<cf-adapter-demo>`.

---

### `examples/cf-adapter/tests/smoke.test.ts`

8 tests, same harness pattern as prior rounds. Source-text checks for the SFC + aihu.config.ts + wrangler.toml, plus one registry simulation test:

```
A6-1: cf-adapter-demo.aihu source contains `@agent`
A6-2: cf-adapter-demo.aihu source contains `$expose`
A6-3: cf-adapter-demo.aihu source contains `workerName`
A6-4: cf-adapter-demo.aihu source contains `@media (max-width: 480px)`
A6-5: aihu.config.ts source contains `cloudflare(`
A6-6: aihu.config.ts source contains `cf-adapter-demo`
A6-7: wrangler.toml source contains `name = "cf-adapter-demo"`
A6-8: registerAgentMetadata() for cf-adapter-demo can be called without throwing
       (registry simulation — same pattern as prior rounds)
```

Import `__resetRegistryForTesting` from `'../../../packages/agent/src/registry.ts'` with `@ts-expect-error`.

For A6-8, register:
```typescript
registerAgentMetadata({
  tag: 'cf-adapter-demo',
  describes: 'EX-10: Cloudflare Workers adapter demo — aihu.config.ts + wrangler.toml',
  state: {
    workerName: 'Cloudflare Worker name, default "cf-adapter-demo"',
    deployMode: 'Deployment mode: "workers" or "pages"',
  },
  actions: {
    getConfig: { returns: {} },
  },
})
```

---

### `examples/README.md` update

Find the cf-adapter row in the table (currently a placeholder or "MISSING"). Update to:
```
| EX-10 | `cf-adapter` | 3 | `cloudflare()` adapter, `wrangler.toml`, agent-readiness in CF build | 5110 | ready |
```
Match the exact column format of adjacent rows.

---

### Iron Law reminder

- API-shape questions answerable from source → self-resolve via investigation page, proceed.
- No scope/priority questions to the Director — this note defines the full scope.
- If `defineConfig` in `@aihu/app` does NOT accept an `adapter:` key at the TypeScript level (confirm in pre-write gate), use a `// @ts-ignore` with a comment "adapter key — see arch-2 §2 EX-10, wiring pending full meta-framework integration" and proceed.
- Do NOT add any row to `.size-limit.json`.
- Do NOT modify root `package.json`.

---

### Commit

Single commit on branch `feat/m2-a2-examples/ex-07-agent-hub`:
```
feat(examples): add EX-10 cf-adapter — Cloudflare Workers adapter demo
```

---

### After commit: write build-manifest

Write `.context/m2/a2/round-6/build-manifest-round-6.md` with:
- YAML header (topic/track/kind/layer/round/slug)
- Files touched table
- Commit SHA
- Acceptance criteria outcomes (A6-1 through A6-8 + do-not-break checks)
- `git log bd1c450..HEAD --name-only` output
- STATUS: DONE
```

---

## §6 Verifier Sketch (round-6.5 checklist)

The Verifier in round 6.5 must check all of the following before writing the build manifest:

**V1: Directory structure**
- `examples/cf-adapter/` exists with: `index.html`, `package.json`, `vite.config.ts`, `aihu.config.ts`, `wrangler.toml`, `src/cf-adapter-demo.aihu`, `tests/smoke.test.ts`

**V2: Source-text spot checks (grep)**
- `grep -c "@agent" examples/cf-adapter/src/cf-adapter-demo.aihu` → ≥ 1
- `grep -c "\$expose" examples/cf-adapter/src/cf-adapter-demo.aihu` → ≥ 1
- `grep -c "@media (max-width: 480px)" examples/cf-adapter/src/cf-adapter-demo.aihu` → ≥ 1
- `grep -cE "#[0-9a-fA-F]{3,6}" examples/cf-adapter/src/cf-adapter-demo.aihu` → 0
- `grep -c "cloudflare(" examples/cf-adapter/aihu.config.ts` → ≥ 1
- `grep -c "cf-adapter-demo" examples/cf-adapter/aihu.config.ts` → ≥ 1
- `grep -c 'name = "cf-adapter-demo"' examples/cf-adapter/wrangler.toml` → ≥ 1

**V3: Smoke test**
- `cd examples/cf-adapter && bun run test` → 8 tests pass, 0 fail

**V4: Do-not-break**
Run smoke tests for all previously verified examples and confirm expected counts:
- `cd examples/live-counter && bun run test` → Tests 2 passed (2)
- `cd examples/temperature-converter && bun run test` → Tests 3 passed (3)
- `cd examples/timer && bun run test` → Tests 3 passed (3)
- `cd examples/todo-mvc && bun run test` → Tests 7 passed (7)
- `cd examples/color-theme && bun run test` → Tests 4 passed (4)
- `cd examples/weather-card && bun run test` → Tests 15 passed (15)
- `cd examples/blog-loader && bun run test` → Tests 8 passed (8)
- `cd examples/realtime-scores && bun run test` → Tests 8 passed (8)
- `cd examples/agent-hub && bun run test` → Tests 15 passed (15)

**V5: No forbidden changes**
- `git show bd1c450..HEAD -- package.json .size-limit.json` → no output (no root changes)
- `git log bd1c450..HEAD --name-only` → all changed files under `examples/cf-adapter/` or `examples/README.md` or `.context/m2/a2/round-6/`

**V6: README.md update**
- `grep -c "cf-adapter" examples/README.md` → ≥ 1

---

## §7 STATUS

STATUS: DONE (ready to dispatch)

- Example chosen: EX-10 cf-adapter
- EX-13 storefront: deferred to round 7
- EX-11 plugin-demo: remains blocked on D-A2-EX-11-INTERFACE
- Branch: `feat/m2-a2-examples/ex-07-agent-hub` (continue)
- Base SHA for OVER-1: `bd1c450`
