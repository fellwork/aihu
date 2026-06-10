---
'@aihu/compiler': patch
---

Template parser: support HTML comments (`<!-- … -->`). Comments are parsed and dropped — authoring annotations only, never emitted to the compiled output. An unclosed comment is a compile error.
