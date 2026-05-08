---
"@aihu/arbor": patch
---

fix: create SVG elements in SVG namespace

`document.createElement('svg')` produces `HTMLUnknownElement` which never paints. All SVG tags now use `createElementNS` so they render correctly. `_setAttrOrProp` bypasses the property fast-path for SVG elements to avoid silently failing on read-only `SVGAnimated*` objects like `viewBox`.
