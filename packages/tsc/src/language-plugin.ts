/**
 * The Volar language plugin that presents a `.aihu` file to TypeScript as
 * virtual TypeScript.
 *
 * The virtual code is the compiler's type-check surface (`compileSidecar`) — the
 * same text that used to be written to disk as `<name>.aihu.ts`. Nothing is
 * written now: TypeScript sees it through this plugin, and a diagnostic reported
 * against it is mapped back to the `.aihu` line the author wrote.
 *
 * ## Why the mapping is simple
 *
 * The surface is LINE-PRESERVING: line N of the generated text corresponds to
 * line N of the `.aihu` source. Two kinds of line carry code:
 *
 *   - `@state` lines, which are inlined VERBATIM — identical text, identical
 *     indentation — so a position maps by identity within the line;
 *   - lifted template expressions, written as `void (EXPR);` or
 *     `__handler(EXPR);`, where only the EXPR substring exists in the source, at
 *     a different column.
 *
 * So the mapping is built per line: match the generated line against the source
 * line and map the span they share. Anything else (the preamble, the function
 * opener, blank padding) is left unmapped, which is what we want — a diagnostic
 * there is about generated scaffolding, not about the author's code, and Volar
 * will not surface it against the source file.
 */
import { compileSidecar } from '@aihu/compiler'
import type { CodeMapping, LanguagePlugin, VirtualCode } from '@volar/language-core'
import type ts from 'typescript'

/** Every position in a mapped span is a full participant in the language. */
const FULL: CodeMapping['data'] = {
  completion: true,
  format: false,
  navigation: true,
  semantic: true,
  structure: true,
  verification: true,
}

function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/**
 * Map the generated surface back onto the source, line by line.
 *
 * For each generated line, find the longest run it shares with the source line
 * of the same number. A verbatim `@state` line shares the whole line; a lifted
 * `void (EXPR);` shares EXPR, which we locate in the source line by substring.
 */
export function buildMappings(source: string, generated: string): CodeMapping[] {
  const srcStarts = lineStarts(source)
  const genStarts = lineStarts(generated)
  const srcLines = source.split('\n')
  const genLines = generated.split('\n')
  const mappings: CodeMapping[] = []

  for (let i = 0; i < genLines.length && i < srcLines.length; i++) {
    const gen = genLines[i]
    const src = srcLines[i]
    if (!gen || !src) continue

    // Verbatim @state line — identical text, so the whole line maps by identity.
    if (gen === src) {
      mappings.push({
        sourceOffsets: [srcStarts[i]],
        generatedOffsets: [genStarts[i]],
        lengths: [src.length],
        data: FULL,
      })
      continue
    }

    // A lifted template expression: `void (EXPR);` / `__handler(EXPR);`. The EXPR
    // text is verbatim from the source, so find it in the source line. Several
    // expressions can share a line; walk both cursors forward so repeats of the
    // same text map to successive occurrences rather than all to the first.
    let srcCursor = 0
    for (const m of gen.matchAll(/(?:void \(|__handler\()(.*?)\);/g)) {
      const expr = m[1]
      if (!expr) continue
      const srcCol = src.indexOf(expr, srcCursor)
      if (srcCol < 0) continue // rewritten/normalized — no verbatim source span
      srcCursor = srcCol + expr.length
      const genCol = (m.index ?? 0) + m[0].indexOf(expr)
      mappings.push({
        sourceOffsets: [srcStarts[i] + srcCol],
        generatedOffsets: [genStarts[i] + genCol],
        lengths: [expr.length],
        data: FULL,
      })
    }
  }
  return mappings
}

export interface AihuVirtualCode extends VirtualCode {
  id: 'main'
  languageId: 'typescript'
}

function createVirtualCode(
  fileName: string,
  snapshot: ts.IScriptSnapshot,
  tsModule: typeof ts,
): AihuVirtualCode | undefined {
  const source = snapshot.getText(0, snapshot.getLength())
  let generated: string
  try {
    generated = compileSidecar(source, fileName)
  } catch {
    // The SFC does not compile. That is a COMPILE error, and `aihu build` /
    // `aihu dev` already report it with a real .aihu line and caret. Surfacing a
    // second, worse-worded copy of it here — or worse, a cascade of phantom type
    // errors from a half-generated surface — would only add noise, so this file
    // contributes nothing to type-check.
    return undefined
  }
  if (!generated.trim()) return undefined

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: tsModule.ScriptSnapshot.fromString(generated),
    mappings: buildMappings(source, generated),
  }
}

export function createAihuLanguagePlugin(
  tsModule: typeof ts,
): LanguagePlugin<string, AihuVirtualCode> {
  return {
    getLanguageId: (fileName) => (fileName.endsWith('.aihu') ? 'aihu' : undefined),

    createVirtualCode(fileName, languageId, snapshot) {
      if (languageId !== 'aihu') return undefined
      return createVirtualCode(fileName, snapshot, tsModule)
    },

    updateVirtualCode(fileName, _virtualCode, newSnapshot) {
      return createVirtualCode(fileName, newSnapshot, tsModule)
    },

    typescript: {
      extraFileExtensions: [
        { extension: 'aihu', isMixedContent: true, scriptKind: 7 satisfies ts.ScriptKind.Deferred },
      ],
      getServiceScript(root) {
        return { code: root, extension: '.ts', scriptKind: 3 satisfies ts.ScriptKind.TS }
      },
    },
  }
}
