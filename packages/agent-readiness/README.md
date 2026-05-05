# @aihu/agent-readiness

> Discovery + readiness manifest emitter so agents can introspect aihu apps.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/agent-readiness
# or
bun add @aihu/agent-readiness
```

## Usage

```typescript
import { readinessHandler } from '@aihu/agent-readiness';

// Mount at /.well-known/agent-readiness
app.get('/.well-known/agent-readiness', readinessHandler());
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
