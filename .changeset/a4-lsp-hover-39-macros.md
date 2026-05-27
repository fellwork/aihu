---
"@aihu/language-server": patch
---

Add hover content for 23 additional macros (final coverage: 36 resolver tokens
covering all 39 spec forms via dotted-form folding). Extend getMacroAtPosition
regex set (4 patterns) and getBlockContext to distinguish @style/@agent/@route.
Add observational latency benchmark scaffold (non-gate).

Note: $emit hover citation re-pointed to template-syntax-v2 §5; macro-vocabulary
specs predate template-syntax-v2. Future M3 doc-track item to emit
macro-vocabulary-v3 incorporating $emit.
