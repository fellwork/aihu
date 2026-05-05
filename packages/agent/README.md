# @aihu/agent

> Agent primitives — the foundation of aihu agent-readiness.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/agent
# or
bun add @aihu/agent
```

## Usage

```typescript
import { defineAgent } from '@aihu/agent';

export const myAgent = defineAgent({
  name: 'my-agent',
  description: 'Does the thing',
  // ...
});
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
