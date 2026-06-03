/**
 * Ambient declaration for the compiler-generated client artifact. The real file
 * is written by the vitest globalSetup (`compile-fixture.ts`) into
 * `__generated__/task-list.client.ts` (git-ignored) and resolved at run time via
 * the `virtual:task-list-client` alias in `vitest.config.ts`. This declares its
 * shape for `tsc --noEmit` without committing or type-checking generated output.
 */
declare module 'virtual:task-list-client' {
  import type { AgentDispatcher } from '@aihu/agent-server'
  export const __agentDispatcher: AgentDispatcher
}
