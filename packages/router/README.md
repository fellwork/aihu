# @aihu/router

> File-based router for the aihu meta-framework.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/router
# or
bun add @aihu/router
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { aihuRouter } from '@aihu/router/plugin';

export default defineConfig({ plugins: [aihuRouter()] });
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
