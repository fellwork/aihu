---
"@aihu/compiler": patch
---

Tighten `validate_macro_quoted_value` to enforce its documented contract: identifier-start (`[A-Za-z_$]`) followed by `[A-Za-z0-9_$.]`, with no `..` or trailing `.`. Previously the validator rejected only whitespace, brackets, parens, and `?`, quietly allowing `!`, `&`, `|`, comparison and arithmetic operators, leading digits, and dotted-path malformations. Codegen wrapped those non-simple-identifier values in `[() => (…)]`; when the expression referenced a signal getter (e.g. `!loading`), the thunk read the getter as a function value — always truthy — instead of calling it (silent wrong-result). C302 error now carries a structured migration target pointing at the curly form (`$<name>={expr}`).
