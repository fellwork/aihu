/**
 * state-wrapper codemod (#487 §7 — waves 1 + 2, the app-corpus migration)
 *
 * Migrates an `.aihu` file's `@state` block from the retired forms to the
 * ratified wrapper model (`docs/plans/state-model/40-spec.md`):
 *
 *   Stage 1 — `$`-macros → wrappers / statement calls / directives (§2, §3):
 *     $prop: { x: { … } }        → const|let x = prop<T>({ … })
 *     $computed: { x: fn }       → const x = derived(cfg?, fn)
 *     $action: { f: fn }         → const f = action(cfg?, fn)
 *     $resource: { r: fn }       → const r = resource(cfg?, fn)
 *     $controller: { c: {value} }→ const c = controller(cfg?, factory)
 *     $effect: fn / { name: fn } → effect(fn) / effect({ on: […] }, fn)
 *     $lifecycle: { mount, … }   → onMount(fn), onDispose(fn), …
 *     $aria: { … } / $form: { … }→ aria({ … }) / form({ … })
 *     $context: {provide,consume}→ provide('k', v) / const k = consume<T>('k')
 *     $route name                → const name = route()
 *     $before/afterNavigate(fn)  → beforeNavigate(fn) / afterNavigate(fn)
 *     $extends: X / $shadow: 'm' → base: X / shadow: 'm'
 *     bare typed decl `x: T = v` → let x = state(v) (reactive) |
 *                                  plain let/const (inert; §3 row 21 + W627)
 *
 *   Stage 2 — signal tuples → `state` (§7 wave 2), INCLUDING call sites:
 *     const [x, setX] = signal(v) → let x = state(v)
 *     x()                         → x
 *     setX(v)                     → x = v          (statement / handler)
 *     setX(p => expr)             → x = expr[p→x]  (updater desugar)
 *
 * Byte-identity contract: `$`-macro migrations lower onto the SAME IR, so a
 * stage-1-only migration emits byte-identical JS (modulo the old parser's
 * `strip_line_comments` artifact — authored `//` comments inside metadata-bag
 * bodies were BLANKED in old emission and are preserved by the wrapper path).
 * To keep even whitespace stable, entry VALUE text is spliced verbatim — the
 * codemod never re-indents running code.
 *
 * Per-file dialect exclusivity (C625): a file either migrates fully or not at
 * all. Any unmappable `$`-form (e.g. the `mount:`-keyed `$controller`, which
 * has no wrapper equivalent) aborts the file with a warning. Authored signal
 * tuples are exempt from C625 (orthogonal), so a tuple pair whose setter is
 * used as a VALUE (not called) is kept authored, per-pair.
 */

export interface StateWrapperResult {
  readonly rewritten: string
  readonly warnings: readonly string[]
  /** True when the file was left byte-untouched (nothing to do, or aborted). */
  readonly skipped: boolean
  /** Which change classes were applied — drives the verification bucket. */
  readonly changes: {
    macros: boolean
    tuples: boolean
    bareTyped: boolean
  }
  /** Tuple pairs migrated: authored setter name → state binding name. */
  readonly renamedSetters: ReadonlyArray<{ getter: string; setter: string }>
}

export interface StateWrapperOptions {
  /** Run only stage 1 ($-macros + bare typed decls). */
  macrosOnly?: boolean
  /** Run only stage 2 (signal tuples + call sites). */
  tuplesOnly?: boolean
  /**
   * Binding names that must stay PLAIN even when the reactive heuristic says
   * `state(…)` (e.g. a fixture guard depends on the plain-let lowering).
   */
  keepPlain?: readonly string[]
}

const INDENT = '  '

// ─── JS-aware scanning helpers ──────────────────────────────────────────────

function skipString(s: string, i: number): number {
  const quote = s[i]!
  let j = i + 1
  while (j < s.length) {
    const c = s[j]
    if (c === '\\') {
      j += 2
      continue
    }
    if (quote === '`' && c === '$' && s[j + 1] === '{') {
      const close = matchBrace(s, j + 1)
      j = close < 0 ? s.length : close + 1
      continue
    }
    if (c === quote) return j + 1
    j++
  }
  return s.length
}

/** Matching `}` for the `{` at `i` (string/comment aware). */
export function matchBrace(s: string, i: number): number {
  if (s[i] !== '{') return -1
  let depth = 0
  let j = i
  while (j < s.length) {
    const c = s[j]
    if (c === '/' && s[j + 1] === '/') {
      const nl = s.indexOf('\n', j)
      j = nl < 0 ? s.length : nl
      continue
    }
    if (c === '/' && s[j + 1] === '*') {
      const end = s.indexOf('*/', j + 2)
      j = end < 0 ? s.length : end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      j = skipString(s, j)
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return j
    }
    j++
  }
  return -1
}

/** Matching `)` for the `(` at `i` (string/comment/brace aware). */
export function matchParen(s: string, i: number): number {
  if (s[i] !== '(') return -1
  let depth = 0
  let j = i
  while (j < s.length) {
    const c = s[j]
    if (c === '/' && s[j + 1] === '/') {
      const nl = s.indexOf('\n', j)
      j = nl < 0 ? s.length : nl
      continue
    }
    if (c === '/' && s[j + 1] === '*') {
      const end = s.indexOf('*/', j + 2)
      j = end < 0 ? s.length : end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      j = skipString(s, j)
      continue
    }
    if (c === '{') {
      const close = matchBrace(s, j)
      j = close < 0 ? s.length : close + 1
      continue
    }
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return j
    }
    j++
  }
  return -1
}

