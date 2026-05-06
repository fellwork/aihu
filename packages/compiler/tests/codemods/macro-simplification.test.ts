/**
 * macro-simplification codemod (B6.2) — unit tests.
 *
 * Acceptance criteria (per round 006 director-note B6.2):
 *  1. 4 golden fixtures from `codemod-dryrun.md` §1.1-§1.4 — paired
 *     BEFORE / AFTER files. Each file's BEFORE input transforms to its
 *     AFTER expected output (modulo trailing-newline normalization).
 *  2. Idempotency — running the codemod on already-transformed v2 syntax
 *     produces an identical output (no-op). Critical for CI safety.
 *  3. Pattern-E PARSE-FAIL inputs — comma-list `$expose`, bare-name
 *     `$action`, named `$describe`. The codemod migrates them cleanly per
 *     spec §6.
 *  4. Round-trip on a small synthetic input.
 *
 * Anti-drift: tests exercise the codemod's JS implementation in
 * isolation; they do NOT require the Rust parser to be built.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { migrate } from '../../js/codemods/macro-simplification/migrate.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = resolve(__dirname, 'fixtures')

function readFixture(name: string): string {
  return readFileSync(resolve(FIXTURES_DIR, name), 'utf8')
}

/**
 * Normalize trailing newlines for comparison. The codemod always emits
 * exactly one trailing newline; the canonical AFTER fixtures sometimes
 * have an extra blank line at EOF (a stylistic choice, not load-bearing).
 */
function normTail(s: string): string {
  return s.replace(/\n+$/, '\n')
}

interface Fixture {
  /** Test name; matches dryrun §1.X label. */
  label: string
  /** Filename stem under fixtures/. */
  stem: string
}

/**
 * The 4 audited files from `codemod-dryrun.md` §1.1 / §1.2 / §1.3 / §1.4.
 * AFTERs reflect the macro-test.aihu collection-keyed shape (per
 * Director-3 §1.3 (I.2) — the dryrun's per-line shape was superseded
 * BEFORE round 006 build round opened).
 */
const FIXTURES: readonly Fixture[] = [
  { label: '§1.1 hacker-news/item/[id].aihu', stem: 'hn-item-id' },
  { label: '§1.2 todo-mvc.aihu (heavyweight + @agent)', stem: 'todo-mvc' },
  { label: '§1.3 blog-router/posts/[slug].aihu', stem: 'blog-router-slug' },
  { label: '§1.4 hacker-news/index.aihu (escalated)', stem: 'hn-index' },
]

describe('macro-simplification codemod — golden fixtures (codemod-dryrun §1.1-§1.4)', () => {
  for (const fx of FIXTURES) {
    it(`forward: transforms ${fx.label}`, () => {
      const input = readFixture(`${fx.stem}.input.aihu`)
      const expected = readFixture(`${fx.stem}.expected.aihu`)
      const { rewritten } = migrate(input)
      expect(normTail(rewritten)).toBe(normTail(expected))
    })

    it(`idempotent: re-running on AFTER produces AFTER for ${fx.label}`, () => {
      const expected = readFixture(`${fx.stem}.expected.aihu`)
      const { rewritten } = migrate(expected)
      // Running the codemod on already-transformed v2 syntax MUST be a no-op
      // (modulo trailing-newline normalization). This is the CI safety bar.
      expect(normTail(rewritten)).toBe(normTail(expected))
    })

    it(`forward preserves every named identifier from BEFORE in ${fx.label}`, () => {
      // AC bidirectional-forward: every state-side or agent-side name in
      // BEFORE must appear in AFTER. Per dryrun §1.X.4 forward checklists.
      const input = readFixture(`${fx.stem}.input.aihu`)
      const { rewritten } = migrate(input)
      const namesIn = extractIdentifiers(input)
      for (const name of namesIn) {
        expect(rewritten).toContain(name)
      }
    })
  }
})

