// Minimal ambient declarations for optional SDK peer dependencies.
// These stubs let TypeScript check the ai package without requiring callers
// to install the underlying SDKs. At runtime, callers supply real objects.

declare module '@anthropic-ai/sdk/resources/messages' {
  export type MessageStreamEvent = {
    type: string
    delta: { type: string; text: string }
  }
}

declare module '@google/generative-ai' {
  export interface GenerateContentStreamResult {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
}

declare module 'openai/resources' {
  export interface ChatCompletionChunk {
    choices: Array<{ delta: { content?: string | null } }>
  }
}