/** Split `{…}`-stripped object-literal text at top-level commas. */
function splitTopLevelCommas(s: string): string[] {
  const out: string[] = []
  let start = 0
  let j = 0
  let depthParen = 0
  let depthBrace = 0
  let depthBracket = 0
  const depthAngle = 0
  while (j < s.length) {
    const c = s[j]
    if (c === '/' && s[j + 1] === '/') {
      const nl = s.indexOf('\n', j)
      j = nl < 0 ? s.length : nl
      continue
    }
    if (c === '/' && s[j + 1] === '*') {
      const end = s.indexOf('*/', j + 2)
      j = end < 0 ? s.length : end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      j = skipString(s, j)
      continue
    }
    if (c === '(') depthParen++
    else if (c === ')') depthParen--
    else if (c === '{') depthBrace++
    else if (c === '}') depthBrace--
    else if (c === '[') depthBracket++
    else if (c === ']') depthBracket--
    else if (c === '<' && depthAngle >= 0 && /[A-Za-z0-9_$>\s]/.test(s[j + 1] ?? '')) {
      // Track angle depth loosely; `=>` never reaches here because the `=`
      // branch below runs first when scanning left-to-right.
    } else if (
      c === ',' &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0 &&
      depthAngle === 0
    ) {
      out.push(s.slice(start, j))
      start = j + 1
    }
    j++
  }
  if (s.slice(start).trim() !== '') out.push(s.slice(start))
  return out
}

/**
 * Parse one collection entry `name: value` — the value keeps its raw text
 * (newlines and indentation included; splicing is verbatim by contract).
 */
interface Entry {
  name: string
  value: string
  /** Comment lines preceding the entry inside the collection body. */
  leading: string
}

function parseEntries(inner: string): Entry[] {
  const entries: Entry[] = []
  for (const piece of splitTopLevelCommas(inner)) {
    const withoutLead = piece.replace(/^\s*\n/, '')
    // Separate leading comment lines from the entry itself.
    const lines = withoutLead.split('\n')
    let k = 0
    const leadingLines: string[] = []
    while (k < lines.length) {
      const t = lines[k]!.trim()
      if (t === '' || t.startsWith('//') || t.startsWith('/*') || t.startsWith('*')) {
        leadingLines.push(lines[k]!)
        k++
        continue
      }
      break
    }
    const rest = lines.slice(k).join('\n')
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(rest)
    if (!m) continue
    entries.push({
      name: m[1]!,
      value: rest.slice(m[0].length).replace(/^[ \t]/, ''),
      leading: leadingLines.join('\n'),
    })
  }
  return entries
}

/** Parse a metadata bag `{ key: value, … }` into raw key/value pairs. */
function parseMetaPairs(objText: string): Map<string, string> | null {
  const t = objText.trim()
  if (!t.startsWith('{')) return null
  const close = matchBrace(t, 0)
  if (close < 0) return null
  const inner = t.slice(1, close)
  const pairs = new Map<string, string>()
  for (const piece of splitTopLevelCommas(inner)) {
    const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(piece)
    if (!m) continue
    pairs.set(
      m[1]!,
      piece
        .slice(m[0].length)
        .replace(/^[ \t]/, '')
        .replace(/\s+$/, ''),
    )
  }
  return pairs
}

/** Whether `expr` is a function expression (arrow or `function`). */
function isFnExpr(expr: string): boolean {
  const t = expr.trim()
  if (t.startsWith('function')) return true
  if (/^async\b/.test(t)) return true
  if (t.startsWith('(')) {
    const close = matchParen(t, 0)
    if (close < 0) return false
    const after = t.slice(close + 1).trimStart()
    if (after.startsWith('=>')) return true
    // Return-type annotation: `(args): Type => …`.
    if (after.startsWith(':')) {
      const arrowAt = after.indexOf('=>')
      return arrowAt > 0
    }
    return false
  }
  return /^[A-Za-z_$][\w$]*\s*=>/.test(t)
}

// ─── Block location ─────────────────────────────────────────────────────────

interface BlockSpan {
  start: number
  end: number
  bodyStart: number
  bodyEnd: number
  body: string
}

function findBlock(source: string, name: string): BlockSpan | null {
  const re = new RegExp(`(^|\\n)([ \\t]*)@${name}\\s*\\{`, 'g')
  const m = re.exec(source)
  if (!m) return null
  const start = m.index + (m[1] === '\n' ? 1 : 0)
  const openIdx = m.index + m[0].length - 1
  const closeIdx = matchBrace(source, openIdx)
  if (closeIdx < 0) return null
  return {
    start,
    end: closeIdx + 1,
    bodyStart: openIdx + 1,
    bodyEnd: closeIdx,
    body: source.slice(openIdx + 1, closeIdx),
  }
}

// ─── Write / read detection (the nature + reactivity heuristics) ────────────

/**
 * Does `code` WRITE `name`? Assignment (plain or compound) or update
 * expression. `==`/`===`/`=>`/`<=`/`>=`/`!=` never match: the operator char
 * preceding `=` breaks the `name\s*OP=` shape, and the lookahead rejects
 * `==`/`=>` after a bare `=`.
 */
