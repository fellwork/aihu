# @aihu/arbor

## 0.1.5

### Patch Changes

- [#252](https://github.com/fellwork/aihu/pull/252) [`84352bc`](https://github.com/fellwork/aihu/commit/84352bcb901b7213d67727648545b41652b2092a) Thanks [@srmcguirt](https://github.com/srmcguirt)! - Hoist `@aihu/signals` to a `peerDependency` with a caret range (via `workspace:^`) on both `@aihu/arbor` and `@aihu/runtime`. Previously arbor declared `@aihu/signals` as a regular `dependencies` entry and runtime declared it as a `peerDependency` with `workspace:*`. `bun pm pack` rewrites `workspace:*` to an exact pin (`"0.1.0"`) at pack time — so the published manifests carried an exact-version requirement. When a consumer installed `@aihu/signals@0.1.1` at the top level, the package manager satisfied arbor's `0.1.0` pin by installing a second nested copy at `node_modules/@aihu/arbor/node_modules/@aihu/signals`.

  `@aihu/signals` keeps its `currentObserver` tracker in a module-scoped `let`. Two copies of the module → two trackers. arbor's effect set copy-A's tracker; user-code signal getters read copy-B's tracker (always `null`); `linkAdd` was skipped; no subscription was created; signal writes propagated to nothing. The user-visible symptom was `$if` (and any compiler-emitted `when([() => sig()], ...)`) rendering once and never re-evaluating.

  `workspace:^` rewrites to `^x.y.z` at pack time, so the published manifests now carry a range — consumers' hoisted copy satisfies it, the duplicate nested install goes away, and the single module instance keeps a single `currentObserver`.

  Adds a CI lint gate (`bun run lint:dep-pins`) that walks every published `@aihu/*` and `@aihu-plugin/*` package manifest and fails the build if any inter-package dependency is declared as an exact pin (bare semver) rather than a range. Prevents regression of this policy across the workspace.

## 0.1.4

### Patch Changes

- [`70fdad2`](https://github.com/fellwork/aihu/commit/70fdad254bedab492e3b46b131564605d4665537) Thanks [@srmcguirt](https://github.com/srmcguirt)! - fix: create SVG elements in SVG namespace

  `document.createElement('svg')` produces `HTMLUnknownElement` which never paints. All SVG tags now use `createElementNS` so they render correctly. `_setAttrOrProp` bypasses the property fast-path for SVG elements to avoid silently failing on read-only `SVGAnimated*` objects like `viewBox`.

## 0.1.3

### Patch Changes

- fix: set node.el in \_materialize so $class: and @html reactive effects run

  `_materialize` now writes the created DOM element back to `branch.el` immediately
  after `document.createElement`. Compiler-emitted `_onMount` callbacks read
  `_n.el` to register reactive class-toggle and `@html` effects — without this
  assignment they silently bailed, leaving all reactive bindings dead.
