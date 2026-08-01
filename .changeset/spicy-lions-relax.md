---
"@aihu/css-engine": minor
---

Publish the light-DOM leaf-flip prep work landed in #714 (`aba7e70d`), which
shipped without a changeset: the `SfcAst` wire format gained a `tag` field
and a `light_scope_id` field, `emit_sfc_scoped` split into 4 channels with
mode-aware token emission (`:host` for shadow, `:root` for light -- fixes a
live bug where a light-mode page emitted an inert `:host{}` block matching
nothing), and the `@layer` preamble (`aihu.reset`/`tokens`/`components`/
`utilities`) is now public API.

The published `0.5.0` on npm predates all of this -- #714 landed on `main`
after `0.5.0`'s own release commit without bumping the package version, so
the next publish would have silently shipped different code under an
already-published version number. This changeset is that missing bump.

Also refreshes the `aihu-css-compile` native binary (see the sibling
platform-package version bumps in this same change): the currently
published binary, `0.1.3`, predates the `tag` field above and fails to
deserialize any AST the current compiler emits (`missing field 'tag'`),
which silently degrades every `compileSfc()` call to a no-op -- utility-class
CSS compilation stops working, with only a console warning as a symptom.
