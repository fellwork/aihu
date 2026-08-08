/**
 * Code-generation string escaping — shared by every build-time emitter that
 * builds JavaScript SOURCE by string concatenation.
 *
 * ## Why `JSON.stringify` alone is not enough
 *
 * `JSON.stringify` escapes for the JSON grammar: quotes, backslashes and the
 * C0 control characters. That is exactly right when the output will be
 * `JSON.parse`d, and it is NOT sufficient when the output is spliced into a
 * chunk of JavaScript source, because a JS source string can end up inside a
 * host grammar that terminates on characters JSON does not touch:
 *
 * | character   | `JSON.stringify` | why it still matters                       |
 * | ----------- | ---------------- | ------------------------------------------ |
 * | `<` `>`     | passes through   | `</script>` ends an inline `<script>` block, and `<!--` opens an HTML comment inside script data |
 * | U+2028/9    | passes through   | legal in a JSON string, a LINE TERMINATOR in pre-ES2019 JS — closes an unterminated literal |
 *
 * So a value that is perfectly safe as data becomes a breakout the moment the
 * generated module is served as, or inlined into, script content. This is
 * CodeQL's `js/bad-code-sanitization` (CWE-79/94/116): "sanitized with an
 * escaper meant for a different context".
 *
 * ## What this does
 *
 * `jsSourceLiteral(v)` is `JSON.stringify(v)` plus the escaping pass the
 * CodeQL rule's own remediation prescribes, over the class
 * `< > BS FF LF CR TAB NUL U+2028 U+2029`. Post-`JSON.stringify` the control
 * members of that class can no longer appear literally (JSON already escaped
 * them), so in practice the pass rewrites `<`, `>`, U+2028 and U+2029 — but
 * the class is kept whole so the guarantee does not depend on
 * `JSON.stringify`'s exact behaviour, and so the pattern stays the
 * recognizable one.
 *
 * Every replacement is a `\uXXXX` escape, which inside a JavaScript string
 * literal denotes the SAME character. The emitted module therefore evaluates
 * identically — a module specifier still resolves, a tag still matches — while
 * the source text can no longer terminate a `<script>` or a string literal.
 * NUL becomes `\u0000` rather than the `\0` the rule's example uses: `\0`
 * immediately followed by a digit is a legacy octal escape and a SyntaxError
 * in module (strict) code, so `\u0000` is the only always-correct spelling.
 *
 * `/` is deliberately NOT escaped. Neutralizing `<` already defuses
 * `</script>` and `<!--`, and leaving `/` alone keeps generated import
 * specifiers readable in build output and source maps.
 *
 * ## Scope
 *
 * Exported from `@aihu/router/plugin` rather than kept module-private: the
 * router is not the only package that concatenates disk-read values into
 * generated source (`@aihu/app`, the adapters and `@aihu/magna` all emit
 * virtual modules the same way). One audited helper is worth more than four
 * inline `.replace` chains, and the alternative — a new shared package for
 * fifteen lines — is not.
 */

/**
 * The character class the CodeQL `js/bad-code-sanitization` remediation
 * prescribes for values embedded in generated JavaScript source.
 */
const UNSAFE_IN_JS_SOURCE = /[<>\b\f\n\r\t\0\u2028\u2029]/g

const JS_SOURCE_ESCAPES: Readonly<Record<string, string>> = {
  '<': '\\u003C',
  '>': '\\u003E',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\u0000': '\\u0000',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

/**
 * Escape an already-JSON-encoded string for embedding in generated JavaScript
 * source. Prefer {@link jsSourceLiteral}; this is exported for the rare caller
 * that has to build the JSON itself.
 */
export function escapeForJsSource(json: string): string {
  return json.replace(UNSAFE_IN_JS_SOURCE, (c) => JS_SOURCE_ESCAPES[c] as string)
}

/**
 * JSON-encode `value` as a JavaScript literal safe to concatenate into
 * generated source. Drop-in for `JSON.stringify` at a code-construction sink.
 *
 * `undefined` (and a function, and a symbol) stringify to `undefined` rather
 * than to a string; that is emitted verbatim, which is a valid JS expression
 * and matches what a bare `` `${JSON.stringify(x)}` `` would have produced.
 */
export function jsSourceLiteral(value: unknown): string {
  const json = JSON.stringify(value)
  return json === undefined ? 'undefined' : escapeForJsSource(json)
}
