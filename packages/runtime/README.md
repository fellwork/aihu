# @aihu/runtime

> Single File Component (.aihu) runtime — registers custom elements compiled by @aihu/compiler.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/runtime
# or
bun add @aihu/runtime
```

## Usage

```typescript
// In a .aihu Single File Component the runtime is auto-imported.
// To register a compiled component manually:
import { defineComponent } from '@aihu/runtime';
import MyCounter from './my-counter.aihu';

defineComponent('my-counter', MyCounter);
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
