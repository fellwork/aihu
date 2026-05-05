# @aihu/app

> Top-level app integration — wires runtime, router, and adapters into a Vite app.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/app
# or
bun add @aihu/app
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { aihu } from '@aihu/app';

export default defineConfig({ plugins: [aihu()] });
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
