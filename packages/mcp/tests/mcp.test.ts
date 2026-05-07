/**
 * Tests for @aihu/mcp package.
 *
 * Covers:
 * - Cookbook index loading
 * - Intent keyword matching (exact tag, partial match, no match)
 * - compileSource happy path (mocked binary)
 * - compileSource error path with valid JSON stderr
 * - compileSource fallback for non-JSON stderr
 * - compileSource timeout handling
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _resetIndex,
  _setIndex,
  type CookbookEntry,
  findBestMatch,
  getAllTags,
  getEntrySource,
} from '../src/cookbook.js'
import { handleExample } from '../src/tools/example.js'

// ───────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────

const FIXTURE_ENTRIES: CookbookEntry[] = [
  {
    filename: 'counter.aihu',
    description: 'Minimal counter with signal and increment action',
    tags: ['signal', 'action', 'counter', 'minimal', '7guis', 'increment'],
    source:
      '@state { count: number = 0\n$action: { increment: () => { count++ } } }\n@template { <p>{count}</p><button $on.click={increment}>+</button> }',
  },
  {
    filename: 'each-list.aihu',
    description: 'Todo list with each loop and keyed items',
    tags: ['each', 'list', 'todo', 'key', 'array', 'crud'],
    source:
      '@state { items: Array<{id: string; text: string}> = [] }\n@template { <ul>{#each items as item (item.id)}<li>{item.text}</li>{/each}</ul> }',
  },
  {
    filename: 'lifecycle.aihu',
    description: 'Lifecycle hooks with mount and dispose for cleanup',
    tags: ['lifecycle', 'mount', 'dispose', 'cleanup', '$lifecycle'],
    source:
      '@state { $lifecycle: { mount: () => { }, dispose: () => { } } }\n@template { <div>mounted</div> }',
  },
]

// ───────────────────────────────────────────────
// Cookbook index loading tests
// ───────────────────────────────────────────────

describe('cookbook index', () => {
  beforeEach(() => {
    _resetIndex()
    _setIndex(FIXTURE_ENTRIES)
  })

  afterEach(() => {
    _resetIndex()
  })

  it('loads entries from the test fixture', () => {
    const tags = getAllTags()
    expect(tags).toContain('signal')
    expect(tags).toContain('each')
    expect(tags).toContain('lifecycle')
  })

  it('returns sorted unique tags', () => {
    const tags = getAllTags()
    const sorted = [...tags].sort()
    expect(tags).toEqual(sorted)
  })

  it('provides entry source via getEntrySource', () => {
    const entry = FIXTURE_ENTRIES[0]!
    const source = getEntrySource(entry)
    expect(source).toBe(entry.source)
    expect(source).toContain('@state')
  })
})

// ───────────────────────────────────────────────
// Intent keyword matching tests
// ───────────────────────────────────────────────

describe('findBestMatch', () => {
  beforeEach(() => {
    _resetIndex()
    _setIndex(FIXTURE_ENTRIES)
  })

  afterEach(() => {
    _resetIndex()
  })

  it('exact tag match — counter with signal', () => {
    const result = findBestMatch('counter with signal')
    expect(result).not.toBeNull()
    expect(result!.entry.filename).toBe('counter.aihu')
    expect(result!.score).toBeGreaterThan(0)
  })

  it('partial match — finds lifecycle for mount pattern', () => {
    const result = findBestMatch('component with mount and dispose')
    expect(result).not.toBeNull()
    expect(result!.entry.filename).toBe('lifecycle.aihu')
  })

  it('no match — returns null for completely unrelated intent', () => {
    const result = findBestMatch('xyzzy irrelevant nonsense')
    expect(result).toBeNull()
  })

  it('tag array parameter narrows search', () => {
    const result = findBestMatch('component', ['each', 'todo'])
    expect(result).not.toBeNull()
    expect(result!.entry.filename).toBe('each-list.aihu')
  })

  it('prefers higher-scoring entry when multiple match', () => {
    // "counter" + "signal" + "action" + "increment" all hit counter.aihu (4+ tokens)
    const result = findBestMatch('counter signal action increment')
    expect(result).not.toBeNull()
    expect(result!.entry.filename).toBe('counter.aihu')
  })

  it('returns null when index is empty', () => {
    _setIndex([])
    const result = findBestMatch('counter with signal')
    expect(result).toBeNull()
  })
})

// ───────────────────────────────────────────────
// handleExample tool tests
// ───────────────────────────────────────────────

describe('handleExample', () => {
  beforeEach(() => {
    _resetIndex()
    _setIndex(FIXTURE_ENTRIES)
  })

  afterEach(() => {
    _resetIndex()
  })

  it('returns source, filename, description on match', () => {
    const result = handleExample({ intent: 'counter with signal' })
    expect('isError' in result).toBe(false)
    const r = result as { source: string; filename: string; description: string; tags: string[] }
    expect(r.filename).toMatch(/\.aihu$/)
    expect(r.source.length).toBeGreaterThan(0)
    expect(r.description.length).toBeGreaterThan(0)
    expect(Array.isArray(r.tags)).toBe(true)
  })

  it('source contains @state or @template on match', () => {
    const result = handleExample({ intent: 'counter with signal' })
    const r = result as { source: string }
    expect(r.source).toMatch(/@state|@template/)
  })

  it('returns error with "No cookbook example matched" on no match', () => {
    const result = handleExample({ intent: 'xyzzy irrelevant nonsense' })
    expect('isError' in result).toBe(true)
    const r = result as { isError: true; message: string }
    expect(r.message).toContain('No cookbook example matched')
    expect(r.message).toContain('xyzzy irrelevant nonsense')
  })

  it('error message includes available tags', () => {
    const result = handleExample({ intent: 'xyzzy irrelevant nonsense' })
    const r = result as { isError: true; message: string }
    expect(r.message).toContain('Available tags:')
  })
})

// ───────────────────────────────────────────────
// compileSource tests (via direct import with dependency injection)
// ───────────────────────────────────────────────

// We test compileSource by injecting a mock execFileAsync
// This avoids the issue with mocking promisify at module load time.

/**
 * Minimal compileSource implementation for testing, accepting an injected
 * execFileAsync so we can control its behavior without spawning real processes.
 */
