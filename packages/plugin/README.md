# @aihu/plugin

> Plugin substrate shared by @aihu/server and the meta-framework — runtime hook surface.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/plugin
# or
bun add @aihu/plugin
```

## Usage

```typescript
import { definePlugin } from '@aihu/plugin';

export default definePlugin({
  name: 'my-plugin',
  // ...lifecycle hooks
});
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
