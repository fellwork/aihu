# @aihu/server

> Server runtime + native renderer (napi-rs) for aihu SSR.

Requires one of the platform-specific native packages: `@aihu/server-darwin-arm64`, `@aihu/server-darwin-x64`, `@aihu/server-linux-x64-gnu`, or `@aihu/server-win32-x64-msvc`. npm picks the right one automatically via `optionalDependencies`.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/server
# or
bun add @aihu/server
```

## Usage

```typescript
import { renderToString } from '@aihu/server';

const html = await renderToString(App, { url: req.url });
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
