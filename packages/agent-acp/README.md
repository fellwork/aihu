# @aihu/agent-acp

> ACP (Agent Control Protocol) bindings for @aihu/agent-service.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/agent-acp
# or
bun add @aihu/agent-acp
```

## Usage

```typescript
import { acpBinding } from '@aihu/agent-acp';
import { createAgentService } from '@aihu/agent-service';

const service = createAgentService({ agents, bindings: [acpBinding()] });
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