function writesName(code: string, name: string): boolean {
  const esc = name.replace(/\$/g, '\\$')
  const re = new RegExp(
    `\\b${esc}\\s*(\\+\\+|--|(?:\\+|-|\\*|/|%|\\*\\*|&&|\\|\\||\\?\\?|&|\\||\\^|<<|>>>?)?=(?![=>]))`,
  )
  return re.test(code)
}

function readsName(code: string, name: string): boolean {
  const esc = name.replace(/\$/g, '\\$')
  return new RegExp(`\\b${esc}\\b`).test(code)
}

/** Template two-way bindings (`bind:value={name}`) WRITE their target. */
function bindWrites(templateText: string, name: string): boolean {
  const esc = name.replace(/\$/g, '\\$')
  return new RegExp(`\\bbind:[\\w-]+=\\{\\s*${esc}\\s*\\}`).test(templateText)
}

// ─── Stage 1: $-macros + bare typed declarations ────────────────────────────

/** TS spelling for a v2 `type:` value (String → string, quoted → unquoted). */
function tsType(raw: string): string {
  const t = raw.trim()
  // Unquote only a SINGLE string literal (`type: 'string'`); a union of
  // literal types (`'a' | 'b'`) also starts and ends with a quote but must
  // stay verbatim.
  const isOneLiteral =
    ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) &&
    !t.slice(1, -1).includes(t[0]!)
  const unq = isOneLiteral ? t.slice(1, -1) : t
  switch (unq) {
    case 'String':
      return 'string'
    case 'Number':
      return 'number'
    case 'Boolean':
      return 'boolean'
    case 'Array':
      return 'unknown[]'
    case 'Object':
      return 'Record<string, unknown>'
    default:
      return unq
  }
}

/** Is the default literal rich enough that `prop<T>` inference covers it? */
function defaultCarriesType(typeRaw: string | undefined, defaultRaw: string | undefined): boolean {
  if (defaultRaw === undefined) return false
  const d = defaultRaw.trim()
  if (d === 'null' || d === 'undefined' || d === '[]' || d === '{}') return false
  if (!typeRaw) return true
  const t = typeRaw.trim()
  // Constructor hints (String/Number/Boolean/Array/Object) are fully covered
  // by a concrete default; real TS types (unions, generics) are kept.
  return /^(String|Number|Boolean|Array|Object)$/.test(t)
}

/** `expose: { read: true, write: true }` → the §6.1 shorthand. */
function exposeShorthand(raw: string): string {
  const pairs = parseMetaPairs(raw.trim())
  if (pairs) {
    const read = pairs.get('read')?.trim() === 'true'
    const write = pairs.get('write')?.trim() === 'true'
    const extraneous = [...pairs.keys()].some((k) => k !== 'read' && k !== 'write')
    if (!extraneous) {
      if (read && write) return `'read write'`
      if (read) return `'read'`
      if (write) return `'write'`
    }
  }
  return raw.trim()
}

interface StageState {
  warnings: string[]
  changedMacros: boolean
  changedBareTyped: boolean
  aborted: boolean
}

/**
 * Build the wrapper declaration for one `$prop` entry.
 * `mutable` decides the nature (`let` vs `const`) — the §2.2 axes.
 */
function emitPropDecl(entry: Entry, mutable: boolean): string {
  const meta = parseMetaPairs(entry.value)
  if (!meta) return `${INDENT}// UNMIGRATABLE $prop entry ${entry.name}`
  const typeRaw = meta.get('type')
  const defaultRaw = meta.get('default')
  const parts: string[] = []
  if (defaultRaw !== undefined) parts.push(`default: ${defaultRaw}`)
  const describe = meta.get('describe')
  if (describe !== undefined) parts.push(`describe: ${describe}`)
  const expose = meta.get('expose')
  if (expose !== undefined) parts.push(`expose: ${exposeShorthand(expose)}`)
  const attribute = meta.get('attribute')
  if (attribute !== undefined) parts.push(`attribute: ${attribute}`)
  const reflect = meta.get('reflect')
  if (reflect !== undefined) parts.push(`reflect: ${reflect}`)
  const required = meta.get('required')
  if (required !== undefined) parts.push(`required: ${required}`)

  const generic = typeRaw && !defaultCarriesType(typeRaw, defaultRaw) ? `<${tsType(typeRaw)}>` : ''
  const nature = mutable ? 'let' : 'const'
  const head = `${INDENT}${nature} ${entry.name} = prop${generic}(`
  if (parts.length === 0) return `${head})`
  const inline = `${head}{ ${parts.join(', ')} })`
  if (!inline.includes('\n') && inline.length <= 100) return inline
  // Multi-line config: one key per line. Values keep their raw text.
  const lines = [`${head}{`]
  for (const p of parts) lines.push(`${INDENT}${INDENT}${p},`)
  lines.push(`${INDENT}})`)
  return lines.join('\n')
}

/**
 * Config-first wrapper call for computed/action/resource/controller entries.
 * The running-code text is spliced VERBATIM (byte-identity contract).
 */
