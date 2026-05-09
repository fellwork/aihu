# @aihu/arbor

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
