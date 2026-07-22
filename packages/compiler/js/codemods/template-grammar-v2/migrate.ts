/**
 * template-grammar-v2 codemod — migrate v1 template syntax to the
 * prefix-less grammar (docs/plans/template-grammar/40-spec.md).
 *
 * Transforms (template surface only; `@state` bodies are untouched):
 *   $if={e} / $if="x"            =>  if={e} / if={x}
 *   $each="list as item[, i]"    =>  each={item[, i] of list}
 *   $each={list as item}         =>  each={item of list}
 *   $each={list} [+ $let={x}]    =>  each={x of list}   (default alias: item)
 *   $key/$show/$html/$ref/$memo  =>  naked word, braced value
 *   $once / $raw                 =>  once / raw
 *   $on.click={h} / quoted       =>  on:click={h}
 *   $bind.value={x} / quoted     =>  bind:value={x}
 *   $class:active={c}            =>  class:active={c}
 *   $class={e} and any $attr={e} =>  attr={e}          (plain braces)
 *   {#if}/{:else if}/{:else}/{/if}       =>  <group if=…>/<group elseif=…>/…
 *   {#each … as … (key)}/{:empty}/{/each} =>  <group each={… of …} key=…>/…
 *   {@html e}                    =>  <span html={e}></span>
 *   {{ident}}                    =>  {ident}
 *   <$link …>…</$link>           =>  <a …>…</a>
 *   <$slot>/<$suspense>/…        =>  <slot>/<suspense>/… (de-`$`-ed)
 *
 * The block conversions are mechanical (`<group>`-wrapping). Authors may
 * hand-tighten single-element branches onto the element itself afterwards —
 * both forms compile to the same arbor structural calls.
 */

export interface TemplateGrammarResult {
  readonly rewritten: string
  readonly changed: boolean
}

const MACRO_ELEMENTS = [
  'slot',
  'suspense',
  'shield',
  'outlet',
  'router',
  'navigate',
  'guard',
  'warp',
  'focusTrap',
  'liveRegion',
  'visuallyHidden',
  'skipLink',
] as const

/** Fold `$each={list}` + `$let={alias}` on one tag into `each={alias of list}`. */
function foldEachLet(src: string): string {
  return src.replace(/<[a-zA-Z$][^<>]*>/g, (tag) => {
    if (!tag.includes('$let=')) return tag
    const letM = tag.match(/\$let=\{([^}]+)\}|\$let="([^"]+)"/)
    if (!letM) return tag
    const alias = (letM[1] ?? letM[2] ?? '').trim()
    const eachM = tag.match(/\$each=\{([^}]+)\}|\$each="([^"]+)"/)
    if (!eachM) return tag
    const list = (eachM[1] ?? eachM[2] ?? '').trim()
    let out = tag.replace(letM[0], '')
    out = out.replace(eachM[0], `each={${alias} of ${list}}`)
    return out
      .replace(/\s+(\/?>)$/, '$1')
      .replace(/\s{2,}/g, (ws) => (ws.includes('\n') ? ws : ' '))
  })
}

