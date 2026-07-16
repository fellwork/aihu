---
"@aihu/compiler": patch
---

Template: preserve the space in `{a} {b}`.

A whitespace-only text node flanked by dynamic boundaries — an interpolation
`{…}` or a child element — was dropped entirely at compile time, fusing the two
values whose only separator was that space: `<p>{count()} {label()}</p>` rendered
`400attestations` instead of `400 attestations`, and `{a} <span>{b}</span>` lost
the space before the element. Whitespace inside a larger literal-text run (`count
{a} of {b}`) was unaffected — only the pure-whitespace node hit the early elision.

A whitespace-only node on a single line is now preserved as a single space, per
HTML's inline whitespace model. A run that spans lines (template-body indentation
between block-level siblings) is still stripped, so no spurious spaces are
injected. Fixes #400.