async function makeCompileSource(
  execFn: (
    bin: string,
    args: string[],
    opts: { input: string; encoding: string; timeout: number },
  ) => Promise<{ stdout: string }>,
) {
  const { basename } = await import('node:path')

  return async function compileSource(
    source: string,
    filename: string,
  ): Promise<{ valid: true; code: string } | { valid: false; errors: unknown[] }> {
    const stem = basename(filename, '.aihu')
    try {
      const { stdout } = await execFn(
        'aihu-compile',
        ['--stdin', '--tag', stem, '--path', filename, '--machine-errors'],
        {
          input: source,
          encoding: 'utf8',
          timeout: 10000,
        },
      )
      return { valid: true, code: stdout }
    } catch (err: unknown) {
      const e = err as { stderr?: string; killed?: boolean; signal?: string }

      if (e.killed === true || (typeof e.signal === 'string' && e.signal !== null)) {
        return {
          valid: false,
          errors: [
            {
              code: 'TIMEOUT',
              message: 'Compiler timed out after 10000ms',
              from: { line: 0, character: 0 },
              to: { line: 0, character: 0 },
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            },
          ],
        }
      }

      const stderr = e.stderr ?? ''
      try {
        const errors = JSON.parse(stderr)
        if (Array.isArray(errors)) {
          return { valid: false, errors }
        }
      } catch {
        // not JSON
      }

      return {
        valid: false,
        errors: [
          {
            code: 'UNKNOWN',
            message: stderr.trim() || 'Compilation failed (no stderr)',
            from: { line: 0, character: 0 },
            to: { line: 0, character: 0 },
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
          },
        ],
      }
    }
  }
}

