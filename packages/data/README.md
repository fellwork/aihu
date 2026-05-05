# @aihu/data

> Reactive data loaders and resource primitives for aihu.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/data
# or
bun add @aihu/data
```

## Usage

```typescript
import { resource } from '@aihu/data';

const user = resource(async (id: string) => {
  const res = await fetch(`/api/users/${id}`);
  return res.json();
});
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
