/**
 * `fromGemini` — adapter from Google Generative AI SDK stream to `ReadableStream<string>`.
 *
 * Uses `import type` for all SDK types so missing peers don't cause runtime errors.
 * v0.4.0: Per spec docs/specs/stream-impl.md §6.4.
 */

import type { GenerateContentStreamResult } from '@google/generative-ai'

export function fromGemini(
  stream: AsyncIterable<GenerateContentStreamResult>,
): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
          if (text) controller.enqueue(text)
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
