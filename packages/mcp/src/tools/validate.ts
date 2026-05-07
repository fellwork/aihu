/**
 * aihu_validate tool handler.
 *
 * Compiles a .aihu source string using the aihu Rust compiler and returns
 * either compiled TypeScript output (on success) or structured diagnostics
 * (on error), with errors and warnings separated.
 */

import type { AihuDiagnostic, ValidateResult } from '../compiler.js'
import { compileSource } from '../compiler.js'

export interface ValidateInput {
  source: string
  filename?: string
}

export type { AihuDiagnostic, ValidateResult }

/**
 * Handle the aihu_validate tool call.
 */
export function handleValidate(input: ValidateInput): ValidateResult {
  const { source, filename = 'component.aihu' } = input
  return compileSource(source, filename)
}
