/**
 * @aihu/magna — build-time warning and flag helpers.
 *
 * This module is build-time ONLY. It uses Node.js `node:fs` to read and write
 * JSON files in the output directory. It MUST NOT be imported in browser bundles.
 *
 * Two helpers:
 *   writeWarnOnce  — coalescing warn logger (deduplicates messages)
 *   setBuildFlag   — deep-merge key/value into build-flags.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Absolute path to the .aihu/ directory inside outputDir. */
function aihuDir(outputDir: string): string {
  return join(outputDir, '.aihu')
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as T
  } catch {
    return fallback
  }
}

/**
 * Append `message` to `<outputDir>/.aihu/magna-warnings.json` unless it is
 * already present (coalesce duplicate warnings across multiple build runs or
 * hook invocations within the same run).
 *
 * File format: `{ "messages": ["..."] }`
 */
export function writeWarnOnce(outputDir: string, message: string): void {
  const dir = aihuDir(outputDir)
  ensureDir(dir)

  const filePath = join(dir, 'magna-warnings.json')
  const data = readJson<{ messages: string[] }>(filePath, { messages: [] })

  if (!data.messages.includes(message)) {
    data.messages.push(message)
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  }
}

/**
 * Deep-merge `value` into `<outputDir>/.aihu/build-flags.json` at the given
 * dot-notation `key` (e.g. `'magna.untyped'` → `{ magna: { untyped: value } }`).
 *
 * Existing sibling keys at each nesting level are preserved; only the target
 * leaf is overwritten.
 */
export function setBuildFlag(outputDir: string, key: string, value: unknown): void {
  const dir = aihuDir(outputDir)
  ensureDir(dir)

  const filePath = join(dir, 'build-flags.json')
  const root = readJson<Record<string, unknown>>(filePath, {})

  // Walk the dot-notation segments and deep-merge (CodeQL
  // js/prototype-pollution-utility). Two hazards, both checked per segment
  // rather than up front, so the guard sits directly on the control flow that
  // reaches the assignment:
  //
  //   1. `__proto__` / `constructor` / `prototype` as a segment. `key` is a
  //      public API parameter of an exported function, and every current
  //      caller passes the literal 'magna.untyped' — but the contract accepts
  //      an arbitrary string, and `setBuildFlag(dir, '__proto__.x', v)` walks
  //      `cursor.__proto__` straight onto Object.prototype and assigns there,
  //      poisoning every object in the build process.
  //   2. Descending through the PROTOTYPE CHAIN. `typeof cursor[seg]` reads
  //      inherited properties too, so if anything else in the process had
  //      already polluted `Object.prototype.magna`, the old walk skipped
  //      creating an own `magna` and merged into the shared prototype object
  //      instead — the flag silently never reached build-flags.json.
  //      `Object.hasOwn` keeps the walk on own properties only.
  const segments = key.split('.')
  let cursor: Record<string, unknown> = root

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i] as string
    if (seg === '__proto__' || seg === 'constructor' || seg === 'prototype') {
      throw new Error(`setBuildFlag: unsafe key segment '${seg}' in "${key}"`)
    }
    if (i === segments.length - 1) {
      cursor[seg] = value
      break
    }
    const existing = Object.hasOwn(cursor, seg) ? cursor[seg] : undefined
    if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
      cursor[seg] = {}
    }
    cursor = cursor[seg] as Record<string, unknown>
  }

  ensureDir(dirname(filePath))
  writeFileSync(filePath, JSON.stringify(root, null, 2), 'utf8')
}
