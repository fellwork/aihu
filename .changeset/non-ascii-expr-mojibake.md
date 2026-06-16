---
"@aihu/compiler": patch
---

Fix non-ASCII string literals inside `{}` expressions being latin-1-mangled at
compile. The expression-lowering passes (`rewrite_signal_reads_to_calls` —
FEL-172/173 — and `lower_emit_calls`) rebuilt expression strings byte-by-byte
via `out.push(byte as char)`, which reinterprets each UTF-8 byte as a latin-1
code point. So any non-ASCII string literal reached through an expression —
`{someGloss}`, a ternary picking a lemma (`{cond ? 'λόγος' : 'word'}`), a
`$class` with a glyph (`'on ▾' : 'off ▸'`), an `$each` list, a `$on` handler, or
a `$emit('…')` payload — was corrupted into mojibake (`λόγος` → `Î»ÏÎ³Î¿Ï`).
Static template text and `@style` were unaffected, which masked the bug. This
is a serious landmine for any app rendering Greek/Hebrew/glyphs through
expressions (e.g. a Bible app).

Both passes now copy verbatim regions as whole UTF-8 string slices (flush-slice
rewriting) instead of byte-by-byte. All tokenizing still keys on ASCII bytes, so
every flush boundary lands on a char boundary and multibyte characters pass
through intact. Verified end-to-end and across a real component corpus: zero
mojibake, intact `λόγος` / `שלום` / `▾` / `▸` / `→` in every expression context.
