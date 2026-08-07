---
'@aihu/runtime': patch
---

Degrade a child renderer that returns a non-string instead of embedding it.

An async `__ssrString` reached the page as the literal text `[object Promise]`
— worse than an empty element, because it looks like content and ships. The
SSR path is synchronous by construction and cannot await, so a non-string
return is a broken module: it now renders the bare element and reports why.
