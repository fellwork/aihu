/**
 * `@aihu/ai` — thin adapters from AI SDK stream types to `ReadableStream<string>`.
 *
 * v0.4.0: Server/build-time only. No browser bundle. No @aihu/* dependencies.
 * Per spec docs/superpowers/specs/stream-impl.md §6.
 */

export { fromAnthropic } from './anthropic.ts'
export { fromGemini } from './gemini.ts'
export { fromOpenAI } from './openai.ts'
export { fromResponse } from './response.ts'
