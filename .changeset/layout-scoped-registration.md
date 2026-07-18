---
"@aihu/router": minor
"@aihu/app": minor
---

Layout-scoped component registration (F2): a layout's own referenced components now get route-scope registered, the same way a page's do. The router's `virtual:aihu-layouts` entries carry a `components` array — the normalized tags the layout SFC's `@template` references, scanned at build time (`readAihuLayoutComponents`, mirroring the compiler's `is_component_tag`/`collect_component_tags` rule). When `@aihu/app` renders a route under a layout, it registers those components (from `virtual:aihu-components`) alongside loading the layout module, so a component used inside a layout — not the page — is defined before the layout element mounts instead of relying on prop-on-upgrade or an eager import. Entries without a `components` field (pre-F2 generated modules) keep working unchanged.