function emitConfigFirstDecl(
  wrapper: 'derived' | 'action' | 'resource' | 'controller' | 'effect',
  name: string | null,
  meta: Map<string, string> | null,
  fnRaw: string,
): string {
  const decl = name === null ? `${INDENT}${wrapper}(` : `${INDENT}const ${name} = ${wrapper}(`
  const cfgParts: string[] = []
  if (meta) {
    const describe = meta.get('describe')
    if (describe !== undefined) cfgParts.push(`describe: ${describe}`)
    const expose = meta.get('expose')
    if (expose !== undefined) cfgParts.push(`expose: ${exposeShorthand(expose)}`)
    const on = meta.get('on')
    if (on !== undefined) cfgParts.push(`on: ${on}`)
  }
  const fn = fnRaw.replace(/\s+$/, '')
  if (cfgParts.length === 0) return `${decl}${fn})`
  const cfgInline = `{ ${cfgParts.join(', ')} }`
  if (!cfgInline.includes('\n') && decl.length + cfgInline.length <= 98) {
    return `${decl}\n${INDENT}${INDENT}${cfgInline},\n${INDENT}${INDENT}${fn})`
  }
  const lines = [
    `${decl}`,
    `${INDENT}${INDENT}{ ${cfgParts.join(',\n' + INDENT + INDENT + '  ')} },`,
  ]
  lines.push(`${INDENT}${INDENT}${fn})`)
  return lines.join('\n')
}

/** One `$computed`/`$action`/`$resource` entry → wrapper declaration. */
function emitValueEntryDecl(
  wrapper: 'derived' | 'action' | 'resource',
  entry: Entry,
  st: StageState,
): string | null {
  const codeKey = wrapper === 'action' ? 'handler' : 'value'
  if (isFnExpr(entry.value)) {
    return emitConfigFirstDecl(wrapper, entry.name, null, entry.value)
  }
  const meta = parseMetaPairs(entry.value)
  if (!meta) {
    st.warnings.push(`unrecognized ${wrapper} entry shape for '${entry.name}'`)
    return null
  }
  const fn = meta.get(codeKey)
  if (fn === undefined) {
    st.warnings.push(`${wrapper} entry '${entry.name}' has no ${codeKey}: key`)
    return null
  }
  // Refuse silent metadata loss: only describe/expose (+ the code key) map.
  for (const k of meta.keys()) {
    if (k !== 'describe' && k !== 'expose' && k !== codeKey) {
      st.warnings.push(`${wrapper} entry '${entry.name}' carries unmapped key '${k}:'`)
      return null
    }
  }
  return emitConfigFirstDecl(wrapper, entry.name, meta, fn)
}

