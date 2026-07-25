---
"@aihu/runtime": patch
---

Fix hierarchical context (`provide`/`inject`) silently not working in published
builds. `@aihu/runtime`'s shipped bundle inlined a private copy of
`@aihu/context`'s internals (`_enterContext`/`_exitContext` plus the module-level
context state they close over), so a component's `provide()` during setup wrote to
runtime's private copy while `inject()` in descendants read the real
`@aihu/context` module — values provided by an ancestor component were silently
dropped for anyone consuming the built package. (Workspace tests resolve source
files directly, which is why this never surfaced in CI.) `@aihu/context` is a
declared peerDependency and is now kept as a real external import, restoring one
shared context state. Side benefit: the `@aihu/runtime` bundle sheds ~30 B gz,
returning the size-gate row to its original 4750 B contract.