describe('macro-simplification codemod — Pattern-E PARSE-FAIL inputs', () => {
  // Per `codemod-dryrun.md` §1.2 PC-1.2.C / PC-1.2.D / PC-1.2.E. These three
  // forms do NOT parse against the current Rust parser (`agent_macros.rs`)
  // but the codemod incidentally resolves them by emitting v2 collection
  // form. Per spec §6 hard-cut migration: codemod runs BEFORE parser change.

  const PARSE_FAIL_SOURCE = `@state {
  todos: Array<string> = []

  $action addTodo(t: string) {
    todos = [...todos, t]
  }

  $action clearAll() {
    todos = []
  }
}

@agent {
  $expose todos, remaining, filter

  $action addTodo
  $action clearAll

  $describe todos    "All todos"
  $describe addTodo  "Add a todo"
}
`

  it('migrates comma-list `$expose name1, name2, name3` (PC-1.2.C)', () => {
    const { rewritten } = migrate(PARSE_FAIL_SOURCE)
    // todos is a real @state name → folded into $prop entry with describe + expose
    expect(rewritten).toContain('todos:')
    expect(rewritten).toMatch(/describe:\s*'All todos'/)
    expect(rewritten).toMatch(/expose:\s*\{[^}]*read:\s*true/)
    // No comma-list `$expose` line survives in AFTER
    expect(rewritten).not.toMatch(/\$expose\s+\w+\s*,/)
  })

  it('migrates bare-name `$action <name>` in @agent (PC-1.2.D)', () => {
    const { rewritten } = migrate(PARSE_FAIL_SOURCE)
    // addTodo gains agent-callable expose: { read: true, write: true } and describe
    expect(rewritten).toMatch(/addTodo:\s*\{[\s\S]*?describe:\s*'Add a todo'/)
    expect(rewritten).toMatch(/addTodo:\s*\{[\s\S]*?write:\s*true/)
    // No bare `$action <name>` line survives
    expect(rewritten).not.toMatch(/^\s*\$action\s+\w+\s*$/m)
  })

  it('migrates named `$describe name "text"` form (PC-1.2.E)', () => {
    const { rewritten } = migrate(PARSE_FAIL_SOURCE)
    // describe text folded into the @state collection entry, no standalone
    // $describe line in AFTER.
    expect(rewritten).not.toMatch(/^\s*\$describe\s/m)
    expect(rewritten).toContain("'All todos'")
    expect(rewritten).toContain("'Add a todo'")
  })

  it('emits warning for stale @agent reference (no matching @state name)', () => {
    const { warnings } = migrate(PARSE_FAIL_SOURCE)
    // `remaining` and `filter` referenced in $expose but no @state decl.
    // Codemod emits warnings (does NOT fail) per Architect §4.4.2.
    expect(warnings.some((w) => w.includes('remaining'))).toBe(true)
    expect(warnings.some((w) => w.includes('filter'))).toBe(true)
  })

  it('PARSE-FAIL output is itself idempotent on re-run', () => {
    const r1 = migrate(PARSE_FAIL_SOURCE).rewritten
    const r2 = migrate(r1).rewritten
    expect(normTail(r2)).toBe(normTail(r1))
  })
})

describe('macro-simplification codemod — synthetic round-trip', () => {
  it('round-trips a minimal `$prop` + `$computed` v1 input', () => {
    const input = `@state {
  $prop hue: number = 215
  $computed primary = \`hsl(\${hue} 70% 55%)\`
}
`
    const { rewritten } = migrate(input)
    // Forward: collection-form for both macros.
    expect(rewritten).toMatch(/\$prop:\s*\{/)
    expect(rewritten).toContain('hue:')
    expect(rewritten).toContain('default: 215')
    expect(rewritten).toMatch(/\$computed:\s*\{/)
    expect(rewritten).toMatch(/primary:\s*\(\)\s*=>/)

    // Idempotent round-trip.
    const r2 = migrate(rewritten).rewritten
    expect(normTail(r2)).toBe(normTail(rewritten))
  })

  it('passes through anonymous `$effect` form in idempotent mode', () => {
    // Per spec §2.5: anonymous `$effect: () => {...}` is canonical v2 form.
    // Re-running the codemod on this form must be a no-op.
    const v2Source = `@state {
  todos: Array<string> = []

  $effect: () => {
    console.log(todos)
  }
}
`
    const r1 = migrate(v2Source).rewritten
    const r2 = migrate(r1).rewritten
    expect(normTail(r2)).toBe(normTail(r1))
    // Re-emission preserves the anonymous form (no synthesized name).
    expect(r1).toMatch(/\$effect:\s*\(\)\s*=>\s*\{/)
    expect(r1).not.toMatch(/\$effect:\s*\{\s*\w+:/) // no { name: ... }
  })

  it('preserves `$scope` and `$rate-limit` in @agent (vestigial block)', () => {
    const input = `@state {
  $action ping() { return true }
}

@agent {
  $scope "user:read"
  $rate-limit 100
}
`
    const { rewritten } = migrate(input)
    expect(rewritten).toContain('@agent {')
    expect(rewritten).toContain('$scope "user:read"')
    expect(rewritten).toContain('$rate-limit 100')
  })

  it('drops empty @agent block entirely after fold-out', () => {
    const input = `@state {
  todos: Array<string> = []

  $action addTodo() { todos = [] }
}

@agent {
  $expose todos
  $action addTodo
  $describe todos "the todos"
}
`
    const { rewritten } = migrate(input)
    // @agent had ONLY $expose/$action/$describe (all folded into @state) — gone.
    expect(rewritten).not.toContain('@agent')
    // The folded data lives on the @state entries.
    expect(rewritten).toContain("describe: 'the todos'")
  })
})

describe('macro-simplification codemod — formatter D.7 (inline / multi-line)', () => {
  // Per spec PC-1.1.C: the codemod tries inline first, falls back to multi-
  // line when keys > 3 OR post-indent line width > 100 chars.

  it('inline-emits a 1-key `$prop` entry within the 100-char budget', () => {
    const input = `@state {
  $prop count: number = 0
}
`
    const { rewritten } = migrate(input)
    // 1-key entry, ~36 chars on a 4-indent — must be inline.
    expect(rewritten).toMatch(/count:\s*\{\s*default:\s*0\s*\}/)
  })

  it('multi-line-emits a `$prop` entry that overflows the 100-char budget', () => {
    const input = `@state {
  todos: Array<{ id: string; text: string; done: boolean }> = []
}

@agent {
  $expose todos
  $describe todos "Array of todo items with id, text, done fields"
}
`
    const { rewritten } = migrate(input)
    // Long type literal + describe + expose pushes over 100 chars → multi-line.
    expect(rewritten).toMatch(/todos:\s*\{\s*\n/)
  })
})

/**
 * Extract every identifier that's bound by a `$prop`/`$computed`/`$action`/
 * `$resource`/`$effect` macro (v1 form), plus identifiers in `$expose`/
 * `$describe`/agent `$action` lines. Used by the bidirectional-forward
 * test to assert "every name in BEFORE appears in AFTER."
 */
function extractIdentifiers(source: string): Set<string> {
  const names = new Set<string>()
  const lines = source.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    // v1 state-side macros that bind a name
    const m1 =
      /^\$(?:prop|computed|action|resource|effect|effect\.on|watch|route)\s+([A-Za-z_$][\w$]*)/.exec(
        line,
      )
    if (m1) {
      names.add(m1[1]!)
      continue
    }
    // v1 agent-side macros: `$expose name1, name2, ...`, `$expose.write ...`
    const m2 = /^\$expose(?:\.write)?\s+(.+)$/.exec(line)
    if (m2) {
      for (const piece of m2[1]!.split(',')) {
        const id = piece.trim()
        if (/^[A-Za-z_$][\w$]*$/.test(id)) names.add(id)
      }
      continue
    }
    // v1 agent-side `$action <name>` (bare) or `$describe <name> "text"`
    const m3 = /^\$(?:action|describe)\s+([A-Za-z_$][\w$]*)/.exec(line)
    if (m3) {
      names.add(m3[1]!)
      continue
    }
    // Plain TS-typed declarations `name: Type = default`
    const m4 = /^([A-Za-z_$][\w$]*)\s*:[^=]*=/.exec(line)
    if (m4 && !line.startsWith('$') && !line.startsWith('//')) {
      names.add(m4[1]!)
    }
  }
  return names
}
