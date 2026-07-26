---
'@aihu/cli': patch
---

**Scaffold: `--css engine` no longer silently pins `shadowMode: 'shadow'` (FEL-425).**

`create-aihu app --css engine` (and `aihu app --css engine`) emitted a plugin-global
`css: { shadowMode: 'shadow' }` block even when the user never passed `--shadow` —
fabricating a "choice" that outranks the DA4 page/layout light-DOM default and put
the scaffolded page in shadow DOM, for exactly the scaffold that most needs global
CSS to reach component internals.

The shadow choice is now `ShadowChoice | undefined` end to end: the `css: { shadowMode }`
block is written **only when the user explicitly chose** a mode (`--shadow light|shadow`
or a deliberate wizard selection). With no choice, nothing is emitted and the framework
defaults apply — pages and layouts light DOM, leaf components shadow DOM. A scaffold
that pins the default freezes it.

- `create-aihu app --css engine` → light-DOM page, utility CSS reaches the global cascade
- `create-aihu app --css engine --shadow shadow` → still explicitly shadow (deliberate choice kept)
- `create-aihu app --css engine --shadow light` → still explicitly light
- The wizard's shadow-mode prompt gained a "default (framework defaults)" first option;
  pressing Enter is no longer treated as choosing `shadow`.
- Invalid `--shadow` values are now ignored (framework defaults) instead of silently
  becoming `shadow`.

Note: an explicit `--shadow` choice is still carried as the **project-wide** plugin
config, so it also governs leaves and layouts (e.g. `--shadow light` flips leaves to
light DOM too). That is the existing semantic of the flag; a per-file mechanism for
the scaffolded page only would be a separate change.
