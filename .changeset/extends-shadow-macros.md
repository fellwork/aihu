---
'@aihu/compiler': minor
---

§9.4 recipe class-extension + per-file shadow mode. Two new `@state` macros:
`$extends: Identifier` threads `base: <Ident>` into the emitted
`defineComponent({ base, ... })` so the registered element extends a primitive
base class (malformed → C470), and `$shadow: 'open' | 'closed' | 'none'` emits
a leading `// @aihu:shadow <mode>` marker (malformed → C471). The Vite plugin
reads the marker to override its global `shadowMode` per file — driving both
shadow attachment and the css-engine light-DOM fold — redirects the authored
`@style` sheet to `document.adoptedStyleSheets` under light DOM
(`_globalizeAuthoredStyle`), and force-routes base-extending components past
the static-island path (the shim cannot extend a base).
