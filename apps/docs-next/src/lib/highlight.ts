/**
 * A tiny, dependency-free, DOM-free syntax highlighter tuned for aihu SFCs and
 * TypeScript. Runs at prerender time (server target) AND on the client — pure
 * string in, HTML-with-spans out. Two-phase to stay correct:
 *   1. mask comments + string literals (they must never be re-tokenized)
 *   2. word-tokenize the remaining "raw" segments and classify by lexeme sets
 * Token classes map to `.t-*` colors in base.css (theme-aware in both modes).
 */

const KEYWORDS = new Set([
  'const',
  'let',
  'var',
  'function',
  'return',
  'import',
  'from',
  'export',
  'default',
  'await',
  'async',
  'new',
  'class',
  'extends',
  'implements',
  'typeof',
  'instanceof',
  'in',
  'of',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'this',
  'void',
  'delete',
  'yield',
  'true',
  'false',
  'null',
  'undefined',
  'as',
  'satisfies',
  'interface',
  'type',
  'enum',
  'public',
  'private',
  'readonly',
  'static',
])

// aihu reactive intrinsics + lifecycle + agent-surface vocabulary.
const INTRINSICS = new Set([
  'prop',
  'state',
  'action',
  'derived',
  'computed',
  'effect',
  'signal',
  'resource',
  'controller',
  'consume',
  'provide',
  'aria',
  'form',
  'onMount',
  'onDispose',
  'onAdopt',
  'onAttributeChange',
  'batch',
  'untrack',
  'createApp',
  'describe',
  'expose',
  'reflect',
  'attribute',
  'render',
])

// template-grammar words that are NOT JS keywords (colored like attributes).
const GRAMMAR = new Set([
  'each',
  'key',
  'show',
  'group',
  'empty',
  'bind',
  'slot',
  'outlet',
  'guard',
  'elseif',
])

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function span(cls: string, text: string): string {
  return `<span class="${cls}">${esc(text)}</span>`
}

/** Phase 2: classify a raw (non-string, non-comment) segment. */
function tokenizeRaw(src: string): string {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i] ?? ''

    // decorator: @word at line start or after whitespace
    if (c === '@' && /[A-Za-z]/.test(src[i + 1] ?? '')) {
      const prev = src[i - 1]
      if (prev === undefined || /\s/.test(prev)) {
        let j = i + 1
        while (j < n && /[\w-]/.test(src[j] ?? '')) j++
        out += span('t-dec', src.slice(i, j))
        i = j
        continue
      }
    }

    // JSX tag open/close: < or </ immediately followed by a tag name
    if (c === '<' && /[A-Za-z/]/.test(src[i + 1] ?? '')) {
      let j = i + 1
      if (src[j] === '/') j++
      const nameStart = j
      while (j < n && /[\w-]/.test(src[j] ?? '')) j++
      if (j > nameStart) {
        out += esc(src.slice(i, nameStart)) // the "<" / "</"
        out += span('t-tag', src.slice(nameStart, j))
        i = j
        continue
      }
    }

    // identifier / word
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1
      while (j < n && /[\w$]/.test(src[j] ?? '')) j++
      const word = src.slice(i, j)
      // function-call heuristic: name directly followed by "("
      const after = src[j]
      let cls: string | null = null
      if (KEYWORDS.has(word)) cls = 't-kw'
      else if (INTRINSICS.has(word)) cls = 't-inz'
      else if (GRAMMAR.has(word)) cls = 't-atr'
      else if (after === '(') cls = 't-fn'
      out += cls ? span(cls, word) : esc(word)
      i = j
      continue
    }

    // number
    if (/[0-9]/.test(c)) {
      let j = i + 1
      while (j < n && /[0-9._]/.test(src[j] ?? '')) j++
      out += span('t-num', src.slice(i, j))
      i = j
      continue
    }

    out += esc(c)
    i++
  }
  return out
}

/** Highlight source to an HTML string of token spans. */
export function highlight(source: string): string {
  const src = source.replace(/\r\n/g, '\n').replace(/\t/g, '  ')
  let out = ''
  let i = 0
  const n = src.length
  let raw = ''
  const flush = () => {
    if (raw) {
      out += tokenizeRaw(raw)
      raw = ''
    }
  }

  while (i < n) {
    const c = src[i]
    const c2 = src[i + 1]

    // line comment
    if (c === '/' && c2 === '/') {
      flush()
      let j = i + 2
      while (j < n && src[j] !== '\n') j++
      out += span('t-com', src.slice(i, j))
      i = j
      continue
    }
    // block comment
    if (c === '/' && c2 === '*') {
      flush()
      let j = i + 2
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++
      j = Math.min(n, j + 2)
      out += span('t-com', src.slice(i, j))
      i = j
      continue
    }
    // html comment
    if (c === '<' && src.slice(i, i + 4) === '<!--') {
      flush()
      const end = src.indexOf('-->', i + 4)
      const j = end === -1 ? n : end + 3
      out += span('t-com', src.slice(i, j))
      i = j
      continue
    }
    // string literal (', ", `)
    if (c === "'" || c === '"' || c === '`') {
      flush()
      const quote = c
      let j = i + 1
      while (j < n) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === quote) {
          j++
          break
        }
        j++
      }
      out += span('t-str', src.slice(i, j))
      i = j
      continue
    }

    raw += c
    i++
  }
  flush()
  return out
}
