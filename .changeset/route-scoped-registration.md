---
"@aihu/app": minor
---

Route-scoped component registration (O1c): on navigation the client imports every component the matched route references — from the compile-time `virtual:aihu-components` registry — and registers their custom elements before the page element mounts. Apps no longer need a hand-written entry that eagerly imports every component; just reference the tag in a template. Tags with no registry entry (e.g. globally-registered elements) are skipped silently. Applies to the not-found route too.