/** `{#each LIST as ALIASES (KEY)}` head split, scanner-lite (paren/bracket depth). */
function splitEachHead(
  head: string,
): { list: string; aliases: string; key: string | undefined } | null {
  // Locate top-level ` as `.
  let depth = 0
  let asAt = -1
  for (let i = 0; i < head.length; i++) {
    const c = head[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (depth === 0 && c === ' ' && head.startsWith('as ', i + 1) && asAt === -1) {
      asAt = i
    }
  }
  if (asAt === -1) return null
  const list = head.slice(0, asAt).trim()
  let rest = head.slice(asAt + 4).trim()
  // Optional trailing `(key)` group.
  let key: string | undefined
  if (rest.endsWith(')')) {
    let d = 0
    for (let i = rest.length - 1; i >= 0; i--) {
      const c = rest[i]
      if (c === ')') d++
      else if (c === '(') {
        d--
        if (d === 0) {
          if (i > 0 && /\s/.test(rest[i - 1] ?? '')) {
            key = rest.slice(i + 1, rest.length - 1).trim()
            rest = rest.slice(0, i).trim()
          }
          break
        }
      }
    }
  }
  return { list, aliases: rest, key }
}

/** Convert `{#if}` / `{#each}` / `{@html}` block forms to element/attribute form. */
function migrateBlocks(src: string): string {
  let out = src

  // {#if cond} → <group if={cond}>
  out = out.replace(/\{#if\s+([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g, (_m, cond: string) => {
    return `<group if={${cond.trim()}}>`
  })
  // {:else if cond} → </group><group elseif={cond}>
  out = out.replace(
    /\{:else\s+if\s+([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, cond: string) => `</group><group elseif={${cond.trim()}}>`,
  )
  // {:else} → </group><group else>
  out = out.replace(/\{:else\}/g, '</group><group else>')
  // {/if} → </group>
  out = out.replace(/\{\/\s*if\s*\}/g, '</group>')

  // {#each head} → <group each={aliases of list} key={key}>
  out = out.replace(/\{#each\s+([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g, (m, head: string) => {
    const parts = splitEachHead(head.trim())
    if (!parts) return m
    const keyPart = parts.key ? ` key={${parts.key}}` : ''
    return `<group each={${parts.aliases} of ${parts.list}}${keyPart}>`
  })
  // {:empty} → </group><group empty>
  out = out.replace(/\{:empty\}/g, '</group><group empty>')
  // {/each} → </group>
  out = out.replace(/\{\/\s*each\s*\}/g, '</group>')

  // {@html expr} → <span html={expr}></span> (same placeholder-element
  // lowering the block form compiled to).
  out = out.replace(
    /\{@html\s+([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}/g,
    (_m, expr: string) => `<span html={${expr.trim()}}></span>`,
  )

  return out
}

/** v1 `$`-attribute layer → naked words / colon directives / plain braces. */
function migrateAttrs(src: string): string {
  let out = src

  // Events + two-way binds, dot-form → colon directives (curly + quoted).
  out = out.replace(/\$on\.([A-Za-z][\w]*((?:\.[a-z]+)*))=\{/g, 'on:$1={')
  out = out.replace(/\$on\.([A-Za-z][\w]*)="([^"]*)"/g, 'on:$1={$2}')
  out = out.replace(/\$bind\.([A-Za-z][\w-]*)=\{/g, 'bind:$1={')
  out = out.replace(/\$bind\.([A-Za-z][\w-]*)="([^"]*)"/g, 'bind:$1={$2}')

  // Class toggles. Accept BOTH the colon spelling (`$class:active`) and the
  // dot spelling (`$class.active`) — the v1 attribute layer permitted the dot
  // form by analogy with `$on.`/`$bind.`, and it was silently passed through
  // untouched (#502). Both normalize to the v2 `class:` directive.
  out = out.replace(/\$class[:.]([A-Za-z][\w-]*)=\{/g, 'class:$1={')
  out = out.replace(/\$class[:.]([A-Za-z][\w-]*)="([^"]*)"/g, 'class:$1={$2}')

  // $each string-DSL and curly `list as alias` forms → item-first `of` head.
  out = out.replace(/\$each="([^"]+?) as ([^"]+?)"/g, 'each={$2 of $1}')
  out = out.replace(/\$each=\{([^}]+?) as ([^}]+?)\}/g, 'each={$2 of $1}')
  // Remaining `$each={list}` — the v1 default alias was `item`.
  out = out.replace(/\$each=\{([^}]+)\}/g, 'each={item of $1}')
  out = out.replace(/\$each="([^"]+)"/g, 'each={item of $1}')

  // Braced control words pass through de-`$`-ed; quoted forms gain braces.
  out = out.replace(/\$(if|key|show|html|ref|memo)=\{/g, '$1={')
  out = out.replace(/\$(if|key|show|html|ref|memo)="([^"]*)"/g, '$1={$2}')

  // Boolean words (attribute position only — require tag-ish delimiter after).
  out = out.replace(/\$once(?=[\s/>])/g, 'once')
  out = out.replace(/\$raw(?=[\s/>])/g, 'raw')

  // Any remaining `$name={expr}` binding (incl. $class= / $href= / $aria-*=)
  // → plain braces. Guard against `${…}` template-literal holes (no name) and
  // identifiers containing `$` (require a non-word char before `$`).
  out = out.replace(/(?<![\w$])\$([a-zA-Z][\w-]*)=\{/g, '$1={')

  return out
}

/** `<$macro>` elements → naked framework elements; `<$link>` → `<a>`. */
function migrateElements(src: string): string {
  let out = src
  out = out.replace(/<\$link\b/g, '<a')
  out = out.replace(/<\/\$link>/g, '</a>')
  for (const name of MACRO_ELEMENTS) {
    out = out.replace(new RegExp(`<\\$${name}\\b`, 'g'), `<${name}`)
    out = out.replace(new RegExp(`</\\$${name}>`, 'g'), `</${name}>`)
  }
  return out
}

/** v0 `{{ident}}` double-brace interpolation → single braces. */
function migrateDoubleBrace(src: string): string {
  return src.replace(/\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g, '{$1}')
}

/**
 * Run every template-grammar-v2 pass over one `.aihu` source (or a markdown
 * document containing `.aihu` snippets — the transforms are anchored to
 * template-syntax shapes and leave prose alone).
 */
export function migrateTemplateGrammar(source: string): TemplateGrammarResult {
  let out = source
  out = foldEachLet(out)
  out = migrateBlocks(out)
  out = migrateAttrs(out)
  out = migrateElements(out)
  out = migrateDoubleBrace(out)
  return { rewritten: out, changed: out !== source }
}
