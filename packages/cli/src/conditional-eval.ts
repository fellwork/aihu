/**
 * @aihu/cli/conditional-eval — strict-subset evaluator for `when` expressions
 * declared in `template.config.ts.conditionalFiles[].when`.
 *
 * Per arch-6 §4.2: this evaluator MUST NOT use `eval`, `Function`, or `vm`.
 * The grammar is intentionally tiny so a malicious template package cannot
 * smuggle arbitrary code through this surface.
 *
 * Grammar (recursive-descent):
 *   expr        := orExpr
 *   orExpr      := andExpr ('||' andExpr)*
 *   andExpr     := equality ('&&' equality)*
 *   equality    := unary (('===' | '!==') unary)*
 *   unary       := '!' unary | primary
 *   primary     := '(' expr ')' | identifier | string | boolean
 *   string      := single-quoted or double-quoted, no escapes inside
 *   identifier  := /[A-Za-z_][A-Za-z0-9_]*\/  (resolved from context)
 *   boolean     := 'true' | 'false'
 */

// ─── Tokens ──────────────────────────────────────────────────────────────────

type TokenKind =
  | 'ident'
  | 'string'
  | 'bool'
  | 'eq' // ===
  | 'neq' // !==
  | 'and' // &&
  | 'or' // ||
  | 'bang' // !
  | 'lparen'
  | 'rparen'
  | 'eof'

interface Token {
  kind: TokenKind
  value: string
  pos: number
}

function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  const n = src.length

  while (i < n) {
    const c = src[i]!

    // whitespace
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    if (c === '(') {
      out.push({ kind: 'lparen', value: '(', pos: i })
      i++
      continue
    }
    if (c === ')') {
      out.push({ kind: 'rparen', value: ')', pos: i })
      i++
      continue
    }

    // === / !==
    if (c === '=') {
      if (src.slice(i, i + 3) !== '===') {
        throw new Error(`unexpected '=' at position ${i} (expected '===')`)
      }
      out.push({ kind: 'eq', value: '===', pos: i })
      i += 3
      continue
    }
    if (c === '!') {
      if (src.slice(i, i + 3) === '!==') {
        out.push({ kind: 'neq', value: '!==', pos: i })
        i += 3
        continue
      }
      out.push({ kind: 'bang', value: '!', pos: i })
      i++
      continue
    }

    // && / ||
    if (c === '&') {
      if (src.slice(i, i + 2) !== '&&') {
        throw new Error(`unexpected '&' at position ${i} (expected '&&')`)
      }
      out.push({ kind: 'and', value: '&&', pos: i })
      i += 2
      continue
    }
    if (c === '|') {
      if (src.slice(i, i + 2) !== '||') {
        throw new Error(`unexpected '|' at position ${i} (expected '||')`)
      }
      out.push({ kind: 'or', value: '||', pos: i })
      i += 2
      continue
    }

    // string literal: single- or double-quoted; no escapes (matches arch-6 §4.2)
    if (c === '"' || c === "'") {
      const quote = c
      const start = i
      i++
      let v = ''
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          throw new Error(`escape sequences are not allowed in string literals (position ${i})`)
        }
        v += src[i]
        i++
      }
      if (i >= n) throw new Error(`unterminated string literal starting at position ${start}`)
      i++ // consume closing quote
      out.push({ kind: 'string', value: v, pos: start })
      continue
    }

    // identifier or boolean
    if (/[A-Za-z_]/.test(c)) {
      const start = i
      while (i < n && /[A-Za-z0-9_]/.test(src[i]!)) i++
      const word = src.slice(start, i)
      if (word === 'true' || word === 'false') {
        out.push({ kind: 'bool', value: word, pos: start })
      } else {
        out.push({ kind: 'ident', value: word, pos: start })
      }
      continue
    }

    throw new Error(`unexpected character ${JSON.stringify(c)} at position ${i}`)
  }

  out.push({ kind: 'eof', value: '', pos: n })
  return out
}

// ─── Parser + Evaluator ──────────────────────────────────────────────────────

class Parser {
  private i = 0
  constructor(
    private readonly toks: Token[],
    private readonly ctx: Record<string, unknown>,
  ) {}

  private peek(): Token {
    return this.toks[this.i]!
  }
  private eat(kind: TokenKind): Token {
    const t = this.peek()
    if (t.kind !== kind) {
      throw new Error(`expected ${kind} at position ${t.pos}, got ${t.kind} (${t.value})`)
    }
    this.i++
    return t
  }

  parseExpr(): unknown {
    const v = this.parseOr()
    if (this.peek().kind !== 'eof') {
      throw new Error(`trailing tokens at position ${this.peek().pos}`)
    }
    return v
  }

  private parseOr(): unknown {
    let lhs = this.parseAnd()
    while (this.peek().kind === 'or') {
      this.i++
      const rhs = this.parseAnd()
      lhs = Boolean(lhs) || Boolean(rhs)
    }
    return lhs
  }

  private parseAnd(): unknown {
    let lhs = this.parseEquality()
    while (this.peek().kind === 'and') {
      this.i++
      const rhs = this.parseEquality()
      lhs = Boolean(lhs) && Boolean(rhs)
    }
    return lhs
  }

  private parseEquality(): unknown {
    let lhs = this.parseUnary()
    while (this.peek().kind === 'eq' || this.peek().kind === 'neq') {
      const op = this.peek().kind
      this.i++
      const rhs = this.parseUnary()
      lhs = op === 'eq' ? lhs === rhs : lhs !== rhs
    }
    return lhs
  }

  private parseUnary(): unknown {
    if (this.peek().kind === 'bang') {
      this.i++
      return !this.parseUnary()
    }
    return this.parsePrimary()
  }

  private parsePrimary(): unknown {
    const t = this.peek()
    if (t.kind === 'lparen') {
      this.i++
      const v = this.parseOr()
      this.eat('rparen')
      return v
    }
    if (t.kind === 'string') {
      this.i++
      return t.value
    }
    if (t.kind === 'bool') {
      this.i++
      return t.value === 'true'
    }
    if (t.kind === 'ident') {
      this.i++
      // Resolve identifier from the supplied context. Missing keys are `undefined`,
      // which lets `agentSurface !== "none"` work even if the key is absent.
      return Object.prototype.hasOwnProperty.call(this.ctx, t.value)
        ? this.ctx[t.value]
        : undefined
    }
    throw new Error(`unexpected token ${t.kind} (${JSON.stringify(t.value)}) at position ${t.pos}`)
  }
}

/**
 * Evaluate a `when` expression against a context object.
 * Returns the truthiness of the resolved value.
 *
 * Throws Error on any unrecognized syntax — never silently fails.
 */
export function evalWhen(expr: string, context: Record<string, unknown>): boolean {
  if (typeof expr !== 'string') {
    throw new Error('evalWhen: expression must be a string')
  }
  const tokens = tokenize(expr)
  const parser = new Parser(tokens, context)
  const result = parser.parseExpr()
  return Boolean(result)
}
