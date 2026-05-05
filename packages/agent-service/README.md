# @aihu/agent-service

> Service-side agent runtime — host @aihu/agent definitions over HTTP.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/agent-service
# or
bun add @aihu/agent-service
```

## Usage

```typescript
import { createAgentService } from '@aihu/agent-service';
import { myAgent } from './agents/my-agent';

const service = createAgentService({ agents: [myAgent] });
// Mount service.handler in your server framework of choice.
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
