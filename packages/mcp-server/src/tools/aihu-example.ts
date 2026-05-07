/**
 * aihu_example tool handler.
 *
 * Returns a cookbook SFC source by pattern name (filename without .aihu extension).
 * The cookbook index is read from disk at server startup.
 */

import { getCookbookIndex } from '../cookbook-index.js'

export interface ExampleInput {
  pattern: string
}

export interface ExampleOutput {
  source: string
  filename: string
}

export interface ExampleError {
  error: string
  available: string[]
}

export type ExampleResult = ExampleOutput | ExampleError

/**
 * Handle the aihu_example tool call.
 */
export function handleExample(input: ExampleInput): ExampleResult {
  const { pattern } = input
  const index = getCookbookIndex()

  const entry = index.get(pattern)
  if (!entry) {
    return {
      error: `unknown pattern: ${pattern}`,
      available: [...index.keys()].sort(),
    }
  }

  return {
    source: entry.source,
    filename: entry.filename,
  }
}
