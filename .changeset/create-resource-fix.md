---
"@aihu/runtime": minor
"@aihu/compiler": patch
---

Fix plain `$resource`: emit the `createResource` import + add the runtime primitive.

The compiler lowered a plain (non-magna) `$resource` entry to `const x = createResource(() => …)` but never emitted the import — the `needs_create_resource` flag was set yet never pushed to the `@aihu/runtime` import list — so any `$resource` produced a bare `ReferenceError: createResource is not defined`. And `@aihu/runtime` had no `createResource` to import (it was meant to live there parallel to `createStream`; only a magna-internal copy in `@aihu-plugin/data` existed).

- **`@aihu/runtime`**: add `createResource(factory)` next to `createStream` — a reactive async resource with `loading` / `data` / `error` getters + `refetch()`, with a sequence guard so a superseded run never clobbers fresher data. Exported from the barrel.
- **`@aihu/compiler`**: push `createResource` into the `@aihu/runtime` import when a plain `$resource` is used (`emit.rs`), mirroring `createStream`.

The compiler emits the runtime import, so these publish in lockstep. Magna-backed `$resource` (`createMagnaResource` from `@aihu/magna`) is unaffected.
