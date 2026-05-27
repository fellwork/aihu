/**
 * packages/language-server/src/core/state-generator.ts
 *
 * Virtual TypeScript file generator for the @state block of a .aihu SFC.
 * Parses the @state block using inline regex + brace-depth walking (no AST, no
 * JSON.parse — values may contain non-JSON expressions). Produces a virtual
 * __state__.ts module string plus character-level source-map entries.
 *
 * See: .context/m2/a4/round-1/architect-brief-volar-refactor.md §2
 */
import type { IScriptSnapshot } from '@volar/language-core'
import type { AihuCodeMapping } from './virtual-source-map.ts'

// ---------------------------------------------------------------------------
// Public interfaces (§2.1 / §2.2)
// ---------------------------------------------------------------------------

export interface GeneratorInput {
  /** Full text of the .aihu source file */
  source: string
  /** IScriptSnapshot from Volar — use snapshot.getText(0, snapshot.getLength()) */
  snapshot: IScriptSnapshot
}

export interface GeneratorOutput {
  /** Content of the virtual TypeScript file (e.g. Counter.__state__.ts) */
  virtualCode: string
  /** Source-map entries — character-level, one per mapped identifier */
  mappings: AihuCodeMapping[]
}

// ---------------------------------------------------------------------------
// Module header (not mapped — preamble only)
// ---------------------------------------------------------------------------

const VIRTUAL_HEADER = [
  "import type { createResource as _cr } from '@aihu/runtime'",
  'export {}',
  'declare const __aihu_state__: unique symbol',
  '',
].join('\n')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find the matching closing brace for an opening brace at `openPos` in `text`.
 * Returns the index of the `}` character, or -1 if not found.
 */
