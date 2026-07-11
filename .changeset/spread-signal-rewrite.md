---
"@aihu/compiler": patch
---

fix: rewrite signal reads inside spread expressions

A spread of a signal in a template expression (e.g. `{ [...a, ...b].length }`)
silently miscompiled: because `...` ends in a `.`, the identifier after it was
misclassified as member access (`obj.a`) and skipped by the signal-read
rewriter — so the emitted code spread the getter **functions** instead of their
values, and as a non-reactive eager leaf. Spread idents are now distinguished
from real member access (look-back over whitespace for a `...` run); `...a` and
object spread `{...o()}` rewrite to their called forms and stay reactive.
