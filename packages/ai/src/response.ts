/**
 * `fromResponse` — adapter from `fetch()` Response to `ReadableStream<string>`.
 *
 * v0.4.0: Per spec docs/specs/stream-impl.md §6.5.
 * No SDK dependency — uses only the Web Streams API.
 */

export function fromResponse(res: Response): ReadableStream<string> {
  if (!res.body) throw new TypeError('fromResponse: Response has no body')
  return res.body.pipeThrough(new TextDecoderStream())
}
