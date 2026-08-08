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
 *
 * WHAT IS NOT. Hyphen ranges (`1.2.3 - 2.3.4`) and build metadata are not
 * implemented. Anything unparseable THROWS rather than defaulting to
 * "satisfied" — a template that declares a range this cannot read is a broken
 * template, and the whole point of enforcing `cliRange` is that an
 * unenforceable declaration must not pass silently.
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
 * Expand one whitespace-free range atom into comparators.
 * Returns `undefined` for the "matches anything" atom.
 */
function expandAtom(atom: string): ReadonlyArray<Comparator> | undefined {
  if (atom === '' || atom === '*' || atom === 'x' || atom === 'X') return undefined

  const opMatch = /^(<=|>=|<|>|=|\^|~)\s*(.+)$/.exec(atom)
  const operator = opMatch ? opMatch[1]! : ''
  const body = opMatch ? opMatch[2]! : atom

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

  // `*`, `x.y` with a wildcard major — matches anything.
  if (majorWild) return undefined

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
    case '<=':
      // A partial bound resolves its wildcards to zero: `>=1.2` is `>=1.2.0`.
      return [{ op: operator, version: version(major, minor, patch, pre) }]
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
  return trimmed.split('||').map((setRaw) => {
    const atoms = setRaw.trim().split(/\s+/).filter(Boolean)
    const out: Comparator[] = []
    for (const atom of atoms) {
      const expanded = expandAtom(atom)
      if (expanded === undefined) return ANY // this whole set matches anything
      out.push(...expanded)
    }
    return out
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
