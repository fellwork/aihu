# @aihu/runtime

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
