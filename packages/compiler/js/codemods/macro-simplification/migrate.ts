/**
 * macro-simplification codemod (B6.2)
 *
 * Transforms v1 `.aihu` source into v2 collection-form per
 * `docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md`.
 *
 * Scope (in-spec macros only): `$prop`, `$computed`, `$action`,
 * `$resource`, `$effect`, `$lifecycle.{mount,dispose}` inside `@state`;
 * `$expose`, `$expose.write`, agent-bare `$action`, `$describe` inside
 * `@agent` (folded into matching `@state` collection entries).
 *
 * Out of scope: `@template`, `@style`, `@route`, `$watch`, `$shared`,
 * `$cookie`, `$server`, `$meta`, `$beforeNavigate`, `$afterNavigate`,
 * `$effect.on`, plain TS imports/decls (passed through verbatim).
 */

export interface MigrateResult {
  readonly rewritten: string
  readonly warnings: readonly string[]
}

interface Sidecar {
  describe?: string
  exposeRead?: boolean
  exposeWrite?: boolean
  isAction?: boolean
}

interface PropEntry {
  name: string
  rawType: string | undefined
  rawDefault: string | undefined
  describe: string | undefined
  expose: { read: boolean; write: boolean } | undefined
  leading: string
}

interface FunctionishEntry {
  name: string
  args: string
  retType: string | undefined
  body: string
  describe: string | undefined
  expose: { read: boolean; write: boolean } | undefined
  leading: string
  isAsync?: boolean
}

interface ValueEntry {
  name: string
  expr: string
  describe: string | undefined
  expose: { read: boolean; write: boolean } | undefined
  leading: string
  isAsync?: boolean
}

interface AnonEffect {
  body: string
  leading: string
  position: number
  isAsync?: boolean
}

interface LifecycleHook {
  kind: 'mount' | 'dispose'
  body: string
  leading: string
  position: number
  isAsync?: boolean
}

interface PlainDecl {
  raw: string
  leading: string
  name: string | undefined
  rawType: string | undefined
  rawDefault: string | undefined
}

interface Passthrough {
  raw: string
  leading: string
  position: number
}

const INDENT = '  '

// Public entry point

export function migrate(source: string): MigrateResult {
  const warnings: string[] = []

  const stateBlock = findBlock(source, 'state')
  const agentBlock = findBlock(source, 'agent')

  // Phase 1 - sidecar from @agent
  const sidecar = new Map<string, Sidecar>()
  const preservedAgentLines: string[] = []
  if (agentBlock) {
    parseAgent(agentBlock.body, sidecar, preservedAgentLines, warnings)
  }

  if (!stateBlock) {
    return { rewritten: source, warnings }
  }

  // Phase 2 - walk @state, bucket
  const buckets = walkState(stateBlock.body, sidecar, warnings)

  // Phase 3 - emit new @state body and (possibly empty) @agent block
  const newStateBody = emitStateBody(buckets)
  const newStateBlock = `@state {\n${newStateBody}\n}`

  const newAgentBlock =
    preservedAgentLines.length > 0 ? `@agent {\n${preservedAgentLines.join('\n')}\n}` : null

  let out = source.slice(0, stateBlock.start) + newStateBlock + source.slice(stateBlock.end)

  if (agentBlock) {
    const agentRelocated = findBlock(out, 'agent')
    if (agentRelocated) {
      if (newAgentBlock) {
        out = out.slice(0, agentRelocated.start) + newAgentBlock + out.slice(agentRelocated.end)
      } else {
        const dropStart = expandLeftToLineStart(out, agentRelocated.start)
        const dropEnd = expandRightThroughBlankLines(out, agentRelocated.end)
        out = out.slice(0, dropStart) + out.slice(dropEnd)
      }
    }
  }

  // Validate every sidecar name resolves in @state
  const stateNames = new Set<string>([
    ...buckets.props.map((p) => p.name),
    ...buckets.computed.map((c) => c.name),
    ...buckets.action.map((a) => a.name),
    ...buckets.resource.map((r) => r.name),
    ...buckets.effectNamed.map((e) => e.name),
    ...buckets.plain.map((p) => p.name).filter((x): x is string => !!x),
  ])
  for (const [name] of sidecar) {
    if (!stateNames.has(name)) {
      warnings.push(`@agent references '${name}' but no @state declaration found`)
    }
  }

  return { rewritten: out, warnings }
}

// Block location (brace-balanced, string/comment aware)

interface BlockSpan {
  start: number
  end: number
  bodyStart: number
  bodyEnd: number
  body: string
}

function findBlock(source: string, name: 'state' | 'agent'): BlockSpan | null {
  const re = new RegExp(`(^|\\n)([ \\t]*)@${name}\\s*\\{`, 'g')
  const m = re.exec(source)
  if (!m) return null
  const startMatch = m.index + (m[1] === '\n' ? 1 : 0)
  const openIdx = m.index + m[0].length - 1
  const closeIdx = matchBrace(source, openIdx)
  if (closeIdx < 0) return null
  return {
    start: startMatch,
    end: closeIdx + 1,
    bodyStart: openIdx + 1,
    bodyEnd: closeIdx,
    body: source.slice(openIdx + 1, closeIdx),
  }
}

