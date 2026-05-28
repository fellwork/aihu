# @aihu/runtime

## 0.1.7

### Patch Changes

- [#252](https://github.com/fellwork/aihu/pull/252) [`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hoist `@aihu/signals` to a `peerDependency` with a caret range (via `workspace:^`) on both `@aihu/arbor` and `@aihu/runtime`. Previously arbor declared `@aihu/signals` as a regular `dependencies` entry and runtime declared it as a `peerDependency` with `workspace:*`. `bun pm pack` rewrites `workspace:*` to an exact pin (`"0.1.0"`) at pack time — so the published manifests carried an exact-version requirement. When a consumer installed `@aihu/signals@0.1.1` at the top level, the package manager satisfied arbor's `0.1.0` pin by installing a second nested copy at `node_modules/@aihu/arbor/node_modules/@aihu/signals`.

  `@aihu/signals` keeps its `currentObserver` tracker in a module-scoped `let`. Two copies of the module → two trackers. arbor's effect set copy-A's tracker; user-code signal getters read copy-B's tracker (always `null`); `linkAdd` was skipped; no subscription was created; signal writes propagated to nothing. The user-visible symptom was `$if` (and any compiler-emitted `when([() => sig()], ...)`) rendering once and never re-evaluating.

  `workspace:^` rewrites to `^x.y.z` at pack time, so the published manifests now carry a range — consumers' hoisted copy satisfies it, the duplicate nested install goes away, and the single module instance keeps a single `currentObserver`.

  Adds a CI lint gate (`bun run lint:dep-pins`) that walks every published `@aihu/*` and `@aihu-plugin/*` package manifest and fails the build if any inter-package dependency is declared as an exact pin (bare semver) rather than a range. Prevents regression of this policy across the workspace.

- Updated dependencies [[`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a)]:
  - @aihu/arbor@0.1.5

## 0.1.6

### Patch Changes

- [#220](https://github.com/fellwork/aihu/pull/220) [`a4b62f2`](https://github.com/fellwork/aihu/commit/a4b62f2229f43cdb30d117a5d33cb1702153446b) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Fix reactive `$prop` bindings being silently dropped when applied to a custom
  element before it connects to the DOM. Arbor's `_materialize` applies reactive
  prop bindings via `el.prop = v` the instant the element is created — before it
  is appended/connected. At that point the per-instance prop-signal map
  (`PROPS_SYM`) is still `null` (it is built in `_build()` from
  `connectedCallback`), so the prototype prop setter's `this[PROPS_SYM]?.[name]?.set(v)`
  no-opped and the write was lost. `_build()` then seeded the signal from
  `getAttribute` (never set, since the property path was taken) and the prop
  reverted to its declared default. For static content whose source signal never
  re-fires after mount, the bound value never arrived.

  The prop setter now buffers pre-connect writes per prop (raw value, any type —
  no stringification), and `_build()` drains the buffer, letting a buffered value
  take precedence over the attribute/default fallback when seeding the signal.
  Objects, functions, and arrays survive intact. Attribute-declared props,
  post-mount signal updates, and the default fallback are all preserved.

  The buffering map adds ~47 B gz to `@aihu/runtime`, which sat at +47 B headroom
  against its 3400 B gate (i.e. the fix lands at exactly the limit). The
  `@aihu/runtime` size-limit row is bumped 3400 B → 3450 B to restore a small
  headroom margin (now +50 B per `bun run size`) rather than ship at the
  zero-margin boundary — consistent with the README policy of bumping a row's
  limit for a justified footprint increase.

## 0.1.5

### Patch Changes

- [#196](https://github.com/fellwork/aihu/pull/196) [`faca280`](https://github.com/fellwork/aihu/commit/faca2804cf62c05ffc90ef867faa2058b5e267ad) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Surface component `setup()`/render throws instead of silently leaving an empty
  shadow root. `connectedCallback` now `console.error`s with the offending
  component tag (`[aihu] setup failed for <tag>:`) and re-throws, so a failing
  setup produces an attributable error rather than a blank component with no
  console signal. The `SCR-R0002`/`SCR-R0003` invariant throws still propagate;
  the hydration path is unchanged. Fixes upstream Bug 6.

## 0.1.4

### Patch Changes

- Updated dependencies [[`70fdad2`](https://github.com/fellwork/aihu/commit/70fdad254bedab492e3b46b131564605d4665537)]:
  - @aihu/arbor@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies []:
  - @aihu/arbor@0.1.3