function migrateStateMacrosBody(
  body: string,
  templateText: string,
  st: StageState,
  keepPlain: ReadonlySet<string>,
): string {
  // Reactive-read corpus for the bare-typed heuristic: the template plus
  // every derivation-position body ($computed/$form/$aria/$resource values).
  // A colon-form field read there needs real reactivity → state(). $effect
  // bodies are deliberately EXCLUDED: a field both read and written inside
  // one effect (the debounce-timer idiom) would, as a signal, re-trigger its
  // own effect — the inert plain `let` is the faithful migration there.
  let derivationText = ''
  {
    const re = /^[ \t]*\$(computed|form|aria|resource)\s*:\s*\{/gm
    let m: RegExpExecArray | null = re.exec(body)
    while (m !== null) {
      const open = m.index + m[0].length - 1
      const close = matchBrace(body, open)
      if (close > 0) derivationText += body.slice(open, close + 1)
      m = re.exec(body)
    }
  }
  const reactiveReadCorpus = templateText + '\n' + derivationText

  const out: string[] = []
  let i = 0
  while (i < body.length) {
    const nl = body.indexOf('\n', i)
    const lineEnd = nl < 0 ? body.length : nl
    const lineRaw = body.slice(i, lineEnd)
    const line = lineRaw.trim()
    const indentLen = lineRaw.length - lineRaw.trimStart().length
    const lineStart = i + indentLen

    // ── $-collections ──────────────────────────────────────────────────────
    const coll =
      /^\$(prop|computed|action|resource|effect|lifecycle|aria|form|context|controller|event|stream|extract)\s*:\s*/.exec(
        line,
      )
    if (coll) {
      const kind = coll[1]!
      const afterColon = lineStart + coll[0].length
      // `$effect: () => …` — anonymous statement form.
      if (kind === 'effect' && body[afterColon] !== '{') {
        const fnStart = afterColon
        const end = scanArrowEnd(body, fnStart)
        if (end < 0) {
          st.warnings.push('unparseable anonymous $effect — file left unmigrated')
          st.aborted = true
          return body
        }
        const fn = body.slice(fnStart, end).replace(/\s+$/, '')
        out.push(`${INDENT}effect(${fn})`)
        st.changedMacros = true
        i = end
        if (body[i] === ';') i++
        if (body[i] === '\n') i++
        continue
      }
      if (body[afterColon] !== '{') {
        st.warnings.push(`unrecognized $${kind} value shape — file left unmigrated`)
        st.aborted = true
        return body
      }
      const close = matchBrace(body, afterColon)
      if (close < 0) {
        st.aborted = true
        return body
      }
      const inner = body.slice(afterColon + 1, close)
      const entries = parseEntries(inner)
      const decls: string[] = []
      const push = (leading: string, text: string | null) => {
        if (text === null) {
          st.aborted = true
          return
        }
        if (leading.trim()) decls.push(leading.replace(/\s+$/, ''))
        decls.push(text)
      }
      switch (kind) {
        case 'prop': {
          for (const e of entries) {
            const mutable =
              writesName(body, e.name) ||
              writesName(templateText, e.name) ||
              bindWrites(templateText, e.name)
            push(e.leading, emitPropDecl(e, mutable))
          }
          break
        }
        case 'computed':
        case 'action':
        case 'resource': {
          const wrapper = kind === 'computed' ? 'derived' : (kind as 'action' | 'resource')
          for (const e of entries) push(e.leading, emitValueEntryDecl(wrapper, e, st))
          break
        }
        case 'effect': {
          for (const e of entries) {
            if (isFnExpr(e.value)) {
              push(e.leading, `${INDENT}effect(${e.value.replace(/\s+$/, '')})`)
            } else {
              const meta = parseMetaPairs(e.value)
              const fn = meta?.get('value')
              if (!meta || fn === undefined) {
                st.warnings.push(`$effect entry '${e.name}' unrecognized — file left unmigrated`)
                st.aborted = true
                return body
              }
              push(e.leading, emitConfigFirstDecl('effect', null, meta, fn))
            }
          }
          break
        }
        case 'lifecycle': {
          const hookFor: Record<string, string> = {
            mount: 'onMount',
            dispose: 'onDispose',
            adopt: 'onAdopt',
            attributeChange: 'onAttributeChange',
          }
          for (const e of entries) {
            const hook = hookFor[e.name]
            if (!hook) {
              st.warnings.push(`unknown $lifecycle key '${e.name}' — file left unmigrated`)
              st.aborted = true
              return body
            }
            push(e.leading, `${INDENT}${hook}(${e.value.replace(/\s+$/, '')})`)
          }
          break
        }
        case 'aria':
        case 'form': {
          // One config object, inner text verbatim.
          const innerTrimmed = inner.replace(/^\s*\n/, '').replace(/\s+$/, '')
          push('', `${INDENT}${kind}({\n${innerTrimmed}\n${INDENT}})`)
          break
        }
        case 'context': {
          for (const e of entries) {
            if (e.name === 'provide') {
              const sub = parseMetaPairs(e.value)
              if (!sub) {
                st.aborted = true
                return body
              }
              for (const [key, valObj] of sub) {
                const valMeta = parseMetaPairs(valObj)
                const value = valMeta?.get('value')
                if (value === undefined) {
                  st.warnings.push(`$context provide '${key}' has no value: — file left unmigrated`)
                  st.aborted = true
                  return body
                }
                push(e.leading, `${INDENT}provide('${key}', ${value})`)
              }
            } else if (e.name === 'consume') {
              const sub = parseMetaPairs(e.value)
              if (!sub) {
                st.aborted = true
                return body
              }
              for (const [key, valObj] of sub) {
                const valMeta = parseMetaPairs(valObj)
                const typeRaw = valMeta?.get('type')
                const generic = typeRaw ? `<${tsType(typeRaw)}>` : ''
                push(e.leading, `${INDENT}const ${key} = consume${generic}('${key}')`)
              }
            } else {
              st.aborted = true
              return body
            }
          }
          break
        }
        case 'controller': {
          for (const e of entries) {
            const meta = parseMetaPairs(e.value)
            const factory = meta?.get('value')
            if (!meta || factory === undefined) {
              st.warnings.push(
                `$controller entry '${e.name}' has no value: factory (the mount:-keyed shape ` +
                  `has no wrapper equivalent) — file left unmigrated`,
              )
              st.aborted = true
              return body
            }
            push(e.leading, emitConfigFirstDecl('controller', e.name, meta, factory))
          }
          break
        }
        case 'extract': {
          // Directive rename only; value verbatim.
          push('', `${INDENT}extract: ${body.slice(afterColon, close + 1)}`)
          break
        }
        default: {
          st.warnings.push(`$${kind} has no app-corpus mapping — file left unmigrated`)
          st.aborted = true
          return body
        }
      }
      if (st.aborted) return body
      out.push(decls.join('\n'))
      st.changedMacros = true
      i = close + 1
      if (body[i] === ';') i++
      if (body[i] === '\n') i++
      continue
    }

    // ── Directives + dedicated forms ───────────────────────────────────────
    const extendsM = /^\$extends\s*:\s*(.+)$/.exec(line)
    if (extendsM) {
      out.push(`${' '.repeat(indentLen)}base: ${extendsM[1]!.trim()}`)
      st.changedMacros = true
      i = lineEnd + 1
      continue
    }
    const shadowM = /^\$shadow\s*:\s*(.+)$/.exec(line)
    if (shadowM) {
      out.push(`${' '.repeat(indentLen)}shadow: ${shadowM[1]!.trim()}`)
      st.changedMacros = true
      i = lineEnd + 1
      continue
    }
    const routeM = /^\$route\s+([A-Za-z_$][\w$]*)\s*;?$/.exec(line)
    if (routeM) {
      out.push(`${' '.repeat(indentLen)}const ${routeM[1]} = route()`)
      st.changedMacros = true
      i = lineEnd + 1
      continue
    }
    if (/^\$(beforeNavigate|afterNavigate)\s*\(/.test(line)) {
      const parenIdx = body.indexOf('(', lineStart)
      const close = matchParen(body, parenIdx)
      if (close < 0) {
        st.aborted = true
        return body
      }
      let end = close + 1
      if (body[end] === ';') end++
      out.push(`${' '.repeat(indentLen)}${body.slice(lineStart + 1, end)}`)
      st.changedMacros = true
      i = end
      if (body[i] === '\n') i++
      continue
    }
    if (line.startsWith('$')) {
      st.warnings.push(`unmapped macro form '${line.split(/\s|\(|:/)[0]}' — file left unmigrated`)
      st.aborted = true
      return body
    }

    // ── Bare typed declaration `name: T = v` (§3 row 21) ───────────────────
    const bare = /^([A-Za-z_$][\w$]*)\s*:\s*([^=\n]+?)\s*=\s*(.+?);?\s*$/.exec(line)
    if (
      bare &&
      !/^(if|else|for|while|return|case|default|import|export|type|interface)\b/.test(line)
    ) {
      const name = bare[1]!
      const typeRaw = bare[2]!.trim()
      const init = bare[3]!.trim()
      const ws = ' '.repeat(indentLen)
      const written =
        writesName(stripSpan(body, i, lineEnd), name) ||
        writesName(templateText, name) ||
        bindWrites(templateText, name)
      const reactivelyRead = readsName(reactiveReadCorpus, name)
      if (written && reactivelyRead && !keepPlain.has(name)) {
        const inferrable =
          /^(-?\d|'|"|`|true$|false$)/.test(init) && init !== 'null' && init !== 'undefined'
        const generic = inferrable ? '' : `<${typeRaw}>`
        out.push(`${ws}let ${name} = state${generic}(${init})`)
      } else if (written) {
        out.push(`${ws}let ${name}: ${typeRaw} = ${init}`)
      } else {
        out.push(`${ws}const ${name}: ${typeRaw} = ${init}`)
      }
      st.changedBareTyped = true
      i = lineEnd + 1
      continue
    }

    // ── Everything else: verbatim, consuming balanced multi-line statements
    const stmtEnd = consumeBalancedStatement(body, i)
    out.push(body.slice(i, stmtEnd).replace(/\n$/, ''))
    i = stmtEnd
  }
  return out.join('\n')
}

/** Remove a span (decl's own line) so self-matches don't count as writes. */
function stripSpan(s: string, start: number, end: number): string {
  return s.slice(0, start) + s.slice(end)
}

/** Consume one whole statement (through balanced brackets) incl. newline. */
function consumeBalancedStatement(body: string, start: number): number {
  let depth = 0
  let j = start
  while (j < body.length) {
    const c = body[j]!
    if (c === '/' && body[j + 1] === '/') {
      const nl = body.indexOf('\n', j)
      j = nl < 0 ? body.length : nl
      continue
    }
    if (c === '/' && body[j + 1] === '*') {
      const end = body.indexOf('*/', j + 2)
      j = end < 0 ? body.length : end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      j = skipString(body, j)
      continue
    }
    if (c === '(' || c === '{' || c === '[') depth++
    else if (c === ')' || c === '}' || c === ']') depth--
    else if (c === '\n' && depth <= 0) return j + 1
    j++
  }
  return body.length
}

/** End offset (exclusive) of an arrow/function expression at `start`. */
function scanArrowEnd(s: string, start: number): number {
  let p = start
  while (p < s.length && /[ \t]/.test(s[p]!)) p++
  if (s.slice(p, p + 5) === 'async') {
    p += 5
    while (p < s.length && /[ \t]/.test(s[p]!)) p++
  }
  if (s.slice(p, p + 8) === 'function') {
    const braceIdx = s.indexOf('{', p)
    if (braceIdx < 0) return -1
    const close = matchBrace(s, braceIdx)
    return close < 0 ? -1 : close + 1
  }
  if (s[p] === '(') {
    const parenClose = matchParen(s, p)
    if (parenClose < 0) return -1
    p = parenClose + 1
  } else {
    // single-ident param
    const m = /^[A-Za-z_$][\w$]*/.exec(s.slice(p))
    if (!m) return -1
    p += m[0].length
  }
  while (p < s.length && /[ \t]/.test(s[p]!)) p++
  if (s[p] === ':') {
    const arrowAt = s.indexOf('=>', p)
    if (arrowAt < 0) return -1
    p = arrowAt
  }
  if (s.slice(p, p + 2) !== '=>') return -1
  p += 2
  while (p < s.length && /[ \t]/.test(s[p]!)) p++
  if (s[p] === '{') {
    const close = matchBrace(s, p)
    return close < 0 ? -1 : close + 1
  }
  // Expression body: to end of line (top-level).
  const nl = s.indexOf('\n', p)
  return nl < 0 ? s.length : nl
}

// ─── Stage 2: signal tuples ─────────────────────────────────────────────────

interface TuplePair {
  getter: string
  setter: string | null
  generic: string
  init: string
  declStart: number
  declEnd: number
}

function findTuples(body: string, offset: number): TuplePair[] {
  const pairs: TuplePair[] = []
  const re =
    /(^|\n)([ \t]*)(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*(?:,\s*([A-Za-z_$][\w$]*)\s*)?\]\s*=\s*signal\b/g
  let m: RegExpExecArray | null = re.exec(body)
  while (m !== null) {
    const declStart = m.index + m[1]!.length + m[2]!.length
    let p = m.index + m[0].length
    let generic = ''
    if (body[p] === '<') {
      // balanced angle scan
      let depth = 1
      let j = p + 1
      while (j < body.length && depth > 0) {
        if (body[j] === '<') depth++
        else if (body[j] === '>') depth--
        j++
      }
      generic = body.slice(p, j)
      p = j
    }
    if (body[p] !== '(') {
      m = re.exec(body)
      continue
    }
    const close = matchParen(body, p)
    if (close < 0) {
      m = re.exec(body)
      continue
    }
    const init = body.slice(p + 1, close)
    let declEnd = close + 1
    if (body[declEnd] === ';') declEnd++
    pairs.push({
      getter: m[3]!,
      setter: m[4] ?? null,
      generic,
      init,
      declStart: declStart + offset,
      declEnd: declEnd + offset,
    })
    m = re.exec(body)
  }
  return pairs
}

/** All indexes of `name(` call heads in `text` (word-boundary). */
function callSites(text: string, name: string): number[] {
  const out: number[] = []
  const esc = name.replace(/\$/g, '\\$')
  const re = new RegExp(`(?<![\\w$.])${esc}\\s*\\(`, 'g')
  let m: RegExpExecArray | null = re.exec(text)
  while (m !== null) {
    out.push(m.index)
    m = re.exec(text)
  }
  return out
}

/** Rewrite one setter call `setX(ARG)` → assignment text. */
function rewriteSetterCall(
  text: string,
  at: number,
  setter: string,
  getter: string,
  warnings: string[],
): { replaced: string; start: number; end: number } | null {
  const parenIdx = text.indexOf('(', at + setter.length - 1)
  const open = text.indexOf('(', at)
  const close = matchParen(text, open)
  if (close < 0) return null
  void parenIdx
  const arg = text.slice(open + 1, close).trim()

  // Updater form: `p => expr` / `(p) => expr` / `(p: T) => expr`.
  let rhs: string | null = null
  const upd =
    /^(?:\(\s*([A-Za-z_$][\w$]*)\s*(?::[^)]*)?\)|([A-Za-z_$][\w$]*))\s*=>\s*([\s\S]+)$/.exec(arg)
  if (upd) {
    const param = upd[1] ?? upd[2]!
    const bodyExpr = upd[3]!.trim()
    if (bodyExpr.startsWith('{')) {
      warnings.push(
        `updater with block body at ${setter}(${arg.slice(0, 30)}…) — kept as an IIFE over the current value`,
      )
      rhs = `(${arg})(${getter})`
    } else {
      const esc = param.replace(/\$/g, '\\$')
      rhs = bodyExpr.replace(new RegExp(`\\b${esc}\\b`, 'g'), getter)
    }
  } else {
    rhs = arg
  }

  // Context: statement / arrow-body / expression position.
  let k = at - 1
  while (k >= 0 && /[ \t]/.test(text[k]!)) k--
  const isArrowBody = k >= 1 && text[k] === '>' && text[k - 1] === '='
  // Walk back over `await`.
  let stmtProbe = k
  const beforeWord = /(?:^|[\s;{}])await$/.exec(text.slice(Math.max(0, k - 6), k + 1))
  if (beforeWord) stmtProbe = k - 5 - 1
  const prevCh = stmtProbe >= 0 ? text[stmtProbe] : '\n'
  const isStatement = prevCh === '\n' || prevCh === ';' || prevCh === '{' || stmtProbe < 0

  let replaced: string
  if (isArrowBody) {
    replaced = `{ ${getter} = ${rhs} }`
  } else if (isStatement) {
    replaced = `${getter} = ${rhs}`
  } else {
    replaced = `(${getter} = ${rhs})`
  }
  const end = close + 1
  return { replaced, start: at, end }
}

function migrateTuplesIn(
  source: string,
  st: { warnings: string[]; changedTuples: boolean },
  renamed: Array<{ getter: string; setter: string }>,
): string {
  const state = findBlock(source, 'state')
  if (!state) return source
  const pairs = findTuples(state.body, state.bodyStart)
  if (pairs.length === 0) return source

  let text = source
  // Process pairs last-to-first so recorded spans stay valid.
  for (const pair of [...pairs].reverse()) {
    const { getter, setter } = pair
    // Guard: setter referenced as a VALUE (not a call) anywhere → keep pair.
    if (setter) {
      const esc = setter.replace(/\$/g, '\\$')
      const valueUse = new RegExp(`(?<![\\w$.'"\`])${esc}(?![\\w$]|\\s*\\()`)
      const outsideDecl = stripSpan(text, pair.declStart, pair.declEnd)
      if (valueUse.test(outsideDecl)) {
        st.warnings.push(
          `tuple [${getter}, ${setter}] kept authored — the setter is used as a value ` +
            `(cannot be expressed as a state binding during the compat window)`,
        )
        continue
      }
    }

    // 1. Setter calls → assignments (whole file: @state body + @template).
    if (setter) {
      let sites = callSites(text, setter)
      // Skip the declaration site itself.
      sites = sites.filter((idx) => idx < pair.declStart || idx >= pair.declEnd)
      for (const idx of sites.reverse()) {
        const r = rewriteSetterCall(text, idx, setter, getter, st.warnings)
        if (!r) {
          st.warnings.push(`unbalanced ${setter}(…) call — left untouched`)
          continue
        }
        text = text.slice(0, r.start) + r.replaced + text.slice(r.end)
      }
    }

    // 2. Getter reads `x()` → `x` (whole file; empty-arg calls only).
    {
      const esc = getter.replace(/\$/g, '\\$')
      // Reject member reads (`obj.x()`) but allow spread (`...x()`): the
      // preceding dot only blocks when it is not itself part of `...`.
      text = text.replace(
        new RegExp(`(?<![\\w$])(?<!(?<!\\.)\\.)${esc}\\s*\\(\\s*\\)`, 'g'),
        getter,
      )
    }

    // 3. The declaration itself. Re-locate it (upstream edits shifted spans
    //    only AFTER the decl, but re-find defensively).
    {
      const esc = getter.replace(/\$/g, '\\$')
      const declRe = new RegExp(
        `(?:const|let)\\s*\\[\\s*${esc}\\s*(?:,\\s*[A-Za-z_$][\\w$]*\\s*)?\\]\\s*=\\s*signal(<[^\\n]*?>)?\\(`,
      )
      const dm = declRe.exec(text)
      if (dm) {
        const open = text.indexOf('(', dm.index + dm[0].length - 1)
        const close = matchParen(text, open)
        if (close > 0) {
          let declEnd = close + 1
          if (text[declEnd] === ';') declEnd++
          const generic = dm[1] ?? ''
          const init = text.slice(open + 1, close)
          // An object-literal initial value must be parenthesized: the
          // one-signature rule parses `state({…})` as the reserved CONFIG
          // bag (split_config_fn), so a bare `{}` init is C629.
          const initOut = init.trim().startsWith('{') ? `(${init})` : init
          text =
            text.slice(0, dm.index) +
            `let ${getter} = state${generic}(${initOut})` +
            text.slice(declEnd)
        }
      }
    }

    st.changedTuples = true
    if (setter) renamed.push({ getter, setter })
  }

  // Drop the `signal` import when no `signal(`/`signal<` use remains.
  if (!/\bsignal\s*[(<]/.test(text)) {
    text = text.replace(
      /^([ \t]*)import\s*\{([^}]*)\}\s*from\s*'@aihu\/signals'\s*;?\s*\n/m,
      (full, ws: string, names: string) => {
        const kept = names
          .split(',')
          .map((s) => s.trim())
          .filter((n) => n !== '' && n !== 'signal')
        if (kept.length === 0) return ''
        return `${ws}import { ${kept.join(', ')} } from '@aihu/signals'\n`
      },
    )
  }
  return text
}

// ─── Public entry point ─────────────────────────────────────────────────────

export function migrateStateWrappers(
  source: string,
  options: StateWrapperOptions = {},
): StateWrapperResult {
  const st: StageState = {
    warnings: [],
    changedMacros: false,
    changedBareTyped: false,
    aborted: false,
  }
  const tupleSt = { warnings: st.warnings, changedTuples: false }
  const renamed: Array<{ getter: string; setter: string }> = []
  const keepPlain = new Set(options.keepPlain ?? [])

  let text = source

  if (!options.tuplesOnly) {
    const state = findBlock(text, 'state')
    if (state) {
      const template = findBlock(text, 'template')
      const newBody = migrateStateMacrosBody(state.body, template?.body ?? '', st, keepPlain)
      // Statement-call gating guard (state_wrappers.rs module doc): the
      // compiler honors statement-position intrinsics only when the file also
      // declares a binding wrapper or naked directive. A migration whose new
      // dialect would be statement-calls ONLY (e.g. a provide-only file)
      // would silently compile them as plain JS — refuse it.
      if (!st.aborted && st.changedMacros) {
        const hasBinding =
          /^\s*(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*(?:state|prop|derived|action|resource|stream|controller|route|consume)\s*[<(]/m.test(
            newBody,
          ) || /^\s*(?:base|shadow|extract)\s*:/m.test(newBody)
        const hasStatementCall =
          /^\s*(?:effect|onMount|onDispose|onAdopt|onAttributeChange|aria|form|provide|event|beforeNavigate|afterNavigate)\s*[(<]/m.test(
            newBody,
          )
        if (hasStatementCall && !hasBinding) {
          st.warnings.push(
            'migration would produce only statement-position calls with no binding ' +
              "wrapper or directive — the compiler's new-dialect gate would treat them " +
              'as plain JS; file left unmigrated',
          )
          st.aborted = true
        }
      }
      if (!st.aborted && newBody !== state.body) {
        const trimmed = newBody.replace(/^\n+/, '').replace(/\s+$/, '')
        text = `${text.slice(0, state.start)}@state {\n${trimmed}\n}${text.slice(state.end)}`
      }
    }
  }

  if (!options.macrosOnly && !st.aborted) {
    text = migrateTuplesIn(text, tupleSt, renamed)
  }

  const changed = st.changedMacros || st.changedBareTyped || tupleSt.changedTuples
  return {
    rewritten: st.aborted ? source : text,
    warnings: st.warnings,
    skipped: st.aborted || !changed,
    changes: {
      macros: st.changedMacros,
      tuples: tupleSt.changedTuples,
      bareTyped: st.changedBareTyped,
    },
    renamedSetters: renamed,
  }
}
