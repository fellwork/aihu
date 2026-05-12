---
"@aihu/compiler": minor
---

Republish the compiler with v1.0.7 + v1.0.8 grammar work.

The v1.0.7 (dual-grammar deprecation removal, C107) and v1.0.8 (Amendment 04 —
`$attr={expr}` canonical, C304/C305/C306 rejections, Attr::Binding routing for
arbitrary attribute names) parser work was merged via PRs #168 and #170 earlier
this session but no changeset ever targeted `@aihu/compiler` — so the package
stayed at 0.2.0 on npm. Downstream consumers installing `@aihu/compiler@latest`
got the pre-v1.0.7 binary that silently drops `$<arbitrary-attr>={expr}` bindings.

This bump triggers the republish so the new grammar (parser + emit path) reaches
consumers. No source changes — the code is already on main; only the version
bump is needed.