function matchBrace(s: string, i: number): number {
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

function matchParen(s: string, i: number): number {
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

// @agent parsing -> sidecar

function parseAgent(
  body: string,
  sidecar: Map<string, Sidecar>,
  preservedAgentLines: string[],
  _warnings: string[],
): void {
  const upsert = (name: string, patch: Partial<Sidecar>) => {
    sidecar.set(name, { ...(sidecar.get(name) ?? {}), ...patch })
  }
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      continue
    }
    if (line.startsWith('$expose.write ')) {
      const names = parseNameList(line.slice('$expose.write '.length))
      for (const n of names) upsert(n, { exposeRead: true, exposeWrite: true })
      continue
    }
    if (line.startsWith('$expose ')) {
      const names = parseNameList(line.slice('$expose '.length))
      for (const n of names) {
        upsert(n, { exposeRead: true })
      }
      continue
    }
    if (line.startsWith('$action ')) {
      const rest = line.slice('$action '.length).trim()
      const m = /^([A-Za-z_$][\w$]*)/.exec(rest)
      if (m) upsert(m[1]!, { isAction: true, exposeRead: true, exposeWrite: true })
      continue
    }
    if (line.startsWith('$describe ')) {
      const rest = line.slice('$describe '.length).trim()
      const nameMatch = /^([A-Za-z_$][\w$]*)\s+(["'])([\s\S]*)\2\s*$/.exec(rest)
      if (nameMatch) {
        upsert(nameMatch[1]!, { describe: nameMatch[3]! })
      }
      continue
    }
    if (line.startsWith('$scope ')) {
      preservedAgentLines.push(`  ${line}`)
      continue
    }
    if (line.startsWith('$rate-limit ')) {
      preservedAgentLines.push(`  ${line}`)
    }
  }
}

function parseNameList(s: string): string[] {
  return s
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^[A-Za-z_$][\w$]*$/.test(x))
}

// @state walker - produces buckets in source order

interface Buckets {
  props: PropEntry[]
  computed: ValueEntry[]
  action: FunctionishEntry[]
  resource: ValueEntry[]
  effectNamed: ValueEntry[]
  effectAnon: AnonEffect[]
  lifecycle: LifecycleHook[]
  plain: PlainDecl[]
  passthrough: Passthrough[]
}

function walkState(body: string, sidecar: Map<string, Sidecar>, warnings: string[]): Buckets {
  const buckets: Buckets = {
    props: [],
    computed: [],
    action: [],
    resource: [],
    effectNamed: [],
    effectAnon: [],
    lifecycle: [],
    plain: [],
    passthrough: [],
  }

  let i = 0
  while (i < body.length && (body[i] === '\n' || body[i] === '\r')) i++

  let leadingBuf = ''
  let position = 0

  const consumeWS = () => {
    while (i < body.length) {
      const lineEnd = body.indexOf('\n', i)
      const end = lineEnd < 0 ? body.length : lineEnd
      const line = body.slice(i, end)
      const trimmed = line.trim()
      if (trimmed === '') {
        leadingBuf += `${line}\n`
        i = end + 1
        continue
      }
      if (trimmed.startsWith('//')) {
        leadingBuf += `${line}\n`
        i = end + 1
        continue
      }
      if (trimmed.startsWith('/*')) {
        const close = body.indexOf('*/', i)
        if (close < 0) {
          leadingBuf += body.slice(i)
          i = body.length
          return
        }
        const commentEnd = body.indexOf('\n', close)
        const realEnd = commentEnd < 0 ? body.length : commentEnd + 1
        leadingBuf += body.slice(i, realEnd)
        i = realEnd
        continue
      }
      return
    }
  }

  while (i < body.length) {
    consumeWS()
    if (i >= body.length) break
    const lineStart = i
    const lineEnd = body.indexOf('\n', i)
    const lineEndIdx = lineEnd < 0 ? body.length : lineEnd
    const lineText = body.slice(lineStart, lineEndIdx)
    const trimmed = lineText.trim()
    const leading = leadingBuf
    leadingBuf = ''
    // Position where trimmed content begins (skipping leading whitespace).
    const trimStart = lineStart + (lineText.length - lineText.trimStart().length)

    if (trimmed.startsWith('import ')) {
      // A multi-line `import { … } from '…'` must be consumed as ONE statement.
      // If only the opener line is taken, the member lines and the `} from '…'`
      // closing bucket as separate passthroughs and drift out of the import
      // group at emit time (imports are hoisted, the orphaned members are not) —
      // the #502 import-scrambling defect. A statement is complete once a line
      // carries the source specifier (`from '…'`) or the opener is a bare
      // side-effect import (`import '…'`).
      let stmtEndIdx = lineEndIdx
      let stmt = lineText
      const carriesSource = /\bfrom\s*['"]/.test(lineText) || /^import\s+['"]/.test(trimmed)
      if (!carriesSource) {
        let j = lineEndIdx + 1
        while (j < body.length) {
          const nl = body.indexOf('\n', j)
          const e = nl < 0 ? body.length : nl
          const l = body.slice(j, e)
          stmt += `\n${l}`
          stmtEndIdx = e
          j = e + 1
          if (/\bfrom\s*['"]/.test(l)) break
        }
      }
      buckets.passthrough.push({ raw: stmt.trim(), leading, position: position++ })
      i = stmtEndIdx + 1
      continue
    }

    // v2 collection-form passthrough (idempotency path): if the source already
    // uses `$<macro>: {` collection-form, re-parse the inner entries into the
    // same buckets so emit is byte-identical on re-run.
    {
      const v2 = tryParseV2Collection(body, trimStart, sidecar, buckets, leading, () => position++)
      if (v2 !== null) {
        i = v2
        continue
      }
    }

    // v2 anonymous effect form: `$effect: () => { ... }` or `$effect: () => expr`.
    if (/^\$effect\s*:\s*(?:\(|async\b)/.test(trimmed)) {
      const handled = tryParseV2AnonEffect(body, trimStart, buckets, leading, position++)
      if (handled !== null) {
        i = handled
        continue
      }
    }

    if (trimmed.startsWith('$prop ')) {
      const handled = handleProp(body, trimStart, sidecar, buckets, leading)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    if (trimmed.startsWith('$computed ')) {
      const handled = handleComputed(body, trimStart, sidecar, buckets, leading)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    if (trimmed.startsWith('$resource ')) {
      const handled = handleResource(body, trimStart, sidecar, buckets, leading)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    if (trimmed.startsWith('$action ')) {
      const handled = handleAction(body, trimStart, sidecar, buckets, leading)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    if (trimmed.startsWith('$lifecycle.mount(') || trimmed.startsWith('$lifecycle.dispose(')) {
      const handled = handleLifecycle(body, trimStart, buckets, leading, position++)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    // Defect fix (#425 a): colon form — `$lifecycle.mount: { ... }` (bare
    // block) and `$lifecycle.mount: () => { ... }` (arrow). Previously fell
    // through to the bare-`$macro <ident>` passthrough, which consumed only
    // the header line and left the orphaned body braces to mangle the file.
    if (/^\$lifecycle\.(mount|dispose)\s*:/.test(trimmed)) {
      const handled = handleLifecycleColon(body, trimStart, buckets, leading, position++)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    if (trimmed.startsWith('$effect(')) {
      const handled = handleEffectAnon(body, trimStart, buckets, leading, position++, warnings)
      if (handled !== null) {
        i = handled
        continue
      }
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    if (trimmed.startsWith('$effect.on(')) {
      const handled = consumePassthroughCall(body, trimStart)
      buckets.passthrough.push({
        raw: body.slice(trimStart, handled).trim(),
        leading,
        position: position++,
      })
      i = handled
      continue
    }

    // Any other `$macro(...)` invocation at top level: pass through preserving
    // the multi-line callback body. Covers `$afterNavigate`, `$beforeNavigate`,
    // `$watch`, etc. — out of v2 redesign scope per spec §1.2.
    if (/^\$[A-Za-z_][\w.$]*\s*\(/.test(trimmed)) {
      const handled = consumePassthroughCall(body, trimStart)
      buckets.passthrough.push({
        raw: body.slice(trimStart, handled).trimEnd(),
        leading,
        position: position++,
      })
      i = handled
      continue
    }

    // Bare `$macro <ident>` form (e.g., `$route currentRoute`, `$shared foo`).
    if (/^\$[A-Za-z_][\w.$-]*\s+[A-Za-z_$]/.test(trimmed)) {
      buckets.passthrough.push({ raw: trimmed, leading, position: position++ })
      i = lineEndIdx + 1
      continue
    }

    const plain = tryParsePlainDecl(body, trimStart)
    if (plain !== null) {
      const sc = plain.name ? sidecar.get(plain.name) : undefined
      if (sc) {
        buckets.props.push({
          name: plain.name!,
          rawType: plain.rawType,
          rawDefault: plain.rawDefault,
          describe: sc.describe,
          expose: sidecarToExpose(sc),
          leading,
        })
      } else {
        buckets.plain.push({
          raw: plain.raw,
          leading,
          name: plain.name,
          rawType: plain.rawType,
          rawDefault: plain.rawDefault,
        })
      }
      i = plain.endIdx
      continue
    }

    // Statement-aware passthrough (#425): consume the WHOLE statement —
    // through any open `(`/`{`/`[` — not just the first line. The previous
    // line-by-line fallback shredded multi-line `const x = call(\n…\n)` and
    // `function f() { … }` statements into one passthrough entry per line,
    // scrambling the emitted @state body.
    const stmtEnd = consumeBalancedStatement(body, trimStart)
    const raw = body.slice(trimStart, stmtEnd).replace(/\n+$/, '')
    buckets.passthrough.push({ raw, leading, position: position++ })
    i = stmtEnd
  }

  // Trailing comments at the end of @state (accumulated into leadingBuf with
  // no following statement to attach to) were silently discarded (#425).
  // Preserve them as a final passthrough entry.
  if (leadingBuf.trim()) {
    buckets.passthrough.push({ raw: rstrip(leadingBuf), leading: '', position: position++ })
  }

  return buckets
}

function sidecarToExpose(sc: Sidecar): { read: boolean; write: boolean } | undefined {
  if (!sc.exposeRead && !sc.exposeWrite && !sc.isAction) return undefined
  return { read: !!sc.exposeRead, write: !!sc.exposeWrite }
}

// handlers - each returns the index just past the consumed statement

function handleProp(
  body: string,
  start: number,
  sidecar: Map<string, Sidecar>,
  buckets: Buckets,
  leading: string,
): number | null {
  const after = start + '$prop '.length
  const nameMatch = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(after))
  if (!nameMatch) return null
  const name = nameMatch[1]!
  let cursor = after + nameMatch[0].length
  const typeStart = cursor
  const typeEnd = scanUntilTopLevel(body, cursor, ['=', '\n', ';'])
  const rawType = body.slice(typeStart, typeEnd).trim()
  cursor = typeEnd
  let rawDefault: string | undefined
  if (body[cursor] === '=') {
    cursor++
    const defStart = cursor
    const defEnd = scanUntilTopLevel(body, cursor, ['\n', ';'])
    rawDefault = body.slice(defStart, defEnd).trim()
    cursor = defEnd
  }
  if (body[cursor] === ';' || body[cursor] === '\n') cursor++

  const sc = sidecar.get(name)
  buckets.props.push({
    name,
    rawType: flattenWhitespace(rawType),
    rawDefault: rawDefault !== undefined ? flattenWhitespace(rawDefault) : undefined,
    describe: sc?.describe,
    expose: sc ? sidecarToExpose(sc) : undefined,
    leading,
  })
  return cursor
}

function handleComputed(
  body: string,
  start: number,
  sidecar: Map<string, Sidecar>,
  buckets: Buckets,
  leading: string,
): number | null {
  const after = start + '$computed '.length
  const nameMatch = /^\s*([A-Za-z_$][\w$]*)\s*=/.exec(body.slice(after))
  if (!nameMatch) return null
  const name = nameMatch[1]!
  let cursor = after + nameMatch[0].length
  const exprStart = cursor
  const exprEnd = scanComputedOrResourceExpr(body, cursor)
  const expr = body.slice(exprStart, exprEnd).trim()
  cursor = exprEnd

  const sc = sidecar.get(name)
  buckets.computed.push({
    name,
    expr,
    describe: sc?.describe,
    expose: sc ? sidecarToExpose(sc) : undefined,
    leading,
  })
  return cursor
}

function handleResource(
  body: string,
  start: number,
  sidecar: Map<string, Sidecar>,
  buckets: Buckets,
  leading: string,
): number | null {
  const after = start + '$resource '.length
  const nameMatch = /^\s*([A-Za-z_$][\w$]*)\s*=/.exec(body.slice(after))
  if (!nameMatch) return null
  const name = nameMatch[1]!
  let cursor = after + nameMatch[0].length
  const exprStart = cursor
  const exprEnd = scanComputedOrResourceExpr(body, cursor)
  const expr = body.slice(exprStart, exprEnd).trim()
  cursor = exprEnd

  const sc = sidecar.get(name)
  buckets.resource.push({
    name,
    expr,
    describe: sc?.describe,
    expose: sc ? sidecarToExpose(sc) : undefined,
    leading,
  })
  return cursor
}

function handleAction(
  body: string,
  start: number,
  sidecar: Map<string, Sidecar>,
  buckets: Buckets,
  leading: string,
): number | null {
  const after = start + '$action '.length
  const nameMatch = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(body.slice(after))
  if (!nameMatch) return null
  const name = nameMatch[1]!
  const parenIdx = after + nameMatch[0].length - 1
  const parenClose = matchParen(body, parenIdx)
  if (parenClose < 0) return null
  const args = body.slice(parenIdx + 1, parenClose).trim()
  let cursor = parenClose + 1
  let retType: string | undefined
  const retStart = cursor
  while (cursor < body.length && body[cursor] !== '{') {
    if (body[cursor] === '\n') break
    cursor++
  }
  const between = body.slice(retStart, cursor).trim()
  if (between.startsWith(':')) {
    retType = between.slice(1).trim()
  }
  if (body[cursor] !== '{') return null
  const braceClose = matchBrace(body, cursor)
  if (braceClose < 0) return null
  const bodySrc = body.slice(cursor + 1, braceClose)
  cursor = braceClose + 1

  const sc = sidecar.get(name)
  buckets.action.push({
    name,
    args,
    retType,
    body: bodySrc,
    describe: sc?.describe,
    expose: sc ? sidecarToExpose(sc) : undefined,
    leading,
  })
  return cursor
}

function handleLifecycle(
  body: string,
  start: number,
  buckets: Buckets,
  leading: string,
  position: number,
): number | null {
  const trimmedStart = body.slice(start).trim()
  const kind = trimmedStart.startsWith('$lifecycle.mount(') ? 'mount' : 'dispose'
  const parenIdx = body.indexOf('(', start)
  if (parenIdx < 0) return null
  const parenClose = matchParen(body, parenIdx)
  if (parenClose < 0) return null
  const cb = body.slice(parenIdx + 1, parenClose).trim()
  const fn = parseArrowOrFunctionExpr(cb)
  buckets.lifecycle.push({
    kind,
    body: fn ? fn.body : cb,
    leading,
    position,
    isAsync: fn?.isAsync ?? false,
  })
  let cursor = parenClose + 1
  if (body[cursor] === ';' || body[cursor] === '\n') cursor++
  return cursor
}

// Colon form (#425 defect a): `$lifecycle.mount: { ... }` or
// `$lifecycle.mount: () => { ... }` (arrow, optionally async). Returns the
// index just past the consumed statement, or null when the form is not
// recognized (caller falls back to passthrough).
function handleLifecycleColon(
  body: string,
  start: number,
  buckets: Buckets,
  leading: string,
  position: number,
): number | null {
  const m = /^\$lifecycle\.(mount|dispose)\s*:\s*/.exec(body.slice(start))
  if (!m) return null
  const kind = m[1] as 'mount' | 'dispose'
  const cursor = start + m[0].length
  if (body[cursor] === '(' || body.slice(cursor, cursor + 5) === 'async') {
    // Arrow form: `() => { ... }` / `async () => { ... }`.
    const fn = parseArrowOrFunctionExpr(body.slice(cursor))
    if (!fn) return null
    const end = scanArrowExprEnd(body, cursor)
    if (end < 0) return null
    buckets.lifecycle.push({ kind, body: fn.body, leading, position, isAsync: fn.isAsync })
    let c = end
    if (body[c] === ';') c++
    if (body[c] === '\n') c++
    return c
  }
  if (body[cursor] !== '{') return null
  // Bare-block form: `$lifecycle.mount: { ... }`.
  const close = matchBrace(body, cursor)
  if (close < 0) return null
  buckets.lifecycle.push({
    kind,
    body: body.slice(cursor + 1, close),
    leading,
    position,
  })
  let c = close + 1
  if (body[c] === ';') c++
  if (body[c] === '\n') c++
  return c
}

function handleEffectAnon(
  body: string,
  start: number,
  buckets: Buckets,
  leading: string,
  position: number,
  _warnings: string[],
): number | null {
  const parenIdx = body.indexOf('(', start)
  if (parenIdx < 0) return null
  const parenClose = matchParen(body, parenIdx)
  if (parenClose < 0) return null
  const cb = body.slice(parenIdx + 1, parenClose).trim()
  const fn = parseArrowOrFunctionExpr(cb)
  buckets.effectAnon.push({
    body: fn ? fn.body : cb,
    leading,
    position,
    isAsync: fn?.isAsync ?? false,
  })
  let cursor = parenClose + 1
  if (body[cursor] === ';' || body[cursor] === '\n') cursor++
  return cursor
}

// Consume a complete statement starting at `start`: scan forward (string/
// comment aware) and stop at the first newline where all bracket depths are
// balanced. Returns the index just past that newline (or body.length).
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

function consumePassthroughCall(body: string, start: number): number {
  const parenIdx = body.indexOf('(', start)
  if (parenIdx < 0) {
    const nl = body.indexOf('\n', start)
    return nl < 0 ? body.length : nl + 1
  }
  const close = matchParen(body, parenIdx)
  if (close < 0) {
    const nl = body.indexOf('\n', start)
    return nl < 0 ? body.length : nl + 1
  }
  let cursor = close + 1
  if (body[cursor] === ';' || body[cursor] === '\n') cursor++
  return cursor
}

interface PlainDeclParse {
  name: string | undefined
  rawType: string | undefined
  rawDefault: string | undefined
  raw: string
  endIdx: number
}

function tryParsePlainDecl(body: string, start: number): PlainDeclParse | null {
  const m = /^([ \t]*)([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(start))
  if (!m) return null
  const name = m[2]!
  let cursor = start + m[0].length
  const typeStart = cursor
  const typeEnd = scanUntilTopLevel(body, cursor, ['=', '\n', ';'])
  const rawType = body.slice(typeStart, typeEnd).trim()
  cursor = typeEnd
  let rawDefault: string | undefined
  if (body[cursor] === '=') {
    cursor++
    const defStart = cursor
    const defEnd = scanUntilTopLevel(body, cursor, ['\n', ';'])
    rawDefault = body.slice(defStart, defEnd).trim()
    cursor = defEnd
  }
  if (body[cursor] === ';') cursor++
  if (body[cursor] === '\n') cursor++
  return {
    name,
    rawType,
    rawDefault,
    raw: body.slice(start, cursor).replace(/\n+$/, ''),
    endIdx: cursor,
  }
}

interface ParsedFn {
  args: string
  body: string
  retType: string | undefined
  isArrow: boolean
  isAsync: boolean
}

function parseArrowOrFunctionExpr(s: string): ParsedFn | null {
  s = s.trim()
  // #425 — `async` arrows/functions were unrecognized, which silently DROPPED
  // async entries on the v2 idempotency re-parse path. Strip the prefix here
  // and carry the flag so emit can restore it.
  let isAsync = false
  if (/^async[\s(]/.test(s)) {
    isAsync = true
    s = s.slice(5).trim()
  }
  const inner = parseArrowOrFunctionExprInner(s)
  if (!inner) return null
  return { ...inner, isAsync }
}

function parseArrowOrFunctionExprInner(s: string): Omit<ParsedFn, 'isAsync'> | null {
  if (s.startsWith('(')) {
    const closeIdx = matchParen(s, 0)
    if (closeIdx < 0) return null
    const args = s.slice(1, closeIdx)
    let cur = closeIdx + 1
    while (cur < s.length && /\s/.test(s[cur]!)) cur++
    let retType: string | undefined
    if (s[cur] === ':') {
      cur++
      const arrowAt = s.indexOf('=>', cur)
      if (arrowAt < 0) return null
      retType = s.slice(cur, arrowAt).trim()
      cur = arrowAt
    }
    if (s.slice(cur, cur + 2) !== '=>') return null
    cur += 2
    while (cur < s.length && /\s/.test(s[cur]!)) cur++
    if (s[cur] === '{') {
      const close = matchBrace(s, cur)
      if (close < 0) return null
      return {
        args,
        body: s.slice(cur + 1, close),
        retType,
        isArrow: true,
      }
    }
    return { args, body: ` return ${s.slice(cur).trim()} `, retType, isArrow: true }
  }
  const fnMatch = /^function\s*(?:[A-Za-z_$][\w$]*)?\s*\(/.exec(s)
  if (fnMatch) {
    const parenIdx = fnMatch[0].length - 1
    const parenClose = matchParen(s, parenIdx)
    if (parenClose < 0) return null
    const args = s.slice(parenIdx + 1, parenClose)
    let cur = parenClose + 1
    while (cur < s.length && /\s/.test(s[cur]!)) cur++
    let retType: string | undefined
    if (s[cur] === ':') {
      cur++
      const braceAt = s.indexOf('{', cur)
      if (braceAt < 0) return null
      retType = s.slice(cur, braceAt).trim()
      cur = braceAt
    }
    if (s[cur] !== '{') return null
    const close = matchBrace(s, cur)
    if (close < 0) return null
    return {
      args,
      body: s.slice(cur + 1, close),
      retType,
      isArrow: false,
    }
  }
  return null
}

function scanUntilTopLevel(s: string, start: number, stops: readonly string[]): number {
  let j = start
  while (j < s.length) {
    const c = s[j]!
    if (c === '/' && s[j + 1] === '/') {
      const nl = s.indexOf('\n', j)
      if (stops.includes('\n')) return nl < 0 ? s.length : nl
      j = nl < 0 ? s.length : nl + 1
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
    if (c === '(') {
      const close = matchParen(s, j)
      j = close < 0 ? s.length : close + 1
      continue
    }
    if (c === '<') {
      const close = scanGeneric(s, j)
      if (close > j) {
        j = close
        continue
      }
    }
    if (stops.includes(c)) return j
    j++
  }
  return s.length
}

function scanGeneric(s: string, start: number): number {
  if (s[start] !== '<') return start
  let depth = 0
  let j = start
  while (j < s.length) {
    const c = s[j]!
    if (c === '<') depth++
    else if (c === '>') {
      depth--
      if (depth === 0) return j + 1
    } else if (c === '\n') {
      return start
    } else if (c === '(' || c === '{') {
      return start
    } else if (c === '=' || c === ';') {
      return start
    }
    j++
  }
  return start
}

function scanComputedOrResourceExpr(body: string, start: number): number {
  const lineStart = body.lastIndexOf('\n', start - 1) + 1
  const startLineIndent = countIndent(body, lineStart)
  let j = start
  const lineEnd = body.indexOf('\n', j)
  if (lineEnd < 0) return body.length
  j = lineEnd + 1
  while (j < body.length) {
    const nextLineEnd = body.indexOf('\n', j)
    const lineEndIdx = nextLineEnd < 0 ? body.length : nextLineEnd
    const line = body.slice(j, lineEndIdx)
    const trimmed = line.trim()
    if (trimmed === '') {
      return j
    }
    const indent = countIndent(body, j)
    if (
      indent > startLineIndent ||
      (indent === startLineIndent &&
        /^[?:&|+\-*/<>=,.[\](){}]/.test(trimmed) &&
        !trimmed.startsWith('//'))
    ) {
      j = nextLineEnd < 0 ? body.length : nextLineEnd + 1
      continue
    }
    return j
  }
  return j
}

function countIndent(body: string, lineStart: number): number {
  let n = 0
  while (lineStart + n < body.length) {
    const c = body[lineStart + n]
    if (c === ' ' || c === '\t') n++
    else break
  }
  return n
}

// Emit

function emitStateBody(buckets: Buckets): string {
  const out: string[] = []
  const imports = buckets.passthrough.filter((p) => p.raw.startsWith('import '))
  const otherPassthrough = buckets.passthrough.filter((p) => !p.raw.startsWith('import '))

  for (const imp of imports) {
    if (imp.leading.trim()) out.push(rstrip(imp.leading))
    out.push(`${INDENT}${imp.raw}`)
  }
  if (imports.length > 0) out.push('')

  if (buckets.props.length > 0) {
    pushBlock(out, emitProps(buckets.props))
  }

  for (const p of buckets.plain) {
    if (p.leading.trim()) out.push(rstrip(p.leading))
    // raw already includes the original leading indent of the outer line.
    // Don't re-indent — but normalize so the outer line is at INDENT (2 spaces).
    out.push(rebaseLeadingIndent(p.raw, INDENT))
    out.push('')
  }
  trimTrailingBlanks(out)

  if (buckets.computed.length > 0) {
    pushBlock(out, emitComputed(buckets.computed))
  }

  if (buckets.action.length > 0) {
    pushBlock(out, emitAction(buckets.action))
  }

  if (buckets.resource.length > 0) {
    pushBlock(out, emitResource(buckets.resource))
  }

  if (buckets.effectNamed.length > 0) {
    pushBlock(out, emitEffectNamed(buckets.effectNamed))
  }

  if (buckets.lifecycle.length > 0) {
    pushBlock(out, emitLifecycle(buckets.lifecycle))
  }

  if (buckets.effectAnon.length > 0) {
    pushBlock(out, emitEffectAnon(buckets.effectAnon))
  }

  for (const p of otherPassthrough) {
    if (p.leading.trim()) out.push(rstrip(p.leading))
    if (p.raw.includes('\n')) {
      out.push(rebaseLeadingIndent(p.raw, INDENT))
    } else {
      out.push(`${INDENT}${p.raw}`)
    }
    out.push('')
  }
  trimTrailingBlanks(out)

  return out.join('\n')
}

function pushBlock(out: string[], block: string): void {
  if (out.length > 0 && out[out.length - 1] !== '') out.push('')
  out.push(block)
  out.push('')
}

function trimTrailingBlanks(out: string[]): void {
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
}

function emitProps(entries: PropEntry[]): string {
  const lines: string[] = []
  const firstLeading = entries[0]?.leading
  const headerLeading = firstLeading?.trim() ? firstLeading : ''
  const inner: string[] = []
  for (const [idx, e] of entries.entries()) {
    if (idx > 0 && e.leading.trim()) {
      inner.push(rstrip(indentBlock(e.leading, `${INDENT}${INDENT}`)))
    }
    inner.push(formatPropEntry(e))
  }
  if (headerLeading) lines.push(rstrip(headerLeading))
  lines.push(`${INDENT}$prop: {`)
  lines.push(...inner)
  lines.push(`${INDENT}}`)
  return lines.join('\n')
}

function formatPropEntry(e: PropEntry): string {
  const keys: { k: string; v: string }[] = []
  const needsType = shouldKeepType(e.rawType, e.rawDefault)
  if (needsType && e.rawType) keys.push({ k: 'type', v: e.rawType })
  if (e.rawDefault !== undefined) keys.push({ k: 'default', v: e.rawDefault })
  if (e.describe) keys.push({ k: 'describe', v: quoteSingle(e.describe) })
  if (e.expose) keys.push({ k: 'expose', v: formatExpose(e.expose) })

  const inline = `${e.name}: { ${keys.map(({ k, v }) => `${k}: ${v}`).join(', ')} }`
  const baseIndent = INDENT.length * 2
  const linePrefix = ' '.repeat(baseIndent)
  if (keys.length <= 3 && baseIndent + inline.length + 1 <= 100) {
    return `${linePrefix}${inline},`
  }
  const lines: string[] = [`${linePrefix}${e.name}: {`]
  const inner = ' '.repeat(baseIndent + INDENT.length)
  for (const { k, v } of keys) {
    lines.push(`${inner}${k}: ${v},`)
  }
  lines.push(`${linePrefix}},`)
  return lines.join('\n')
}

function shouldKeepType(rawType: string | undefined, rawDefault: string | undefined): boolean {
  if (!rawType) return false
  if (rawDefault === undefined) return true
  const trimmed = rawDefault.trim()
  if (trimmed === 'null' || trimmed === 'undefined') return true
  if (trimmed === '[]') return true
  if (trimmed === '{}') return true
  if (/^['"`]/.test(trimmed) && rawType.includes('|')) return true
  if (/[<>{}]/.test(rawType)) {
    if (/^[0-9.+-]/.test(trimmed) || trimmed === 'true' || trimmed === 'false') return true
    if (/^['"`]/.test(trimmed)) return true
    return true
  }
  return false
}

function emitComputed(entries: ValueEntry[]): string {
  return emitValueCollection('$computed', entries)
}

function emitResource(entries: ValueEntry[]): string {
  return emitValueCollection('$resource', entries)
}

function emitEffectNamed(entries: ValueEntry[]): string {
  return emitValueCollection('$effect', entries)
}

function emitValueCollection(macro: string, entries: ValueEntry[]): string {
  const firstLeading = entries[0]?.leading
  const headerLeading = firstLeading?.trim() ? firstLeading : ''
  const inner: string[] = []
  for (const [idx, e] of entries.entries()) {
    if (idx > 0 && e.leading.trim()) {
      inner.push(rstrip(indentBlock(e.leading, `${INDENT}${INDENT}`)))
    }
    inner.push(formatValueEntry(e))
  }
  const lines: string[] = []
  if (headerLeading) lines.push(rstrip(headerLeading))
  lines.push(`${INDENT}${macro}: {`)
  lines.push(...inner)
  lines.push(`${INDENT}}`)
  return lines.join('\n')
}

function formatValueEntry(e: ValueEntry): string {
  const baseIndent = INDENT.length * 2
  const linePrefix = ' '.repeat(baseIndent)
  const thunkPrefix = `${e.isAsync ? 'async ' : ''}() => `
  if (!e.describe && !e.expose) {
    if (!e.expr.includes('\n')) {
      const inline = `${linePrefix}${e.name}: ${thunkPrefix}${e.expr},`
      if (inline.length <= 100) return inline
    }
    const indented = reindentExpr(e.expr, baseIndent + INDENT.length)
    return `${linePrefix}${e.name}: ${thunkPrefix}${indented},`
  }
  const keys: { k: string; v: string }[] = []
  if (e.describe) keys.push({ k: 'describe', v: quoteSingle(e.describe) })
  if (e.expose) keys.push({ k: 'expose', v: formatExpose(e.expose) })
  const valueExpr = e.expr.includes('\n')
    ? `${thunkPrefix}${reindentExpr(e.expr, baseIndent + INDENT.length * 2)}`
    : `${thunkPrefix}${e.expr}`
  keys.push({ k: 'value', v: valueExpr })

  const lines: string[] = [`${linePrefix}${e.name}: {`]
  const inner = ' '.repeat(baseIndent + INDENT.length)
  for (const { k, v } of keys) {
    lines.push(`${inner}${k}: ${v},`)
  }
  lines.push(`${linePrefix}},`)
  return lines.join('\n')
}

function emitAction(entries: FunctionishEntry[]): string {
  const firstLeading = entries[0]?.leading
  const headerLeading = firstLeading?.trim() ? firstLeading : ''
  const inner: string[] = []
  for (const [idx, e] of entries.entries()) {
    if (idx > 0 && e.leading.trim()) {
      inner.push(rstrip(indentBlock(e.leading, `${INDENT}${INDENT}`)))
    }
    inner.push(formatActionEntry(e))
  }
  const lines: string[] = []
  if (headerLeading) lines.push(rstrip(headerLeading))
  lines.push(`${INDENT}$action: {`)
  lines.push(...inner)
  lines.push(`${INDENT}}`)
  return lines.join('\n')
}

function formatActionEntry(e: FunctionishEntry): string {
  const ret = e.retType ? `: ${e.retType}` : ''
  const arrow = `${e.isAsync ? 'async ' : ''}(${e.args})${ret} => `
  const baseIndent = INDENT.length * 2
  const linePrefix = ' '.repeat(baseIndent)
  if (e.describe || e.expose) {
    const keys: { k: string; v: string }[] = []
    if (e.describe) keys.push({ k: 'describe', v: quoteSingle(e.describe) })
    if (e.expose) keys.push({ k: 'expose', v: formatExpose(e.expose) })
    const bodyIndented = reindentBlockBody(e.body, baseIndent + INDENT.length * 2)
    keys.push({ k: 'handler', v: `${arrow}{${bodyIndented}}` })
    const lines: string[] = [`${linePrefix}${e.name}: {`]
    const inner = ' '.repeat(baseIndent + INDENT.length)
    for (const { k, v } of keys) {
      lines.push(`${inner}${k}: ${v},`)
    }
    lines.push(`${linePrefix}},`)
    return lines.join('\n')
  }
  const bodyIndented = reindentBlockBody(e.body, baseIndent + INDENT.length)
  return `${linePrefix}${e.name}: ${arrow}{${bodyIndented}},`
}

function emitLifecycle(hooks: LifecycleHook[]): string {
  const firstLeading = hooks[0]?.leading
  const headerLeading = firstLeading?.trim() ? firstLeading : ''
  const inner: string[] = []
  const baseIndent = INDENT.length * 2
  const linePrefix = ' '.repeat(baseIndent)
  for (const [idx, h] of hooks.entries()) {
    if (idx > 0 && h.leading.trim()) {
      inner.push(rstrip(indentBlock(h.leading, linePrefix)))
    }
    const bodyIndented = reindentBlockBody(h.body, baseIndent + INDENT.length)
    inner.push(`${linePrefix}${h.kind}: ${h.isAsync ? 'async ' : ''}() => {${bodyIndented}},`)
  }
  const lines: string[] = []
  if (headerLeading) lines.push(rstrip(headerLeading))
  lines.push(`${INDENT}$lifecycle: {`)
  lines.push(...inner)
  lines.push(`${INDENT}}`)
  return lines.join('\n')
}

function emitEffectAnon(effects: AnonEffect[]): string {
  const out: string[] = []
  const baseIndent = INDENT.length
  const linePrefix = ' '.repeat(baseIndent)
  for (const [idx, e] of effects.entries()) {
    if (idx > 0) out.push('')
    if (e.leading.trim()) out.push(rstrip(e.leading))
    const bodyIndented = reindentBlockBody(e.body, baseIndent + INDENT.length)
    out.push(`${linePrefix}$effect: ${e.isAsync ? 'async ' : ''}() => {${bodyIndented}}`)
  }
  return out.join('\n')
}

function formatExpose(e: { read: boolean; write: boolean }): string {
  const parts: string[] = []
  if (e.read) parts.push('read: true')
  if (e.write) parts.push('write: true')
  return `{ ${parts.join(', ')} }`
}

function quoteSingle(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

// Whitespace helpers

function rstrip(s: string): string {
  return s
    .replace(/[ \t]+(\n|$)/g, '$1')
    .replace(/^\n+/, '')
    .replace(/\n+$/g, '')
}

function rebaseLeadingIndent(s: string, indent: string): string {
  const lines = s.split('\n')
  const first = lines[0] ?? ''
  // determine first-line indent
  let n = 0
  while (n < first.length && (first[n] === ' ' || first[n] === '\t')) n++
  if (n === 0) {
    return [indent + first, ...lines.slice(1)].join('\n')
  }
  // Strip n chars from each line that has at least n leading WS, prepend indent
  const rebased = lines.map((line) => {
    if (line.length === 0) return line
    let m = 0
    while (m < line.length && m < n && (line[m] === ' ' || line[m] === '\t')) m++
    return indent + line.slice(m)
  })
  return rebased.join('\n')
}

function indentBlock(s: string, indent: string): string {
  return s
    .split('\n')
    .map((line) => (line.length > 0 ? indent + line : line))
    .join('\n')
}

function flattenWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function reindentBlockBody(bodyText: string, targetInner: number): string {
  const lines = bodyText.split('\n')
  let firstReal = 0
  while (firstReal < lines.length && lines[firstReal]!.trim() === '') firstReal++
  let lastReal = lines.length - 1
  while (lastReal >= 0 && lines[lastReal]!.trim() === '') lastReal--
  if (firstReal > lastReal) {
    return ''
  }
  let minIndent = Infinity
  for (let k = firstReal; k <= lastReal; k++) {
    const line = lines[k]!
    if (line.trim() === '') continue
    let n = 0
    while (n < line.length && (line[n] === ' ' || line[n] === '\t')) n++
    if (n < minIndent) minIndent = n
  }
  if (!Number.isFinite(minIndent)) minIndent = 0
  const rebased: string[] = ['']
  const targetSpaces = ' '.repeat(targetInner)
  for (let k = firstReal; k <= lastReal; k++) {
    const line = lines[k]!
    if (line.trim() === '') {
      rebased.push('')
      continue
    }
    rebased.push((targetSpaces + line.slice(minIndent)).replace(/[ \t]+$/, ''))
  }
  rebased.push(' '.repeat(Math.max(targetInner - INDENT.length, 0)))
  return rebased.join('\n')
}

function reindentExpr(expr: string, targetInner: number): string {
  const lines = expr.split('\n')
  if (lines.length === 1) return expr
  const firstLine = lines[0]!
  const rest = lines.slice(1)
  let minIndent = Infinity
  for (const line of rest) {
    if (line.trim() === '') continue
    let n = 0
    while (n < line.length && (line[n] === ' ' || line[n] === '\t')) n++
    if (n < minIndent) minIndent = n
  }
  if (!Number.isFinite(minIndent)) minIndent = 0
  const targetSpaces = ' '.repeat(targetInner)
  const rebasedRest = rest.map((line) =>
    line.trim() === '' ? '' : targetSpaces + line.slice(minIndent),
  )
  return [firstLine, ...rebasedRest].join('\n')
}

function expandLeftToLineStart(s: string, idx: number): number {
  let j = idx
  while (j > 0 && s[j - 1] !== '\n') j--
  if (j > 0 && s[j - 1] === '\n') {
    let k = j - 1
    while (k > 0 && (s[k - 1] === ' ' || s[k - 1] === '\t')) k--
    if (k > 0 && s[k - 1] === '\n') j = k
  }
  return j
}

function expandRightThroughBlankLines(s: string, idx: number): number {
  let j = idx
  while (j < s.length && (s[j] === ' ' || s[j] === '\t')) j++
  if (s[j] === '\n') j++
  while (j < s.length) {
    let k = j
    while (k < s.length && (s[k] === ' ' || s[k] === '\t')) k++
    if (s[k] === '\n') {
      j = k + 1
      continue
    }
    break
  }
  return j
}

// v2 collection-form re-parser - idempotency path
// Recognizes `$<macro>: { <entries> }` for prop/computed/action/resource/
// effect/lifecycle, splits the inner object literal at top-level commas, and
// re-buckets each entry. Returns the cursor past the closing `}` (and any
// trailing `;`/`\n`), or null if the line is not a v2 collection.
function tryParseV2Collection(
  body: string,
  start: number,
  sidecar: Map<string, Sidecar>,
  buckets: Buckets,
  leading: string,
  nextPosition: () => number,
): number | null {
  const m = /^\$(prop|computed|action|resource|effect|lifecycle)\s*:\s*\{/.exec(body.slice(start))
  if (!m) return null
  const macro = m[1]!
  const braceIdx = start + m[0].length - 1
  const closeIdx = matchBrace(body, braceIdx)
  if (closeIdx < 0) return null
  const inner = body.slice(braceIdx + 1, closeIdx)
  const entries = splitTopLevelEntries(inner)
  let outerLeadingConsumed = false
  for (const e of entries) {
    const parsed = parseV2Entry(e.text)
    if (!parsed) continue
    // Outer block's leading (comments above `$<macro>: {`) attaches to the
    // first parseable entry. Subsequent entries take their own piece-leading
    // only when it carries non-whitespace content (e.g., a comment block).
    let entryLeading: string
    if (!outerLeadingConsumed) {
      entryLeading = e.leading.trim() ? e.leading : leading
      outerLeadingConsumed = true
    } else {
      entryLeading = e.leading.trim() ? e.leading : ''
    }
    routeV2Entry(macro, parsed, sidecar, buckets, entryLeading, nextPosition)
  }
  let cursor = closeIdx + 1
  if (body[cursor] === ';') cursor++
  if (body[cursor] === '\n') cursor++
  return cursor
}

// v2 anonymous-effect re-parser - `$effect: () => { ... }`.
function tryParseV2AnonEffect(
  body: string,
  start: number,
  buckets: Buckets,
  leading: string,
  position: number,
): number | null {
  const colonIdx = body.indexOf(':', start)
  if (colonIdx < 0) return null
  let cursor = colonIdx + 1
  while (cursor < body.length && /[ \t]/.test(body[cursor]!)) cursor++
  const exprStart = cursor
  if (body[exprStart] !== '(' && body.slice(exprStart, exprStart + 5) !== 'async') return null
  // Consume the rest of the line up to the matching brace (or end of expr).
  // Simplest: parse the arrow expression by finding `=>` and then the body.
  // parseArrowOrFunctionExpr handles an `async` prefix and reports it (#425).
  const fn = parseArrowOrFunctionExpr(body.slice(exprStart))
  if (!fn) return null
  // Compute end position: scan from exprStart forward consuming the arrow body.
  // parseArrowOrFunctionExpr reports a body but not the end offset; recompute
  // by counting through the same structure here.
  const closeIdx = scanArrowExprEnd(body, exprStart)
  if (closeIdx < 0) return null
  buckets.effectAnon.push({ body: fn.body, leading, position, isAsync: fn.isAsync })
  let c = closeIdx
  if (body[c] === ';') c++
  if (body[c] === '\n') c++
  return c
}

// Helper: scan past an arrow-function expression starting at `(` (optionally
// prefixed with `async`), return idx just past the closing brace (or
// end-of-expr).
function scanArrowExprEnd(s: string, start: number): number {
  if (s.slice(start, start + 5) === 'async') {
    start += 5
    while (start < s.length && /[ \t]/.test(s[start]!)) start++
  }
  if (s[start] !== '(') return -1
  const parenClose = matchParen(s, start)
  if (parenClose < 0) return -1
  let cur = parenClose + 1
  while (cur < s.length && /[ \t]/.test(s[cur]!)) cur++
  if (s[cur] === ':') {
    cur++
    const arrowAt = s.indexOf('=>', cur)
    if (arrowAt < 0) return -1
    cur = arrowAt
  }
  if (s.slice(cur, cur + 2) !== '=>') return -1
  cur += 2
  while (cur < s.length && /[ \t\n]/.test(s[cur]!)) cur++
  if (s[cur] === '{') {
    const close = matchBrace(s, cur)
    if (close < 0) return -1
    return close + 1
  }
  // expression-bodied arrow: read to end of line
  const nl = s.indexOf('\n', cur)
  return nl < 0 ? s.length : nl
}

// Split the inner of `{ ... }` at top-level commas. Each piece keeps its
// original whitespace but is trimmed on the boundaries.
interface SplitEntry {
  text: string
  leading: string
}
function splitTopLevelEntries(inner: string): SplitEntry[] {
  const out: SplitEntry[] = []
  let depthBrace = 0
  let depthParen = 0
  let depthBracket = 0
  let start = 0
  let j = 0
  while (j < inner.length) {
    const c = inner[j]!
    if (c === '/' && inner[j + 1] === '/') {
      const nl = inner.indexOf('\n', j)
      j = nl < 0 ? inner.length : nl
      continue
    }
    if (c === '/' && inner[j + 1] === '*') {
      const end = inner.indexOf('*/', j + 2)
      j = end < 0 ? inner.length : end + 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      j = skipString(inner, j)
      continue
    }
    if (c === '{') depthBrace++
    else if (c === '}') depthBrace--
    else if (c === '(') depthParen++
    else if (c === ')') depthParen--
    else if (c === '[') depthBracket++
    else if (c === ']') depthBracket--
    else if (c === ',' && depthBrace === 0 && depthParen === 0 && depthBracket === 0) {
      const piece = inner.slice(start, j)
      pushSplitEntry(out, piece)
      start = j + 1
    }
    j++
  }
  if (start < inner.length) {
    const piece = inner.slice(start)
    pushSplitEntry(out, piece)
  }
  return out
}

function pushSplitEntry(out: SplitEntry[], piece: string): void {
  // Separate leading whitespace/comments from the entry body.
  let head = ''
  let i = 0
  while (i < piece.length) {
    const lineEnd = piece.indexOf('\n', i)
    const end = lineEnd < 0 ? piece.length : lineEnd
    const line = piece.slice(i, end)
    if (line.trim() === '' || line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      head += `${line}\n`
      i = end + 1
      if (lineEnd < 0) break
      continue
    }
    break
  }
  const text = piece.slice(i).trim()
  if (text === '') return
  out.push({ text, leading: head })
}

interface ParsedV2Entry {
  name: string
  // Either a bare RHS (e.g. arrow function or expression) or a wrapped `{...}` body.
  rhs: string
  isWrapped: boolean
}

function parseV2Entry(text: string): ParsedV2Entry | null {
  const m = /^([A-Za-z_$][\w$]*)\s*:\s*/.exec(text)
  if (!m) return null
  const name = m[1]!
  const rest = text.slice(m[0].length).trim()
  if (rest.startsWith('{')) {
    // Could be either a wrapped metadata-bag OR a JS object expression that's
    // itself the value (rare in v2, e.g. a `$prop` `default: {}`). For our
    // collection-form, the wrapped form is `{ describe?, expose?, value? | handler? | type?, default? }`.
    const close = matchBrace(rest, 0)
    if (close < 0) return null
    const body = rest.slice(1, close).trim()
    return { name, rhs: body, isWrapped: true }
  }
  return { name, rhs: rest, isWrapped: false }
}

// Parse the inside of a wrapped object `{ describe: ..., expose: ..., value: ..., handler: ..., default: ..., type: ... }`.
interface WrappedFields {
  describe?: string
  expose?: { read: boolean; write: boolean }
  value?: string
  handler?: string
  default?: string
  type?: string
  on?: string
}
function parseWrappedFields(body: string): WrappedFields {
  const out: WrappedFields = {}
  const entries = splitTopLevelEntries(body)
  for (const e of entries) {
    const m = /^([A-Za-z_$][\w$]*)\s*:\s*/.exec(e.text)
    if (!m) continue
    const k = m[1]!
    const v = e.text.slice(m[0].length).trim()
    if (k === 'describe') out.describe = unquoteString(v)
    else if (k === 'expose') {
      const parsed = parseExposeLiteral(v)
      if (parsed) out.expose = parsed
    } else if (k === 'value') out.value = v
    else if (k === 'handler') out.handler = v
    else if (k === 'default') out.default = v
    else if (k === 'type') out.type = v
    else if (k === 'on') out.on = v
  }
  return out
}

function unquoteString(s: string): string {
  s = s.trim()
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return s
}

function parseExposeLiteral(s: string): { read: boolean; write: boolean } | undefined {
  s = s.trim()
  if (!s.startsWith('{')) return undefined
  const close = matchBrace(s, 0)
  if (close < 0) return undefined
  const body = s.slice(1, close)
  const read = /\bread\s*:\s*true\b/.test(body)
  const write = /\bwrite\s*:\s*true\b/.test(body)
  return { read, write }
}

function routeV2Entry(
  macro: string,
  entry: ParsedV2Entry,
  _sidecar: Map<string, Sidecar>,
  buckets: Buckets,
  leading: string,
  nextPosition: () => number,
): void {
  if (macro === 'prop') {
    if (entry.isWrapped) {
      const f = parseWrappedFields(entry.rhs)
      buckets.props.push({
        name: entry.name,
        rawType: f.type,
        rawDefault: f.default,
        describe: f.describe,
        expose: f.expose,
        leading,
      })
    }
    return
  }
  if (macro === 'computed' || macro === 'resource') {
    let thunk: { expr: string; isAsync: boolean }
    let describe: string | undefined
    let expose: { read: boolean; write: boolean } | undefined
    if (entry.isWrapped) {
      const f = parseWrappedFields(entry.rhs)
      thunk = stripThunk(f.value ?? '')
      describe = f.describe
      expose = f.expose
    } else {
      thunk = stripThunk(entry.rhs)
    }
    const target = macro === 'computed' ? buckets.computed : buckets.resource
    target.push({
      name: entry.name,
      expr: thunk.expr,
      describe,
      expose,
      leading,
      isAsync: thunk.isAsync,
    })
    return
  }
  if (macro === 'action') {
    let handlerSrc: string
    let describe: string | undefined
    let expose: { read: boolean; write: boolean } | undefined
    if (entry.isWrapped) {
      const f = parseWrappedFields(entry.rhs)
      handlerSrc = f.handler ?? ''
      describe = f.describe
      expose = f.expose
    } else {
      handlerSrc = entry.rhs
    }
    const fn = parseArrowOrFunctionExpr(handlerSrc)
    if (!fn) return
    buckets.action.push({
      name: entry.name,
      args: fn.args,
      retType: fn.retType,
      body: fn.body,
      describe,
      expose,
      leading,
      isAsync: fn.isAsync,
    })
    return
  }
  if (macro === 'effect') {
    let thunk: { expr: string; isAsync: boolean }
    let describe: string | undefined
    let expose: { read: boolean; write: boolean } | undefined
    if (entry.isWrapped) {
      const f = parseWrappedFields(entry.rhs)
      thunk = stripThunk(f.value ?? '')
      describe = f.describe
      expose = f.expose
    } else {
      thunk = stripThunk(entry.rhs)
    }
    buckets.effectNamed.push({
      name: entry.name,
      expr: thunk.expr,
      describe,
      expose,
      leading,
      isAsync: thunk.isAsync,
    })
    return
  }
  if (macro === 'lifecycle') {
    if (entry.name !== 'mount' && entry.name !== 'dispose') return
    const src = entry.isWrapped ? entry.rhs : entry.rhs
    const fn = parseArrowOrFunctionExpr(src)
    if (!fn) return
    buckets.lifecycle.push({
      kind: entry.name,
      body: fn.body,
      leading,
      position: nextPosition(),
      isAsync: fn.isAsync,
    })
    return
  }
}

// Strip a leading `() =>` (or `async () =>`, #425) from a thunk if present,
// returning the inner expr plus the async flag so re-emit can restore it.
// For wrapped `value: () => expr`, we want to round-trip the bare arrow form
// so re-emit produces `name: () => expr` identically.
function stripThunk(s: string): { expr: string; isAsync: boolean } {
  s = s.trim()
  const m = /^(async\s+)?\(\s*\)\s*(?::\s*[^=]+)?=>\s*/.exec(s)
  if (!m) return { expr: s, isAsync: false }
  const isAsync = !!m[1]
  const rest = s.slice(m[0].length)
  if (rest.startsWith('{')) {
    const close = matchBrace(rest, 0)
    if (close < 0) return { expr: rest, isAsync }
    return { expr: rest.slice(1, close).trim(), isAsync }
  }
  return { expr: rest.trim(), isAsync }
}
