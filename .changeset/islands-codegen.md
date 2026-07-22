---
'@aihu/compiler': minor
---

Island classification is now authoritative in the Rust codegen (wave 3c).

The compiler decides whether a component is a **static** island (server-render
only, zero client hydration) or an **interactive** island at emit time, from
the IR — the same fact-set that already decides which owner-context primitives
(`signal`/`computed`/`effect`/`onMount`/`onCleanup`) to import. It records the
verdict three ways: a `// @aihu:island static|interactive` code marker,
`EmitResult.island`, and the envelope's `TargetEmit.island`.

This RETIRES the `_classifyIsland` JS post-pass, which re-derived the answer by
regexing generated code for `signal(`/`effect(`/… — a Derived-property
violation (the compiler already knew). The Vite plugin now reads the marker via
`_parseIslandMarker`.

The move also fixes a latent bug: a `$prop`-only component (options-form,
no `signal(` call in its body) was mis-classified `static` by the old regex and
routed through the static-island shim, which cannot lower
`defineComponent({ props, setup })`. Reactive props are parent-driven inputs, so
the compiler now classifies such a component **interactive** (conservative: only
truly inert components are `static`).

Static islands continue to ship the zero-runtime shim (no `@aihu/runtime`
import, no `defineComponent` hydration walk); interactive components keep the
full runtime path. Physically code-splitting a purely-static route so its chunk
graph excludes `@aihu/runtime` + `@aihu/signals` (~5.9 kB gzip) remains a
scoped follow-up in `@aihu/app`'s route bundling.
