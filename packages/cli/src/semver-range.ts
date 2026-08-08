/**
 * @aihu/cli/semver-range — the minimum semver-range check the CLI needs.
 *
 * WHY NOT `npm:semver`. `@aihu/cli` ships with exactly one runtime dependency
 * (`@aihu/mcp`, itself in-tree). Every other module here is hand-rolled against
 * Node builtins on purpose — a scaffolder that pulls a transitive dependency
 * tree in order to *check a version string* is the wrong trade for the one
 * comparison this package performs (a template manifest's `cliRange` against
 * the running CLI's own version). No package in this monorepo depends on
 * `semver` today, so adding it would introduce the dependency, not reuse one.
 *
 * WHAT IS SUPPORTED. The npm range grammar a `template.config.ts` realistically
 * writes:
 *
 *   *  |  x  |  (empty)          any version
 *   1.2.3                        exact
 *   =1.2.3  >1.2.3  >=1.2.3  <1.2.3  <=1.2.3
 *   ^1.2.3  ~1.2.3              caret / tilde, incl. the 0.x caret rules
 *   1  |  1.2  |  1.x  |  1.2.x  partial + wildcard forms
 *   >=1.0.0 <2.0.0               space-separated comparators (AND)
 *   ^1 || ^2                     `||`-separated comparator sets (OR)
 *   >= 1.0.0  |  v1.2.3          space after the operator, `v` prefix
 *
 * PARTIAL BOUNDS follow npm's X-range promotion, which is NOT "fill the
 * wildcards with zero" — that is only true for `>=` and `<`:
 *
 *   >1  → >=2.0.0     >1.2  → >=1.3.0      (step past the range named)
 *   <=1 → <2.0.0-0    <=1.2 → <1.3.0-0
 *   >=1 → >=1.0.0     >=1.2 → >=1.2.0      (zero-fill)
 *   <1  → <1.0.0-0    <1.2  → <1.2.0-0
 *   >*  | <x          nothing is allowed, not everything
 *
 * This module got `>` and `<=` wrong in both directions for three releases.
 * The `>` half was fail-OPEN — `satisfiesRange('1.5.0', '>1')` returned true
 * where npm returns false — which is the worst direction for the one thing
 * this module is used for: `assertTemplateCompatibility` waving through a
 * CLI/template pairing npm calls incompatible.
 *
 * WHAT IS NOT. Hyphen ranges (`1.2.3 - 2.3.4`) and build metadata are not
 * implemented. Anything unparseable THROWS rather than defaulting to
 * "satisfied" — a template that declares a range this cannot read is a broken
 * template, and the whole point of enforcing `cliRange` is that an
 * unenforceable declaration must not pass silently. The corollary bit at the
 * other end: throwing on syntax npm DOES accept is not "safe", it blocks a
 * scaffold that should work, which is why the `v`-prefix and spaced-operator
 * forms above are tolerated rather than rejected.
 *
 * Prerelease handling follows the npm rule, not naive ordering: `1.0.0-beta.1`
 * is ordered below `1.0.0`, but a prerelease version only satisfies a range
 * when some comparator in the matching set pins the same `major.minor.patch`
 * AND itself carries a prerelease tag. Without that rule `^1.0.0` would match
 * `2.0.0-beta.1` (which sorts below `2.0.0`), i.e. a template pinned to CLI 1.x
 * would silently accept a 2.0 prerelease.
 */

// ─── Version parsing + ordering ──────────────────────────────────────────────

export interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  /** Dot-separated prerelease identifiers; empty for a release version. */
  readonly pre: ReadonlyArray<string>
}

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Parse a full `X.Y.Z[-pre][+build]` version. Returns `undefined` if invalid. */
export function parseVersion(raw: string): ParsedVersion | undefined {
  const m = VERSION_RE.exec(raw.trim())
  if (!m) return undefined
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] !== undefined && m[4] !== '' ? m[4].split('.') : [],
  }
}

