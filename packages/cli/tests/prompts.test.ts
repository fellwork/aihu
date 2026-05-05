import { PassThrough, type Readable, Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { promptSelect, promptText, promptYesNo } from '../src/prompts.ts'

// ─── Helpers: build mock streams driven from a script of input chunks ────────

interface MockStreams {
  input: Readable
  output: Writable
  written: string[]
}

/**
 * Build mock stdin/stdout pair. The input PassThrough emits each line as
 * the matching prompt is rendered to output: we wait for the prompt to
 * appear on output before pushing the next line. This avoids the
 * race where readline buffers all lines up front and the second
 * `rl.question` returns the queued line without re-prompting.
 */
function mockStreams(inputLines: ReadonlyArray<string>): MockStreams {
  const input = new PassThrough()
  const written: string[] = []
  let lineIdx = 0

  const pushNext = (): void => {
    if (lineIdx < inputLines.length) {
      const line = inputLines[lineIdx]!
      lineIdx++
      // microtask delay so readline's `question` callback installs first
      queueMicrotask(() => {
        input.write(`${line}\n`)
      })
    }
  }

  const output = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      written.push(s)
      // Each `rl.question` writes its prompt synchronously; we treat any
      // write that ends with ': ' or '? ' or '] ' as a fresh prompt cue
      // and feed the next line. This pacing avoids burst-buffering all
      // inputs up front (which short-circuits the re-prompt loop).
      if (/[:?\]] $/.test(s)) {
        pushNext()
      }
      cb()
    },
  })

  return { input, output, written }
}

describe('promptText', () => {
  it('returns trimmed user input', async () => {
    const m = mockStreams(['  hello world  '])
    const v = await promptText({
      message: 'Name',
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('hello world')
  })

  it('returns the default when user just hits enter', async () => {
    const m = mockStreams([''])
    const v = await promptText({
      message: 'Name',
      default: 'my-aihu-app',
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('my-aihu-app')
  })

  it('re-prompts on validate failure then accepts the corrected value', async () => {
    const m = mockStreams(['9bad', 'good-name'])
    const v = await promptText({
      message: 'Name',
      validate: (s) => (/^[a-z]/.test(s) ? null : 'Must start with a letter'),
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('good-name')
    expect(m.written.join('')).toContain('Must start with a letter')
  })

  it('errors clearly in non-TTY mode', async () => {
    const m = mockStreams([])
    await expect(
      promptText({
        message: 'Name',
        streams: { input: m.input, output: m.output, isTTY: false },
      }),
    ).rejects.toThrow(/non-TTY/)
  })
})

describe('promptSelect', () => {
  const choices = [
    { value: 'cf-team', label: 'Cloudflare team' },
    { value: 'vercel-team', label: 'Vercel team' },
    { value: 'fly-team', label: 'Fly team' },
  ] as const

  it('returns the value at the typed number (1-indexed)', async () => {
    const m = mockStreams(['2'])
    const v = await promptSelect({
      message: 'Pick',
      choices,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('vercel-team')
  })

  it('returns the default when user just hits enter', async () => {
    const m = mockStreams([''])
    const v = await promptSelect({
      message: 'Pick',
      choices,
      defaultIndex: 0,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('cf-team')
  })

  it('re-prompts on out-of-range input', async () => {
    const m = mockStreams(['99', '3'])
    const v = await promptSelect({
      message: 'Pick',
      choices,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('fly-team')
    expect(m.written.join('')).toMatch(/between 1 and 3/)
  })

  it('re-prompts on non-numeric input', async () => {
    const m = mockStreams(['banana', '1'])
    const v = await promptSelect({
      message: 'Pick',
      choices,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe('cf-team')
  })

  it('renders all choices in the output', async () => {
    const m = mockStreams(['1'])
    await promptSelect({
      message: 'Pick',
      choices,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    const out = m.written.join('')
    expect(out).toContain('1) Cloudflare team')
    expect(out).toContain('2) Vercel team')
    expect(out).toContain('3) Fly team')
  })

  it('errors on empty choices', async () => {
    const m = mockStreams([])
    await expect(
      promptSelect({
        message: 'Pick',
        choices: [],
        streams: { input: m.input, output: m.output, isTTY: true },
      }),
    ).rejects.toThrow(/non-empty/)
  })

  it('errors clearly in non-TTY mode', async () => {
    const m = mockStreams([])
    await expect(
      promptSelect({
        message: 'Pick',
        choices,
        streams: { input: m.input, output: m.output, isTTY: false },
      }),
    ).rejects.toThrow(/non-TTY/)
  })
})

describe('promptYesNo', () => {
  it('returns true on "y"', async () => {
    const m = mockStreams(['y'])
    const v = await promptYesNo({
      message: 'OK?',
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe(true)
  })

  it('returns false on "n"', async () => {
    const m = mockStreams(['n'])
    const v = await promptYesNo({
      message: 'OK?',
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe(false)
  })

  it('returns the default (true) on empty input', async () => {
    const m = mockStreams([''])
    const v = await promptYesNo({
      message: 'OK?',
      default: true,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe(true)
  })

  it('returns the default (false) on empty input', async () => {
    const m = mockStreams([''])
    const v = await promptYesNo({
      message: 'OK?',
      default: false,
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe(false)
  })

  it('re-prompts on garbage input', async () => {
    const m = mockStreams(['maybe', 'YES'])
    const v = await promptYesNo({
      message: 'OK?',
      streams: { input: m.input, output: m.output, isTTY: true },
    })
    expect(v).toBe(true)
    expect(m.written.join('')).toMatch(/Please answer y or n/)
  })

  it('errors clearly in non-TTY mode', async () => {
    const m = mockStreams([])
    await expect(
      promptYesNo({
        message: 'OK?',
        streams: { input: m.input, output: m.output, isTTY: false },
      }),
    ).rejects.toThrow(/non-TTY/)
  })
})
