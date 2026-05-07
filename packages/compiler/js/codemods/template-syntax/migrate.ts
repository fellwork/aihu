/**
 * template-syntax codemod (B3b — AC13/14/15)
 *
 * Migrates v1 .aihu source template syntax to v2 dot-form per
 * the Variant B spec. The @template block is transformed; @state,
 * @style, @route, @agent blocks are passed through unchanged
 * (except $prop/$event introspection from @state for P6/P7).
 *
 * Seven transformation passes in order:
 *   P2  $on:click → $on.click (colon→dot across all $on: usages)
 *   P3  $bind:value → $bind.value (colon→dot across all $bind: usages)
 *   P4  class={'a' + (cond ? ' b' : '')} → class={['a', cond && 'b']}
 *   P5  $html={expr} → {@html expr}
 *   P6  this.dispatchEvent(new CustomEvent('name', {detail})) → $emit.name(detail)
 *       (only when SFC has $emit: { name } declaration; else W502 + leave)
 *   P7  propName().x → propName.x in @template when propName is $prop in scope
 *
 * Note: P1 ($if/$each/$key attrs) are kept as-is — the compiler accepts the
 * attribute form and block-tag form migration is opt-in (not forced here).
 */

export interface MigrateResult {
  readonly rewritten: string
  readonly warnings: readonly string[]
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function migrate(source: string): MigrateResult {
  const warnings: string[] = []

  const templateBlock = findBlock(source, 'template')
  if (!templateBlock) {
    return { rewritten: source, warnings }
  }

  const templateBody = templateBlock.body

  // Collect $emit event names from @state for P6.
  const eventNames = collectEventNames(source)

  // Collect $prop names from @state for P7.
  const propNames = collectPropNames(source)

  let out = templateBody

  // P2: $on: → $on.
  out = passColonToDot(out, 'on', warnings)

  // P3: $bind: → $bind.
  out = passColonToDot(out, 'bind', warnings)

  // P4: class={string + ternary} → class={[array]}
  out = passClassTernaryToArray(out, warnings)

  // P5: $html={expr} → {@html expr}
  out = passHtmlDirective(out, warnings)

  // P6: this.dispatchEvent(...) → $emit.name(detail)
  if (eventNames.size > 0) {
    out = passDispatchEventToEmit(out, eventNames, warnings)
  }

  // P7: propName() → propName in template when propName is a $prop
  if (propNames.size > 0) {
    out = passPropCallChain(out, propNames, warnings)
  }

  if (out === templateBody) {
    return { rewritten: source, warnings }
  }

  const rewritten =
    source.slice(0, templateBlock.bodyStart) + out + source.slice(templateBlock.bodyEnd)

  return { rewritten, warnings }
}

// ---------------------------------------------------------------------------
// Block finder (brace-balanced, string/comment-aware)
// ---------------------------------------------------------------------------

interface BlockSpan {
  start: number
  end: number
  bodyStart: number
  bodyEnd: number
  body: string
}

function findBlock(source: string, name: string): BlockSpan | null {
  const re = new RegExp(`(^|\\n)([ \\t]*)@${name}\\s*\\{`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const startMatch = m.index + (m[1] === '\n' ? 1 : 0)
    const openIdx = m.index + m[0].length - 1
    const closeIdx = matchBrace(source, openIdx)
    if (closeIdx < 0) continue
    return {
      start: startMatch,
      end: closeIdx + 1,
      bodyStart: openIdx + 1,
      bodyEnd: closeIdx,
      body: source.slice(openIdx + 1, closeIdx),
    }
  }
  return null
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
      j = skipStr(s, j)
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

function skipStr(s: string, i: number): number {
  const q = s[i]!
  let j = i + 1
  while (j < s.length) {
    const c = s[j]
    if (c === '\\') { j += 2; continue }
    if (q === '`' && c === '$' && s[j + 1] === '{') {
      const close = matchBrace(s, j + 1)
      j = close < 0 ? s.length : close + 1
      continue
    }
    if (c === q) return j + 1
    j++
  }
  return s.length
}

// ---------------------------------------------------------------------------
// @state introspection helpers
// ---------------------------------------------------------------------------

function collectEventNames(source: string): Set<string> {
  const names = new Set<string>()
  // $emit: { name: { ... }, ... } collection form
  const emitCollRe = /\$emit\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = emitCollRe.exec(source)) !== null) {
    const openIdx = m.index + m[0].length - 1
    const closeIdx = matchBrace(source, openIdx)
    if (closeIdx < 0) continue
    const inner = source.slice(openIdx + 1, closeIdx)
    const keyRe = /^\s*([A-Za-z_$][\w$]*)\s*:/gm
    let km: RegExpExecArray | null
    while ((km = keyRe.exec(inner)) !== null) {
      names.add(km[1]!)
    }
  }
  // bare $event: name or $event name
  const barRe = /\$event\s*:?\s*([A-Za-z_$][\w$]*)/g
  while ((m = barRe.exec(source)) !== null) {
    names.add(m[1]!)
  }
  return names
}