function findMatchingBrace(text: string, openPos: number): number {
  let depth = 0
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Extract the value text for a macro key starting at `colonPos` (position of
 * the `:` after the macro key name) using a brace-depth walk. Returns the raw
 * value string (may be a brace-enclosed object or a simple expression).
 */
function extractMacroValue(text: string, colonPos: number): string {
  // Skip whitespace after ':'
  let start = colonPos + 1
  while (start < text.length && (text[start] === ' ' || text[start] === '\t')) start++
  if (start >= text.length) return ''

  if (text[start] === '{') {
    const close = findMatchingBrace(text, start)
    if (close === -1) return text.slice(start)
    return text.slice(start, close + 1)
  }

  // Non-brace value: read to next newline or comma
  const end = text.indexOf('\n', start)
  return end === -1 ? text.slice(start) : text.slice(start, end)
}

/**
 * Infer the TypeScript type from a `default:` value in a macro entry object.
 * Handles number, string, boolean literals, null/undefined, and verbatim `type:` key.
 */
function inferType(entryText: string): string {
  // Check for explicit `type:` key first
  const typeMatch = /\btype\s*:\s*(['"`]?)(\w[\w.<>, [\]|&?]*)\1/.exec(entryText)
  if (typeMatch) return typeMatch[2]!

  // Check for `default:` value
  const defMatch = /\bdefault\s*:\s*([^,}\n]+)/.exec(entryText)
  if (!defMatch) return 'unknown'

  const val = defMatch[1]!.trim()
  if (/^-?\d+(\.\d+)?$/.test(val)) return 'number'
  if (/^(['"`]).*\1$/.test(val)) return 'string'
  if (val === 'true' || val === 'false') return 'boolean'
  if (val === 'null' || val === 'undefined') return 'unknown'

  // Could be a more complex expression — fall back
  return 'unknown'
}

/**
 * Extract the default value string from a macro entry for use in the virtual
 * TS initialiser. Numbers stay as-is; strings stay as-is; others → 0 as any.
 */
function inferDefault(entryText: string, type: string): string {
  const defMatch = /\bdefault\s*:\s*([^,}\n]+)/.exec(entryText)
  if (!defMatch) return '0 as any'
  const val = defMatch[1]!.trim()
  if (type === 'number') return `${val} as any`
  if (type === 'string') return `${val} as any`
  if (type === 'boolean') return `${val} as any`
  return '0 as any'
}

// CodeInformation flags for mapped identifiers (§3.2)
const MAPPED_DATA = {
  verification: false,
  completion: true,
  semantic: true,
  navigation: true,
  structure: true,
} as const

// ---------------------------------------------------------------------------
// Macro lowering (§2.4)
// ---------------------------------------------------------------------------

/**
 * Lower a single macro block into virtual TS lines.
 * Returns an array of { line, sourceNameOffset, generatedNameOffset, nameLen } records.
 */
interface LoweredDecl {
  code: string
  /** character offset in source where the identifier appears (for source-map) */
  sourceNameOffset: number
  /** whether this identifier should be mapped */
  mapped: boolean
  nameLen: number
}

function lowerMacro(
  macroKey: string,
  valueText: string,
  macroKeyOffset: number,
  source: string,
): LoweredDecl[] {
  const results: LoweredDecl[] = []

  // Parse the value text — it should be a brace-enclosed object { name: { ... }, ... }
  // We iterate over top-level keys by scanning lines inside the value block
  const inner = valueText.startsWith('{') ? valueText.slice(1, valueText.length - 1) : valueText

  // Find each property name (top-level key) in the entry object
  // We scan the inner text at brace-depth 0 for `identifier:` patterns
  let depth = 0
  let i = 0
  while (i < inner.length) {
    const ch = inner[i]
    if (ch === '{') {
      depth++
      i++
      continue
    }
    if (ch === '}') {
      depth--
      i++
      continue
    }

    if (depth === 0 && ch !== undefined) {
      // Try to match an identifier key at this position
      const identMatch = /^(\w[\w-]*)(\s*):/.exec(inner.slice(i))
      if (identMatch) {
        const name = identMatch[1]!
        // Find the colon position in the inner text for value extraction
        const colonPos = i + identMatch[0].length - 1 // position of ':'

        // Get the value of this named entry
        let entryValue = ''
        const afterColon = inner.slice(colonPos + 1).trimStart()
        if (afterColon.startsWith('{')) {
          const absColonPos = colonPos + 1
          let s = absColonPos
          // Skip whitespace
          while (s < inner.length && (inner[s] === ' ' || inner[s] === '\t' || inner[s] === '\n'))
            s++
          if (inner[s] === '{') {
            const close = findMatchingBrace(inner, s)
            entryValue = close === -1 ? inner.slice(s) : inner.slice(s, close + 1)
            i = close !== -1 ? close + 1 : inner.length
          } else {
            const eol = inner.indexOf('\n', s)
            entryValue = eol === -1 ? inner.slice(s) : inner.slice(s, eol)
            i = eol !== -1 ? eol + 1 : inner.length
          }
        } else {
          const eol = inner.indexOf('\n', colonPos + 1)
          entryValue = eol === -1 ? inner.slice(colonPos + 1) : inner.slice(colonPos + 1, eol)
          i = eol !== -1 ? eol + 1 : inner.length
        }

        // Find the source offset of this name in the original source
        // Search from macroKeyOffset forward for the name identifier
        const searchFrom = macroKeyOffset
        const nameInSource = source.indexOf(name, searchFrom)

        const decl = buildDecl(macroKey, name, entryValue, nameInSource)
        if (decl) results.push(decl)
        continue
      }
    }
    i++
  }

  return results
}

function buildDecl(
  macroKey: string,
  name: string,
  entryText: string,
  sourceNameOffset: number,
): LoweredDecl | null {
  switch (macroKey) {
    case '$prop':
    case '$shared':
    case '$cookie': {
      const type = inferType(entryText)
      const def = inferDefault(entryText, type)
      return {
        code: `const ${name}: ${type} = ${def}`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$computed': {
      // `doubled: count * 2` → `const doubled = count * 2`
      const expr = entryText.trim().replace(/^['"`]|['"`]$/g, '')
      return {
        code: `const ${name} = ${expr || 'undefined'}`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$action': {
      // `inc: () => { count++ }` → `function inc(): void { count++ }`
      const bodyMatch = /=>\s*(\{[\s\S]*\}|\S+)/.exec(entryText)
      const body = bodyMatch ? bodyMatch[1]! : '{}'
      return {
        code: `function ${name}(): void ${body}`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$resource': {
      return {
        code: `const ${name} = (null as any as ReturnType<typeof _cr>)`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$effect': {
      // `track: () => { log(count) }` → `/* effect: track */; count`
      // Extract body expression
      const bodyMatch = /=>\s*(?:\{([^}]*)\}|([^,}\n]+))/.exec(entryText)
      const bodyText = bodyMatch ? (bodyMatch[1] ?? bodyMatch[2] ?? '').trim() : ''
      return {
        code: `/* effect: ${name} */; ${bodyText || 'void 0'}`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$lifecycle': {
      // Not mapped (§2.4 table)
      return {
        code: `/* lifecycle.${name} */`,
        sourceNameOffset,
        mapped: false,
        nameLen: name.length,
      }
    }
    case '$watch': {
      // `src: count, cb: (n,p) => {}` → `/* watch: src */; count`
      // Extract source expression (value of the `src` key or the entry name's expr)
      const srcMatch = /\bsrc\s*:\s*([^,}\n]+)/.exec(entryText)
      const srcExpr = srcMatch ? srcMatch[1]!.trim() : name
      return {
        code: `/* watch: ${name} */; ${srcExpr}`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$expose': {
      // Not mapped (§2.4 table)
      return {
        code: `/* expose: ${name} */`,
        sourceNameOffset,
        mapped: false,
        nameLen: name.length,
      }
    }
    case '$server': {
      // `fetch: async () => {}` → `async function fetch(): Promise<unknown> {}`
      const bodyMatch = /=>\s*(\{[\s\S]*?\})/.exec(entryText)
      const body = bodyMatch ? bodyMatch[1]! : '{}'
      return {
        code: `async function ${name}(): Promise<unknown> ${body}`,
        sourceNameOffset,
        mapped: true,
        nameLen: name.length,
      }
    }
    case '$meta': {
      // Not mapped (§2.4 table)
      return {
        code: `/* meta: ${name} */`,
        sourceNameOffset,
        mapped: false,
        nameLen: name.length,
      }
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Main generator function (§2.3)
// ---------------------------------------------------------------------------

/**
 * Generate the virtual TypeScript file for the @state block of a .aihu source.
 * Returns `{ virtualCode: '', mappings: [] }` if no @state block is found.
 */
export function generateStateVirtualCode(input: GeneratorInput): GeneratorOutput {
  const source = input.source

  // Step 1: find the @state { opener
  const openerRe = /^@state\s*\{/m
  const openerMatch = openerRe.exec(source)
  if (!openerMatch) {
    return { virtualCode: '', mappings: [] }
  }

  // Step 2: find the matching closing brace
  const openBracePos = openerMatch.index + openerMatch[0].length - 1
  const closeBracePos = findMatchingBrace(source, openBracePos)
  if (closeBracePos === -1) {
    return { virtualCode: '', mappings: [] }
  }

  // Step 3: extract block body (text between the outer braces, exclusive)
  const blockBody = source.slice(openBracePos + 1, closeBracePos)

  // Step 4: scan block body for macro keys matching /^\s*\$(\w[\w-]*):/
  const macroRe = /^\s*(\$(?:\w[\w-]*))\s*:/gm
  const declarations: LoweredDecl[] = []

  let macroMatch: RegExpExecArray | null
  while ((macroMatch = macroRe.exec(blockBody)) !== null) {
    const macroKey = macroMatch[1]!
    // Position of this macro key relative to block body start → absolute in source
    const macroKeyOffsetInSource = openBracePos + 1 + macroMatch.index

    // Extract the full value text for this macro
    const colonAbsPos = openBracePos + 1 + macroMatch.index + macroMatch[0].length - 1
    const valueText = extractMacroValue(source, colonAbsPos)

    const lowered = lowerMacro(macroKey, valueText, macroKeyOffsetInSource, source)
    declarations.push(...lowered)
  }

  if (declarations.length === 0) {
    return { virtualCode: '', mappings: [] }
  }

  // Step 5: build virtual file content
  let virtualCode = VIRTUAL_HEADER
  const mappings: AihuCodeMapping[] = []

  for (const decl of declarations) {
    const generatedOffset = virtualCode.length
    virtualCode += `${decl.code}\n`

    if (decl.mapped && decl.sourceNameOffset >= 0) {
      // Find the identifier in the generated line
      // The identifier starts at `generatedOffset` + position within the generated line
      // For `const NAME:` the name starts at "const ".length = 6
      // For `function NAME` the name starts at "function ".length = 9
      // For `async function NAME` the name starts at "async function ".length = 15
      // For `/* effect: NAME */` the name is NOT the leading identifier — skip for effect/lifecycle etc.
      let generatedNameOffset = generatedOffset
      const codeLine = decl.code

      // Use string search for the actual name
      const nameStr = source.slice(decl.sourceNameOffset, decl.sourceNameOffset + decl.nameLen)
      const nameInGenerated = codeLine.indexOf(nameStr)
      if (nameInGenerated >= 0) {
        generatedNameOffset = generatedOffset + nameInGenerated
      }

      mappings.push({
        sourceOffsets: [decl.sourceNameOffset],
        generatedOffsets: [generatedNameOffset],
        lengths: [decl.nameLen],
        data: { ...MAPPED_DATA },
      })
    }
  }

  return { virtualCode, mappings }
}
