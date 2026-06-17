---
"@aihu/cli": patch
---

fix(cli): agent template (`create-aihu --template agent`) now mounts

The scaffolded `<task-list>` never registered as a custom element, so the page
rendered blank. Two bugs in the `agent` template's `task-list.aihu`:

- The reskin signal setters were named `setLabel`/`setVariant` — colliding with
  the `setLabel`/`setVariant` `$action`s, so the compiler emitted two top-level
  `const setLabel`/`const setVariant`. The dev transpile the vite plugin runs
  failed on the duplicate symbol, the plugin silently fell back to serving raw
  TS, and the element never defined. Renamed the setters to
  `writeLabel`/`writeVariant`.
- `$class={['tl', variant]}` passed the signal *accessor* (a function) into the
  class array, which the class helper drops as a non-string — so the agent's
  `setVariant` had no visible effect. The signal is now called:
  `$class={['tl', variant()]}`.

Adds a `scaffold-compile-clean` regression guard that transpiles the agent
template's compiled client output (the exact dev path) and fails on this bug
class — the native compiler exits 0 on the duplicate `const`, so file-presence
and native-compile checks alone passed it silently.
