---
"@aihu/compiler": patch
---

Reject unreserved `$<name>="quoted"` template attributes at parse time with a hard C500 error (Risk-7 closure from spec-template-syntax-v2 §"Codegen hardening — silent-drop fix"). Previously these silently fell through codegen's `emit_macro_effects` default arm — the attribute was dropped and the layout/component rendered without the intended prop. Error now points authors at the curly form (`$<name>={expr}`), which routes to `Attr::Binding` via Amendment 04 and emits as a real prop on a component.
