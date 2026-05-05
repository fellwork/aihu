/**
 * @aihu/cli/prompts — hand-rolled interactive prompts on top of `node:readline`.
 *
 * Per arch-6 §3.4 (Q2 RESOLVED): zero deps. The current dep-free thesis from
 * `create.ts` is preserved. Pattern matches `create-vite`'s in-tree `prompts`
 * clone — number-list fallback for non-arrow-key shells, single source of truth
 * here for tests.
 *
 * Non-TTY behavior: each prompt errors with a clear message asking the caller
 * to use `--no-interactive` instead. The CLI dispatcher checks this up front;
 * these functions only fire on the interactive path.
 *
 * Streams are injectable for testing (no real TTY required).
 */

import { createInterface, type Interface } from 'node:readline'
import type { Readable, Writable } from 'node:stream'

// ─── Stream injection ────────────────────────────────────────────────────────

export interface PromptStreams {
  input: Readable
  output: Writable
  /**
   * Whether the input stream is a TTY. Defaults to `process.stdin.isTTY`.
   * Tests pass `true` so the prompt code path runs against mock streams.
   */
  isTTY?: boolean
}

function defaultStreams(): Required<PromptStreams> {
  return {
    input: process.stdin,
    output: process.stdout,
    isTTY: process.stdin.isTTY === true,
  }
}

function assertTTY(streams: Required<PromptStreams>): void {
  if (!streams.isTTY) {
    throw new Error(
      'Cannot prompt in a non-TTY shell. Pass --no-interactive with --use-defaults or --options-json instead.',
    )
  }
}

function makeRL(streams: Required<PromptStreams>): Interface {
  return createInterface({ input: streams.input, output: streams.output, terminal: false })
}

function ask(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer)
    })
  })
}

// ─── promptText ──────────────────────────────────────────────────────────────

export interface PromptTextOptions {
  message: string
  default?: string
  /** Optional validator. Return error string to re-prompt; return null to accept. */
  validate?: (input: string) => string | null
  streams?: PromptStreams
}

export async function promptText(opts: PromptTextOptions): Promise<string> {
  const streams: Required<PromptStreams> = { ...defaultStreams(), ...opts.streams }
  assertTTY(streams)
  const rl = makeRL(streams)
  try {
    const suffix = opts.default !== undefined ? ` (${opts.default})` : ''
    const prompt = `${opts.message}${suffix}: `
    while (true) {
      const raw = await ask(rl, prompt)
      const trimmed = raw.trim()
      const value = trimmed === '' && opts.default !== undefined ? opts.default : trimmed
      if (opts.validate) {
        const err = opts.validate(value)
        if (err !== null) {
          streams.output.write(`  ${err}\n`)
          continue
        }
      }
      return value
    }
  } finally {
    rl.close()
  }
}

// ─── promptSelect ────────────────────────────────────────────────────────────

export interface SelectChoice<T> {
  value: T
  label: string
  description?: string
}

export interface PromptSelectOptions<T> {
  message: string
  choices: ReadonlyArray<SelectChoice<T>>
  /** Index of the default choice (defaults to 0). */
  defaultIndex?: number
  streams?: PromptStreams
}

/**
 * Number-fallback select: prints a numbered list, user types the number.
 * Empty input picks the default. Out-of-range or non-numeric input re-prompts.
 *
 * Arrow-key TTY UI is intentionally deferred — the number list is the
 * always-available alternative for non-TTY shells (arch-6 §3.4) and is
 * also the simplest baseline to test against mocked streams.
 */
export async function promptSelect<T>(opts: PromptSelectOptions<T>): Promise<T> {
  const streams: Required<PromptStreams> = { ...defaultStreams(), ...opts.streams }
  assertTTY(streams)
  if (opts.choices.length === 0) {
    throw new Error('promptSelect: choices must be non-empty')
  }
  const defaultIndex = opts.defaultIndex ?? 0
  if (defaultIndex < 0 || defaultIndex >= opts.choices.length) {
    throw new Error(`promptSelect: defaultIndex ${defaultIndex} out of range`)
  }

  streams.output.write(`${opts.message}\n`)
  for (let i = 0; i < opts.choices.length; i++) {
    const c = opts.choices[i]!
    const tag = i === defaultIndex ? ' (default)' : ''
    const desc = c.description !== undefined ? `  ${c.description}` : ''
    streams.output.write(`  ${i + 1}) ${c.label}${tag}${desc}\n`)
  }

  const rl = makeRL(streams)
  try {
    while (true) {
      const raw = await ask(rl, `Enter 1-${opts.choices.length} (default ${defaultIndex + 1}): `)
      const trimmed = raw.trim()
      if (trimmed === '') {
        return opts.choices[defaultIndex]!.value
      }
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 1 || n > opts.choices.length) {
        streams.output.write(`  Pick a number between 1 and ${opts.choices.length}.\n`)
        continue
      }
      return opts.choices[n - 1]!.value
    }
  } finally {
    rl.close()
  }
}

// ─── promptYesNo ─────────────────────────────────────────────────────────────

export interface PromptYesNoOptions {
  message: string
  default?: boolean
  streams?: PromptStreams
}

export async function promptYesNo(opts: PromptYesNoOptions): Promise<boolean> {
  const streams: Required<PromptStreams> = { ...defaultStreams(), ...opts.streams }
  assertTTY(streams)
  const def = opts.default ?? true
  const hint = def ? '[Y/n]' : '[y/N]'
  const rl = makeRL(streams)
  try {
    while (true) {
      const raw = await ask(rl, `${opts.message} ${hint} `)
      const trimmed = raw.trim().toLowerCase()
      if (trimmed === '') return def
      if (trimmed === 'y' || trimmed === 'yes') return true
      if (trimmed === 'n' || trimmed === 'no') return false
      streams.output.write('  Please answer y or n.\n')
    }
  } finally {
    rl.close()
  }
}
