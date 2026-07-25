---
"@aihu/runtime": patch
---

Externalize `@aihu/context` in the runtime bundle. The dist previously inlined a
private copy of `_enterContext`/`_exitContext` and the module-level context slots
they close over, so in published builds runtime's owner-context scope wrote the
copy's state while userland `provide()`/`inject()` read the real module's —
hierarchical client DI silently no-oped for dist consumers. `@aihu/context` is a
declared peerDependency and now stays a real import, which also removes ~30 B gz
from the `@aihu/runtime` size-gate row (4735 B → 4705 B against the 4750 B limit).
