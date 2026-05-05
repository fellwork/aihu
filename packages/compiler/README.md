# @aihu/compiler

> Single File Component (.aihu) compiler — Rust binary + JS glue.

⚠ **Native binary required.** This package downloads a pre-built `aihu-compile` binary at install time via `js/postinstall.ts` (see [WASM.md](https://github.com/fellwork/aihu/blob/main/packages/compiler/WASM.md)). Binaries are published per-platform from the `release.yml` workflow on every `v*` tag. SHA256-verified per arch-4 §4.3.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/compiler
# or
bun add @aihu/compiler
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { aihuCompiler } from '@aihu/compiler';

export default defineConfig({ plugins: [aihuCompiler()] });
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
