---
'@aihu/compiler': patch
---

Preserve same-line significant whitespace between a text node and an inline
element sibling in `@template { ... }` blocks.

Previously, `emit_node` for `TemplateNode::Text` called `s.trim()`
unconditionally, deleting the single space required by HTML/JSX rules between
a text run and an adjacent inline tag. Templates like
`<p>foo <code>bar</code> baz</p>` compiled to
`leaf('foo'), branch('code',…), leaf('baz')` — losing both spaces and
running the text together at render time.

Now leading/trailing whitespace on the same line as content is preserved as a
single space (per JSX semantics). Multi-line surrounding whitespace
(template indentation/newlines) is still stripped as before. Internal
whitespace runs are still collapsed to a single space.
