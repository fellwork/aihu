/**
 * aihu_example tool handler.
 *
 * Returns a canonical .aihu SFC snippet from the cookbook that best matches
 * a given natural-language intent string using keyword overlap scoring.
 */

import { findBestMatch, getAllTags, getEntrySource } from '../cookbook.js'

export interface ExampleInput {
  intent: string
  tags?: string[]
}

export interface ExampleOutput {
  source: string
  filename: string
  description: string
  tags: string[]
}

export interface ExampleError {
  isError: true
  message: string
}

export type ExampleResult = ExampleOutput | ExampleError

/**
 * Handle the aihu_example tool call.
 * Returns ExampleOutput on success, ExampleError on no match.
 */
export function handleExample(input: ExampleInput): ExampleResult {
  const { intent, tags } = input

  const match = findBestMatch(intent, tags)

  if (match === null) {
    const availableTags = getAllTags().slice(0, 30).join(', ')
    return {
      isError: true,
      message: `No cookbook example matched intent: "${intent}". Available tags: ${availableTags}`,
    }
  }

  const source = getEntrySource(match.entry)

  return {
    source,
    filename: match.entry.filename,
    description: match.entry.description,
    tags: match.entry.tags,
  }
}
