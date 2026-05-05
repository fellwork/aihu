# @aihu/context

> Async-context-friendly request/SSR context primitives for aihu.

Part of the [aihu](https://github.com/fellwork/aihu) framework — agentic discovery and interaction, for human purpose.

## Install

```bash
npm install @aihu/context
# or
bun add @aihu/context
```

## Usage

```typescript
import { createContext, useContext } from '@aihu/context';

const ThemeContext = createContext<'light' | 'dark'>('light');

// Provide a value for a subtree, then consume it with useContext.
```

## Status

Early access (`0.1.x`). API may evolve before v1.1 GA. See the [v1.1 roadmap](https://github.com/fellwork/aihu/tree/main/docs/roadmap) for stability commitments.

## License

MIT — see [LICENSE](https://github.com/fellwork/aihu/blob/main/LICENSE).
