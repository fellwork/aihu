/**
 * `fromOpenAI` — adapter from OpenAI SDK stream to `ReadableStream<string>`.
 *
 * Uses `import type` for all SDK types so missing peers don't cause runtime errors.
 * v0.4.0: Per spec docs/specs/stream-impl.md §6.2.
 */

import type { ChatCompletionChunk } from 'openai/resources'

export function fromOpenAI(stream: AsyncIterable<ChatCompletionChunk>): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(text)
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
