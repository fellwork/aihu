---
'@aihu/ui': minor
---

Phase 2 styled recipes (spec §9.7), all light-DOM (`$shadow: 'none'`) so
native form controls join the outer `<form>`: `checkbox` and `switch` extend
their headless primitives via `$extends:` (the host element IS the behavioral
primitive subclass); `input`, `textarea`, `label` forward props onto native
elements; `dialog` (7 piece files) and `tooltip` (3 piece files) extend the
overlay primitive pieces. Also fixes the four Phase 1 recipes' unsupported
`const props = $props` pattern (now `$prop:` declarations — the old form threw
`ReferenceError` at element instantiation) and excludes co-located
`*.stories.ts`/`*.test.ts` from the registry index so `aihu add` never copies
them.
