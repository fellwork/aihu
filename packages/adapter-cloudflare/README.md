# @aihu/adapter-cloudflare

> Cloudflare Workers/Pages deployment adapter for @aihu/app.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/adapter-cloudflare
# or
bun add @aihu/adapter-cloudflare
```

## Usage

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { aihu } from '@aihu/app';
import cloudflare from '@aihu/adapter-cloudflare';

export default defineConfig({ plugins: [aihu({ adapter: cloudflare() })] });
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