function comparePre(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
  // A release outranks any prerelease of the same X.Y.Z.
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const x = a[i]
    const y = b[i]
    // A shorter identifier set sorts lower when it is a prefix of the longer.
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = /^\d+$/.test(x)
    const yNum = /^\d+$/.test(y)
    if (xNum && yNum) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d < 0 ? -1 : 1
      continue
    }
    // Numeric identifiers always sort lower than alphanumeric ones.
    if (xNum !== yNum) return xNum ? -1 : 1
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** Standard semver ordering: -1 / 0 / 1. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  return comparePre(a.pre, b.pre)
}

// ─── Range parsing ───────────────────────────────────────────────────────────

type Op = '<' | '<=' | '>' | '>=' | '='

interface Comparator {
  readonly op: Op
  readonly version: ParsedVersion
}

const ANY: ReadonlyArray<Comparator> = []

function isWildcard(part: string | undefined): boolean {
  return part === undefined || part === '' || part === 'x' || part === 'X' || part === '*'
}

/** Split `1.2.3-beta` into its numeric parts + prerelease, tolerating partials. */
function splitPartial(raw: string): {
  parts: Array<string | undefined>
  pre: ReadonlyArray<string>
} {
  const dash = raw.indexOf('-')
  const core = dash === -1 ? raw : raw.slice(0, dash)
  const preRaw = dash === -1 ? '' : raw.slice(dash + 1)
  return {
    parts: core.split('.'),
    pre: preRaw === '' ? [] : preRaw.split('.'),
  }
}

function at(parts: ReadonlyArray<string | undefined>, i: number): number {
  const p = parts[i]
  if (isWildcard(p)) return 0
  const n = Number(p)
  if (!Number.isInteger(n) || n < 0) throw new Error(`invalid version part ${JSON.stringify(p)}`)
  return n
}

function version(major: number, minor: number, patch: number, pre: ReadonlyArray<string> = []) {
  return { major, minor, patch, pre }
}

/**
 * A comparator nothing can satisfy — node-semver's `<0.0.0-0`, which is what
 * `replaceXRange` emits for `>*` / `<x` ("nothing is allowed"). `0.0.0-0` is
 * the lowest version that exists, so no version sorts below it.
 */
const NOTHING: ReadonlyArray<Comparator> = [
  { op: '<', version: { major: 0, minor: 0, patch: 0, pre: ['0'] } },
]

/**
 * Expand one whitespace-free range atom into comparators.
 * Returns `undefined` for the "matches anything" atom.
 */