function collectPropNames(source: string): Set<string> {
  const names = new Set<string>()
  const stateBlock = findBlock(source, 'state')
  if (!stateBlock) return names
  const body = stateBlock.body
  // $prop: { name: ... } collection form
  const propCollRe = /\$prop\s*:\s*\{/g
  let m: RegExpExecArray | null
  while ((m = propCollRe.exec(body)) !== null) {
    const openIdx = m.index + m[0].length - 1
    const closeIdx = matchBrace(body, openIdx)
    if (closeIdx < 0) continue
    const inner = body.slice(openIdx + 1, closeIdx)
    const keyRe = /^\s*([A-Za-z_$][\w$]*)\s*:/gm
    let km: RegExpExecArray | null
    while ((km = keyRe.exec(inner)) !== null) {
      names.add(km[1]!)
    }
  }
  // v1: $prop name: type
  const v1Re = /^\s*\$prop\s+([A-Za-z_$][\w$]*)\s*:/gm
  while ((m = v1Re.exec(body)) !== null) {
    names.add(m[1]!)
  }
  return names
}

// ---------------------------------------------------------------------------
// P2 + P3: colon → dot for $on: and $bind:
// ---------------------------------------------------------------------------

// Replaces `$prefix:name` → `$prefix.name` outside string literals and
// HTML comments in the @template body.
function passColonToDot(template: string, prefix: 'on' | 'bind', warnings: string[]): string {
  const tag = `$${prefix}:`
  let result = ''
  let i = 0
  let count = 0

  while (i < template.length) {
    // Skip HTML comments
    if (template[i] === '<' && template.slice(i, i + 4) === '<!--') {
      const end = template.indexOf('-->', i + 4)
      const finish = end < 0 ? template.length : end + 3
      result += template.slice(i, finish)
      i = finish
      continue
    }

    // Skip quoted strings (HTML attribute values)
    if (template[i] === '"' || template[i] === "'") {
      const q = template[i]!
      const start = i
      i++
      while (i < template.length && template[i] !== q) {
        if (template[i] === '\\') i++
        i++
      }
      i++ // closing quote
      result += template.slice(start, i)
      continue
    }

    // Skip JSX / JS expressions inside { }
    if (template[i] === '{') {
      const closeIdx = matchBrace(template, i)
      const end = closeIdx < 0 ? template.length : closeIdx + 1
      result += template.slice(i, end)
      i = end
      continue
    }

    // Check for the $prefix: pattern
    if (template.startsWith(tag, i)) {
      result += `$${prefix}.`
      i += tag.length
      count++
      continue
    }

    result += template[i]
    i++
  }

  if (count > 0) {
    const passNum = prefix === 'on' ? '2' : '3'
    warnings.push(`P${passNum}: replaced ${count} \`$${prefix}:\` → \`$${prefix}.\``)
  }

  return result
}

// ---------------------------------------------------------------------------
// P4: class={string + ternary} → class={[array]}
// ---------------------------------------------------------------------------

// Conservative: handles `class={'base' + (cond ? ' extra' : '')}` only.
function passClassTernaryToArray(template: string, warnings: string[]): string {
  // Match: class={<q>base<q> + (cond ? <q> extra<q> : <q><q>)}
  // Single or double quotes, base literal + space-prefixed extra literal.
  // The false branch must be empty string ''.
  const re =
    /\bclass=\{(['"])((?:[^'"\\]|\\.)*)\1\s*\+\s*\(\s*([^?{}()'"]+?)\s*\?\s*(['"])([ \t][\w -]*)\4\s*:\s*(['"])\6\s*\)\s*\}/g

  let count = 0
  const result = template.replace(re, (_full, _q, base, cond, _q2, extra) => {
    const trimmedExtra = (extra as string).trimStart()
    if (!trimmedExtra) return _full
    count++
    return `class={[${JSON.stringify(base as string)}, (${(cond as string).trim()}) && ${JSON.stringify(trimmedExtra)}]}`
  })

  if (count > 0) {
    warnings.push(`P4: replaced ${count} class ternary → array form`)
  }

  return result
}

// ---------------------------------------------------------------------------
// P5: $html={expr} → {@html expr} (element child injection)
// ---------------------------------------------------------------------------

// Transforms <el ... $html={expr} ...></el> into <el ...>{@html expr}</el>.
// Uses a stateful scan to find elements with $html attribute and restructures them.
function passHtmlDirective(template: string, warnings: string[]): string {
  // We scan for `$html={` patterns and reconstruct the element.
  // The approach: find open tags that contain $html=, extract the expression,
  // remove the attribute from the open tag, and inject {@html expr} as a child.
  let out = ''
  let i = 0
  let count = 0

  while (i < template.length) {
    // Look for `<tagname` starts
    if (template[i] === '<' && template[i + 1] !== '/' && template[i + 1] !== '!' && template[i + 1] !== '?') {
      // Find the end of the opening tag (> or />)
      const tagStart = i
      // Read tag name
      let j = i + 1
      while (j < template.length && /[A-Za-z0-9-]/.test(template[j]!)) j++
      const tagName = template.slice(i + 1, j)
      if (!tagName) {
        out += template[i]
        i++
        continue
      }
      // Scan to end of open tag, tracking strings and braces
      let k = j
      let htmlExpr: string | null = null
      let beforeHtml = template.slice(tagStart, j)
      let selfClose = false

      while (k < template.length) {
        // End of tag
        if (template[k] === '>' || (template[k] === '/' && template[k + 1] === '>')) {
          selfClose = template[k] === '/'
          k += selfClose ? 2 : 1
          break
        }
        // Quoted attribute value
        if (template[k] === '"' || template[k] === "'") {
          const q = template[k]!
          const strStart = k
          k++
          while (k < template.length && template[k] !== q) {
            if (template[k] === '\\') k++
            k++
          }
          k++ // closing quote
          beforeHtml += template.slice(k - (k - strStart), k)
          // re-append: already handled in else below but needs fix
          // redo: track what we add
          continue
        }
        // JSX expression
        if (template[k] === '{') {
          const closeIdx = matchBrace(template, k)
          const end = closeIdx < 0 ? template.length : closeIdx + 1
          // Check if this is $html={...} — i.e., preceded by $html=
          if (beforeHtml.trimEnd().endsWith('$html=')) {
            // This is the $html expression
            htmlExpr = template.slice(k + 1, closeIdx)
            // Remove the trailing `$html=` from beforeHtml
            beforeHtml = beforeHtml.replace(/\s*\$html=$/, '')
            k = end
            continue
          }
          beforeHtml += template.slice(k, end)
          k = end
          continue
        }
        // Check for $html= attribute name
        if (template.startsWith('$html=', k)) {
          // We'll consume $html= and then the next character determines whether
          // it's {expr} or "expr" form. We handle {expr} in the brace case above,
          // but we need to set up beforeHtml to end with `$html=` for detection.
          beforeHtml += '$html='
          k += '$html='.length
          continue
        }
        beforeHtml += template[k]
        k++
      }

      if (htmlExpr !== null) {
        // We found a $html attribute. Reconstruct the element.
        // Remove trailing whitespace from open tag attrs
        const cleanOpen = beforeHtml.trimEnd()
        if (selfClose) {
          // <el attrs/> → <el attrs>{@html expr}</el>
          out += `${cleanOpen}>{@html ${htmlExpr}}</${tagName}>`
        } else {
          // <el attrs> ... </el> → <el attrs>{@html expr}</el>
          // Skip the original children up to the close tag
          const closeTag = `</${tagName}>`
          const closeIdx = template.indexOf(closeTag, k)
          if (closeIdx >= 0) {
            out += `${cleanOpen}>{@html ${htmlExpr}}${closeTag}`
            i = closeIdx + closeTag.length
          } else {
            // No close tag found - inject before existing children
            out += `${cleanOpen}>{@html ${htmlExpr}}`
            i = k
          }
        }
        count++
        if (!selfClose) continue
        i = k
        continue
      }

      // No $html found in this tag - output as-is
      out += template.slice(tagStart, k)
      i = k
      continue
    }

    out += template[i]
    i++
  }

  if (count > 0) {
    warnings.push(`P5: replaced ${count} \`$html={...}\` → \`{@html ...}\``)
  }

  return out
}

// ---------------------------------------------------------------------------
// P6: this.dispatchEvent(new CustomEvent('name', {detail})) → $emit.name(detail)
// ---------------------------------------------------------------------------

function passDispatchEventToEmit(
  template: string,
  eventNames: Set<string>,
  warnings: string[],
): string {
  const re =
    /this\.dispatchEvent\(\s*new\s+CustomEvent\(\s*['"]([A-Za-z_$][\w$]*)['"](?:\s*,\s*\{\s*detail\s*:\s*([^}]+?)\s*\})?\s*\)\s*\)/g

  let count = 0
  const result = template.replace(re, (full, name, detail) => {
    const evtName = name as string
    if (!eventNames.has(evtName)) {
      warnings.push(
        `P6: W502: dispatchEvent('${evtName}') — no $emit declaration; leaving unchanged`,
      )
      return full
    }
    count++
    const payload = (detail as string | undefined)?.trim() ?? 'undefined'
    return `$emit.${evtName}(${payload})`
  })

  if (count > 0) {
    warnings.push(`P6: replaced ${count} dispatchEvent call(s) → \$emit`)
  }

  return result
}

// ---------------------------------------------------------------------------
// P7: propName() → propName in @template (conservative signal-getter unwrap)
// ---------------------------------------------------------------------------

// In v2 @state $prop form, props are reactive state values accessed directly
// (not as signal getters). Templates that use propName() (v1 signal-getter form)
// should use propName (direct access). This pass conservatively replaces
// standalone `propName()` calls (not `propName(arg)`) in the template body.
function passPropCallChain(template: string, propNames: Set<string>, warnings: string[]): string {
  if (propNames.size === 0) return template

  const escaped = [...propNames].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // Match propName() only when followed by non-alphanumeric (to avoid matching propNames())
  const re = new RegExp(`\\b(${escaped.join('|')})\\(\\)(?=[^A-Za-z0-9_$])`, 'g')

  let count = 0
  const result = template.replace(re, (_full, name) => {
    count++
    return name as string
  })

  if (count > 0) {
    warnings.push(`P7: replaced ${count} \`propName()\` → \`propName\` (prop access unwrap)`)
  }

  return result
}
