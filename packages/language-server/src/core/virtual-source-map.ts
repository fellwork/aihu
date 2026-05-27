/**
 * packages/language-server/src/core/virtual-source-map.ts
 *
 * Bidirectional source-map helpers for the aihu Volar virtual-file layer.
 * Wraps @volar/source-map's SourceMap class with aihu-specific offset types
 * and null-on-miss semantics (callers fall back to HOVER_TABLE on null).
 *
 * See: .context/m2/a4/round-1/architect-brief-volar-refactor.md §3
 */

import type { CodeInformation } from '@volar/language-core'
import { type Mapping, SourceMap } from '@volar/source-map'

// Re-export for external consumers (tests, volar-plugin.ts)
export { SourceMap }

/** Alias for clarity: a Volar CodeMapping carrying CodeInformation data. */
export type AihuCodeMapping = Mapping<CodeInformation>

/**
 * An offset within a .aihu source file (character offset from start of file).
 */
export interface AihuSourcePosition {
  /** Character offset from the start of the .aihu source string. */
  offset: number
}

/**
 * An offset within a virtual __state__.ts file generated from the @state block.
 */
export interface AihuVirtualPosition {
  /** Character offset in the __state__.ts virtual file. */
  offset: number
}

/**
 * Map a virtual-file offset back to the original .aihu source offset.
 * Returns null when virtualOffset is not in any mapped range.
 *
 * Callers treat null as "no virtual-file mapping at this position" and fall
 * back to the static HOVER_TABLE lookup.
 */
export function mapToOriginal(
  virtualOffset: number,
  map: SourceMap<CodeInformation>,
): AihuSourcePosition | null {
  const result = map.toSourceLocation(virtualOffset).next()
  if (result.done) return null
  return { offset: result.value[0] }
}

/**
 * Map an original .aihu source offset to the virtual-file offset.
 * The _block parameter is reserved for M3 multi-block support; always '@state' in M2.
 * Returns null when no mapping exists for the given source offset.
 */
export function mapToVirtual(
  originalOffset: number,
  _block: '@state',
  map: SourceMap<CodeInformation>,
): AihuVirtualPosition | null {
  const result = map.toGeneratedLocation(originalOffset).next()
  if (result.done) return null
  return { offset: result.value[0] }
}