function expandAtom(atom: string): ReadonlyArray<Comparator> | undefined {
  if (atom === '' || atom === '*' || atom === 'x' || atom === 'X') return undefined

  const opMatch = /^(<=|>=|<|>|=|\^|~)\s*(.+)$/.exec(atom)
  const operator = opMatch ? opMatch[1]! : ''
  // A leading `v` is part of the grammar npm accepts (`v1.2.3`, `=v1.2.3`,
  // `^v1.2.0`) and every one of them used to reach `at()` as the un-numeric
  // part `'v1'` and THROW — which `assertTemplateCompatibility` reports as
  // "declares an unusable cliRange", blocking a scaffold whose range was fine.
  const body = (opMatch ? opMatch[2]! : atom).replace(/^[vV](?=[\dxX*])/, '')

  const { parts, pre } = splitPartial(body)
  if (parts.length === 0 || parts.length > 3) {
    throw new Error(`unsupported version ${JSON.stringify(body)}`)
  }

  const majorWild = isWildcard(parts[0])
  const minorWild = isWildcard(parts[1])
  const patchWild = isWildcard(parts[2])
  const major = at(parts, 0)
  const minor = at(parts, 1)
  const patch = at(parts, 2)

  // A wildcard major matches anything — EXCEPT under a strict inequality,
  // where npm reads `>*` / `<x` as "nothing is allowed" rather than
  // "everything is". Returning `undefined` (any) for those was fail-OPEN in a
  // module whose entire contract is fail-closed.
  if (majorWild) return operator === '>' || operator === '<' ? NOTHING : undefined

  switch (operator) {
    case '^': {
      const lower = version(major, minor, patch, pre)
      // Caret pins the leftmost NON-ZERO part. `^0.2.3` → `<0.3.0`,
      // `^0.0.3` → `<0.0.4`, `^1.2.3` → `<2.0.0`. Partial forms widen the
      // floor but keep the same ceiling: `^0.2` → `>=0.2.0 <0.3.0`.
      let upper: ParsedVersion
      if (major !== 0) upper = version(major + 1, 0, 0, ['0'])
      else if (!minorWild && minor !== 0) upper = version(0, minor + 1, 0, ['0'])
      else if (minorWild) upper = version(1, 0, 0, ['0'])
      else if (patchWild) upper = version(0, 1, 0, ['0'])
      else upper = version(0, 0, patch + 1, ['0'])
      return [
        { op: '>=', version: lower },
        { op: '<', version: upper },
      ]
    }
    case '~': {
      const lower = version(major, minor, patch, pre)
      // `~1.2.3` / `~1.2` → `<1.3.0`; `~1` → `<2.0.0`.
      const upper = minorWild
        ? version(major + 1, 0, 0, ['0'])
        : version(major, minor + 1, 0, ['0'])
      return [
        { op: '>=', version: lower },
        { op: '<', version: upper },
      ]
    }
    case '>':
    case '>=':
    case '<':
    case '<=': {
      if (!minorWild && !patchWild) {
        // Fully specified: the comparator is itself.
        return [{ op: operator, version: version(major, minor, patch, pre) }]
      }
      // PARTIAL BOUND. "Wildcards resolve to zero" — what this branch used to
      // do unconditionally, and what the module docblock still claimed — is
      // right for `>=`/`<` and WRONG for `>`/`<=`, which have to step past the
      // entire range the partial names. node-semver's `replaceXRange`:
      //
      //   >1     → >=2.0.0      >1.2    → >=1.3.0
      //   <=1    → <2.0.0-0     <=1.2   → <1.3.0-0
      //   >=1    → >=1.0.0      >=1.2   → >=1.2.0    (zero-fill: unchanged)
      //   <1     → <1.0.0-0     <1.2    → <1.2.0-0
      //
      // The `>` case was fail-OPEN and it is the one that matters here:
      // `satisfiesRange('1.5.0', '>1')` answered true where npm answers false,
      // so a template declaring `cliRange: '>1'` (meaning "2.x or newer") was
      // waved through by every 1.x CLI — `assertTemplateCompatibility`
      // reporting compatible for a pairing npm calls incompatible.
      //
      // The `-0` on the `<` ceilings matches npm and matters for prereleases:
      // it is the same `['0']` sentinel the caret/tilde ceilings above use.
      switch (operator) {
        case '>':
          return [
            {
              op: '>=',
              version: minorWild ? version(major + 1, 0, 0) : version(major, minor + 1, 0),
            },
          ]
        case '<=':
          return [
            {
              op: '<',
              version: minorWild
                ? version(major + 1, 0, 0, ['0'])
                : version(major, minor + 1, 0, ['0']),
            },
          ]
        case '<':
          return [{ op: '<', version: version(major, minor, patch, ['0']) }]
        default:
          return [{ op: '>=', version: version(major, minor, patch) }]
      }
    }
    default: {
      // Bare or `=`-prefixed. A fully specified version is exact; a partial one
      // is the implicit range it names (`1.2` == `1.2.x`).
      if (!minorWild && !patchWild) {
        return [{ op: '=', version: version(major, minor, patch, pre) }]
      }
      const upper = minorWild
        ? version(major + 1, 0, 0, ['0'])
        : version(major, minor + 1, 0, ['0'])
      return [
        { op: '>=', version: version(major, minor, patch) },
        { op: '<', version: upper },
      ]
    }
  }
}

