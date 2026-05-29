/**
 * @aihu/plugin-demo — shared types.
 */

/**
 * Options for the demo plugin and its associated factories.
 * All fields optional — the demo is deliberately trivial.
 */
export interface DemoOptions {
  /**
   * Greeting name used by the $greeting macro lowering declaration.
   * Defaults to 'World'.
   */
  readonly greetingName?: string
}

/**
 * Shape returned by `createDemoRuntime()`.
 * Exposes a reactive counter backed by `@aihu/signals`.
 */
export interface DemoResource {
  /** Read the current count. */
  readonly count: () => number
  /** Increment the count by 1. */
  readonly increment: () => void
}
