---
topic: aihu-m2-a2
track: aihu-m2-a2
kind: investigation
layer: delta
round: 6
slug: aihu/delta/m2/a2/round-6/builder-investigation-round6
---

# Builder Investigation — Round 6 (EX-10 cf-adapter)

## Check 1: packages/adapter-cloudflare/src/index.ts

`cloudflare()` IS exported (line 193):

```ts
export function cloudflare(options?: CloudflareAdapterOptions): AihuAdapter {
  return {
    name: 'cloudflare',
    async adapt(context: AdapterContext): Promise<void> { ... }
  }
}
```

Return shape: `{ name: 'cloudflare', adapt(context: AdapterContext): Promise<void> }` — conforms to `AihuAdapter`.

Options accepted: `name?: string`, `mode?: 'workers' | 'pages'`, `generateWrangler?: boolean`, `ssr?: boolean`.

STATUS: CONFIRMED — proceed.

## Check 2: packages/app/src/config.ts — defineConfig + adapter key

`defineConfig` IS exported (line 159). The `AihuConfig` interface (line 82) DOES contain the `adapter` key (line 126):

```ts
readonly adapter?: AihuAdapter
```

No `// @ts-ignore` needed — the key exists in the TypeScript type. `defineConfig` accepts `adapter: cloudflare(...)` without any workaround.

STATUS: CONFIRMED — no ts-ignore needed.

## Check 3: examples/_shared/tokens.css — available token names

Confirmed available tokens:
- `--bg` (#ffffff / #0d1117)
- `--fg` (#1a1a1a / #e6edf3)
- `--muted` (#666666 / #8b949e)
- `--border` (#e2e8f0 / #30363d)
- `--accent` (#7c3aed / #a78bfa)
- `--hover-bg` (#f8f5ff / #161b22)
- `--code-bg` (#f6f8fa / #161b22)
- `--btn-bg` (#f1f5f9 / #21262d)
- `--header-h` (60px)
- `--panel-bg` (#f8fafc / #161b22)
- `--input-bg` (#ffffff / #21262d)
- `--tag-bg` (#ede9fe / #2d1f69)
- `--tag-fg` (#5b21b6 / #c4b5fd)
- `--focus-ring` (#7c3aed / #a78bfa)
- `--success` (#15803d / #4ade80)
- `--success-bg` (#f0fdf4 / #052e16)
- `--error` (#b91c1c / #f87171)
- `--error-bg` (#fef2f2 / #450a0a)
- `--card-shadow`
- `--radius` (6px)
- `--max-w` (640px)
- `--agent-bg` (#faf5ff / #1e1333)
- `--agent-border` (#c4b5fd / #6d28d9)
- `--stub-bg` (#fffbeb / #292116)
- `--stub-border` (#fbbf24 / #d97706)
- `--stub-fg` (#92400e / #fbbf24)
- `--hn-orange` (#ff6600)

CONFIRMED NOT PRESENT (do NOT use):
- `--surface`, `--text`, `--text-muted`, `--warning`, `--warning-bg`, `--muted-bg`

Mapping for cf-adapter-demo.aihu:
- text color → `var(--fg)`
- muted text → `var(--muted)`
- surface/card bg → `var(--panel-bg)`
- badge bg → `var(--tag-bg)` / `var(--tag-fg)`

STATUS: CONFIRMED — token list documented.

## Check 4: examples/agent-hub/vite.config.ts — alias pattern

```ts
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
      '@aihu/agent-a2a': resolve(__dirname, 'node_modules/@aihu/agent-a2a'),
      '@aihu/agent-acp': resolve(__dirname, 'node_modules/@aihu/agent-acp'),
      '@aihu/agent-service': resolve(__dirname, 'node_modules/@aihu/agent-service'),
      '@aihu/context': resolve(__dirname, 'node_modules/@aihu/context'),
    },
  },
})
```

cf-adapter needs: `@aihu/adapter-cloudflare`, `@aihu/app`, `@aihu/agent`, `@aihu/compiler`.
No proxy needed (no dev server for this example).

STATUS: CONFIRMED — pattern documented.

## Check 5: __resetRegistryForTesting import path

From `examples/realtime-scores/tests/smoke.test.ts` line 26:

```ts
// @ts-expect-error — internal test reset not on public types
import { __resetRegistryForTesting } from '../../../packages/agent/src/registry.ts'
```

For cf-adapter (same depth: `examples/cf-adapter/tests/smoke.test.ts`), the path is:
`'../../../packages/agent/src/registry.ts'`

STATUS: CONFIRMED — same relative path.

## Check 6: git log bd1c450..HEAD --name-only

Command output: (empty — no commits since base SHA)

STATUS: CLEAN — branch is at base SHA, no unexpected files in scope.

---

## Decision: PROCEED TO IMPLEMENTATION

All 6 checks passed. No blockers. Ambiguities resolved:
- adapter key exists in TypeScript types — no ts-ignore needed
- Only confirmed tokens from tokens.css will be used
- Alias pattern copied from agent-hub
- Registry reset path confirmed