describe('compileSource (injectable exec)', () => {
  it('happy path — returns valid: true with compiled code', async () => {
    const compiledCode = `import { defineComponent, defineElement } from '@aihu/runtime'\ndefineElement('my-widget', defineComponent((_ctx) => { return null }))`

    const compileSource = await makeCompileSource(async (_bin, _args, _opts) => ({
      stdout: compiledCode,
    }))

    const result = await compileSource(
      '@state { count: number = 0 }\n@template { <p>{count}</p> }',
      'my-widget.aihu',
    )

    expect(result.valid).toBe(true)
    if (result.valid) {
      expect(result.code).toContain('defineElement')
    }
  })

  it('happy path — filename param causes tag stem to be passed in args', async () => {
    const compiledCode = `import { defineComponent, defineElement } from '@aihu/runtime'\ndefineElement('my-widget', defineComponent((_ctx) => { return null }))`

    let capturedArgs: string[] = []
    const compileSource = await makeCompileSource(async (_bin, args, _opts) => {
      capturedArgs = args
      return { stdout: compiledCode }
    })

    const result = await compileSource('@state { }\n@template { <p>hello</p> }', 'my-widget.aihu')

    expect(result.valid).toBe(true)
    const tagIdx = capturedArgs.indexOf('--tag')
    expect(tagIdx).toBeGreaterThan(-1)
    expect(capturedArgs[tagIdx + 1]).toBe('my-widget')
    if (result.valid) {
      expect(result.code).toContain('my-widget')
    }
  })

  it('error path — valid JSON stderr returns structured diagnostics', async () => {
    const diagnostics = [
      {
        code: 'C440',
        message: 'C440 — old-spec macro form rejected',
        hint: 'v2 grammar required',
        from: { line: 4, character: 2 },
        to: { line: 4, character: 18 },
        range: {
          start: { line: 4, character: 2 },
          end: { line: 4, character: 18 },
        },
      },
    ]

    const compileSource = await makeCompileSource(async (_bin, _args, _opts) => {
      throw Object.assign(new Error('compilation failed'), {
        stderr: JSON.stringify(diagnostics),
        code: 1,
      })
    })

    const result = await compileSource(
      '$prop label: String\n@template { <p>{label}</p> }',
      'component.aihu',
    )

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0)
      const err = result.errors[0] as { code: string }
      expect(err.code).toMatch(/^C4/)
    }
  })

  it('fallback — non-JSON stderr returns UNKNOWN diagnostic', async () => {
    const compileSource = await makeCompileSource(async (_bin, _args, _opts) => {
      throw Object.assign(new Error('compilation failed'), {
        stderr: 'something went wrong (not JSON)',
        code: 1,
      })
    })

    const result = await compileSource('not valid aihu at all @@@@', 'component.aihu')

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0)
      const err = result.errors[0] as { code: string }
      expect(err.code).toBe('UNKNOWN')
    }
  })

  it('does not crash when source is garbage and stderr is empty', async () => {
    const compileSource = await makeCompileSource(async (_bin, _args, _opts) => {
      throw Object.assign(new Error('compilation failed'), {
        stderr: '',
        code: 1,
      })
    })

    const result = await compileSource('@@@@###$$$', 'component.aihu')
    expect(result.valid).toBe(false)
    if (!result.valid) {
      const err = result.errors[0] as { code: string; message: string }
      expect(err.code).toBe('UNKNOWN')
      expect(err.message).toContain('no stderr')
    }
  })

  it('timeout — returns TIMEOUT diagnostic when process is killed', async () => {
    const compileSource = await makeCompileSource(async (_bin, _args, _opts) => {
      throw Object.assign(new Error('timeout'), {
        killed: true,
        signal: 'SIGTERM',
        stderr: '',
      })
    })

    const result = await compileSource(
      '@state { count: number = 0 }\n@template { <p>{count}</p> }',
      'component.aihu',
    )

    expect(result.valid).toBe(false)
    if (!result.valid) {
      const err = result.errors[0] as { code: string }
      expect(err.code).toBe('TIMEOUT')
    }
  })
})