/**
 * Parse an npm range into its OR-ed comparator sets.
 *
 * THROWS `Error` on syntax this module does not implement — see the module
 * docblock for why silence is not an option here.
 */
export function parseRange(range: string): ReadonlyArray<ReadonlyArray<Comparator>> {
  const trimmed = range.trim()
  if (trimmed === '') return [ANY]
  if (trimmed.includes(' - ')) {
    throw new Error('hyphen ranges are not supported; use `>=a <b` instead')
  }
  // npm allows whitespace between an operator and its version (`>= 1.0.0`) and
  // strips it before parsing (node-semver's `comparatorTrimReplace`). Splitting
  // on whitespace first turned `>=` into an atom of its own, which threw — so a
  // template writing the spaced form got "unusable cliRange" and was BLOCKED
  // over a range npm reads without complaint. Done after the hyphen check so
  // `1.2.3 - 2.3.4` still reports the specific "not supported" message.
  const glued = trimmed.replace(/(<=|>=|<|>|=|\^|~)\s+/g, '$1')
  return glued.split('||').map((setRaw) => {
    const atoms = setRaw.trim().split(/\s+/).filter(Boolean)
    const out: Comparator[] = []
    let wildcard = false
    for (const atom of atoms) {
      const expanded = expandAtom(atom)
      if (expanded === undefined) {
        // A wildcard atom inside an AND-set constrains nothing, so npm DROPS
        // it and keeps the rest (`Range`'s comparator map deletes the empty
        // comparator whenever others are present). Returning ANY for the whole
        // set instead threw the accumulated comparators away: `>=1.0.0 * <2.0.0`
        // matched 2.5.0. Dropping constraints is the precise opposite of this
        // module's stated fail-closed contract.
        wildcard = true
        continue
      }
      out.push(...expanded)
    }
    // ANY only when the wildcard is all there was.
    return out.length === 0 && wildcard ? ANY : out
  })
}

// ─── Satisfaction ────────────────────────────────────────────────────────────

function satisfiesComparator(v: ParsedVersion, c: Comparator): boolean {
  const cmp = compareVersions(v, c.version)
  switch (c.op) {
    case '<':
      return cmp < 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '>=':
      return cmp >= 0
    case '=':
      return cmp === 0
  }
}

function satisfiesSet(v: ParsedVersion, set: ReadonlyArray<Comparator>): boolean {
  for (const c of set) {
    if (!satisfiesComparator(v, c)) return false
  }
  if (v.pre.length === 0) return true
  // npm's prerelease rule: a prerelease only satisfies a set that explicitly
  // opted into prereleases at the SAME [major, minor, patch]. `^1.0.0` must not
  // match `2.0.0-beta.1` even though it sorts below the `<2.0.0` ceiling.
  return set.some(
    (c) =>
      c.version.pre.length > 0 &&
      c.version.major === v.major &&
      c.version.minor === v.minor &&
      c.version.patch === v.patch,
  )
}

/**
 * True when `version` satisfies `range`.
 *
 * THROWS when `range` is syntax this module does not implement, or when
 * `version` is not a parseable semver version.
 */
export function satisfiesRange(rawVersion: string, range: string): boolean {
  const v = parseVersion(rawVersion)
  if (v === undefined) {
    throw new Error(`invalid semver version ${JSON.stringify(rawVersion)}`)
  }
  let sets: ReadonlyArray<ReadonlyArray<Comparator>>
  try {
    sets = parseRange(range)
  } catch (err) {
    throw new Error(`invalid semver range ${JSON.stringify(range)}: ${(err as Error).message}`)
  }
  return sets.some((set) => satisfiesSet(v, set))
}
