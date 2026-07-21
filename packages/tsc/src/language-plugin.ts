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
 *
 * ## #485 steps 1–3 — rewritten expressions and structural statements
 *
 * The generator now REWRITES lifted expressions (bare signal reads become
 * `__aihu_ctx.<name>` value-view accesses) and emits structural statements
 * (`if (COND) {`, `} else if (COND) {`, `const __each_N = __aihu_each(LIST);
 * for (const [BINDERS] of __each_N) {`). The per-line matcher therefore maps
 * each payload in three attempts:
 *
 *   1. exact substring (no rewrite happened);
 *   2. the payload with `__aihu_ctx.` prefixes stripped — the rewrite only
 *      inserts that prefix, so stripping recovers the authored text; the
 *      generated/source spans differ in length, carried via
 *      `generatedLengths`;
 *   3. the whole trimmed source-line body — coarse, but a diagnostic still
 *      lands on the authored line instead of being dropped as unmapped.
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
    const srcStart = srcStarts[i]
    const genStart = genStarts[i]
    if (!gen || !src || srcStart === undefined || genStart === undefined) continue

    // Verbatim @state line — identical text, so the whole line maps by identity.
    if (gen === src) {
      mappings.push({
        sourceOffsets: [srcStart],
        generatedOffsets: [genStart],
        lengths: [src.length],
        data: FULL,
      })
      continue
    }

    // A @state line the compiler rewrote but did not move: a bare typed
    // declaration (`count: number = 0`) is lowered to `let count: number = 0`, so
    // the source text survives INSIDE the generated line at a shifted column. Map
    // that span, or the `let ` prefix would silently cost the line its mapping —
    // and an unmapped line is a line whose diagnostics are dropped on the floor.
    const body = src.trim()
    if (body) {
      const at = gen.indexOf(body)
      if (at >= 0) {
        mappings.push({
          sourceOffsets: [srcStart + src.indexOf(body)],
          generatedOffsets: [genStart + at],
          lengths: [body.length],
          data: FULL,
        })
        continue
      }
    }

    // A lifted template statement. Payload spans: `void (EXPR);`,
    // `__handler(EXPR);`, `if (COND) {` / `} else if (COND) {` heads, and
    // `__aihu_each(LIST)` loop heads. Several can share a line; walk both
    // cursors forward so repeats of the same text map to successive
    // occurrences rather than all to the first.
    let srcCursor = 0
    const payloads: { expr: string; genCol: number }[] = []
    // Lifted expression statements — `void (EXPR);` / `__handler(EXPR);`.
    for (const m of gen.matchAll(/(?:void \(|__handler\()(.*?)\);/g)) {
      if (m[1]) payloads.push({ expr: m[1], genCol: (m.index ?? 0) + m[0].indexOf(m[1]) })
    }
    // Real branch heads — `if (COND) {` / `} else if (COND) {`.
    for (const m of gen.matchAll(/\bif \((.*?)\) \{/g)) {
      if (m[1]) payloads.push({ expr: m[1], genCol: (m.index ?? 0) + m[0].indexOf(m[1]) })
    }
    // Loop heads — `const __each_N = __aihu_each(LIST); for (…)`.
    for (const m of gen.matchAll(/__aihu_each\((.*?)\);/g)) {
      if (m[1]) payloads.push({ expr: m[1], genCol: (m.index ?? 0) + m[0].indexOf(m[1]) })
    }
    payloads.sort((a, b) => a.genCol - b.genCol)
    for (const { expr, genCol } of payloads) {
      // 1. Verbatim — the capture was not rewritten.
      const direct = src.indexOf(expr, srcCursor)
      if (direct >= 0) {
        srcCursor = direct + expr.length
        mappings.push({
          sourceOffsets: [srcStart + direct],
          generatedOffsets: [genStart + genCol],
          lengths: [expr.length],
          data: FULL,
        })
        continue
      }

      // 2. De-rewritten — strip the value-view prefix the step-1 rewrite
      // inserted and search for the authored text. Span lengths differ, so
      // the generated length rides `generatedLengths`.
      const stripped = expr.replaceAll('__aihu_ctx.', '')
      if (stripped !== expr) {
        const at = src.indexOf(stripped, srcCursor)
        if (at >= 0) {
          srcCursor = at + stripped.length
          mappings.push({
            sourceOffsets: [srcStart + at],
            generatedOffsets: [genStart + genCol],
            lengths: [stripped.length],
            generatedLengths: [expr.length],
            data: FULL,
          })
          continue
        }
      }

      // 3. Whole-line fallback — coarse, but the diagnostic still cites the
      // authored line instead of being dropped as unmapped.
      const bodyText = src.trim()
      if (bodyText) {
        mappings.push({
          sourceOffsets: [srcStart + src.indexOf(bodyText)],
          generatedOffsets: [genStart + genCol],
          lengths: [bodyText.length],
          generatedLengths: [expr.length],
          data: FULL,
        })
      }
    }
  }
  return mappings
}

export interface AihuVirtualCode extends VirtualCode {
  id: 'main'
  languageId: 'typescript'
}

/**
 * Files whose SFC does not compile, so there is no surface to type-check.
 *
 * They must be NAMED, not silently skipped: a pass over a file the compiler
 * refused to read is a false green. `run()` reports them and fails the run.
 */
const uncompilable = new Set<string>()

export function getUncompilableFiles(): ReadonlySet<string> {
  return uncompilable
}

function createVirtualCode(
  fileName: string,
  snapshot: ts.IScriptSnapshot,
  tsModule: typeof ts,
): AihuVirtualCode {
  const source = snapshot.getText(0, snapshot.getLength())
  let generated: string
  try {
    generated = compileSidecar(source, fileName)
    uncompilable.delete(fileName)
  } catch {
    // The SFC does not compile — a COMPILE error, which `aihu build` already
    // reports with a real .aihu line and caret. Repeating it here, worse worded,
    // would only add noise.
    //
    // But we must still hand TypeScript SOMETHING. Returning nothing leaves it to
    // parse the raw `.aihu` text as TypeScript, which buries the real problem
    // under a landslide of nonsense — `TS1146: Declaration expected` pointing at
    // `@state {`. An empty surface contributes no diagnostics; the file is named
    // in the summary instead.
    uncompilable.add(fileName)
    generated = ''
  }

  return {
    id: 'main',
    languageId: 'typescript',
    snapshot: tsModule.ScriptSnapshot.fromString(generated),
    mappings: generated ? buildMappings(source, generated) : [],
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
