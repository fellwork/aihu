/**
 * `fromAnthropic` — adapter from Anthropic SDK stream to `ReadableStream<string>`.
 *
 * Uses `import type` for all SDK types so missing peers don't cause runtime errors.
 * v0.4.0: Per spec docs/specs/stream-impl.md §6.3.
 */

import type { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages'

export function fromAnthropic(stream: AsyncIterable<MessageStreamEvent>): ReadableStream<string> {
  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const text = event.delta.text
            if (text) controller.enqueue(text)
          }
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
}
