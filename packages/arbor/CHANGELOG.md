# @aihu/arbor

## 0.1.3

### Patch Changes

- fix: set node.el in \_materialize so $class: and @html reactive effects run

  `_materialize` now writes the created DOM element back to `branch.el` immediately
  after `document.createElement`. Compiler-emitted `_onMount` callbacks read
  `_n.el` to register reactive class-toggle and `@html` effects — without this
  assignment they silently bailed, leaving all reactive bindings dead.
