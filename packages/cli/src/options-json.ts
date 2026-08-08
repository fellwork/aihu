/**
 * `--options-json` parsing, shared by both scaffolder entry points.
 *
 * This lived privately inside `bin.ts`, which is why `create.ts` listed
 * `--options-json` in its `VALUE_FLAGS` (so the value was correctly skipped
 * when hunting for the project name) but never applied it: the validated
 * implementation was one module away and not exported. `create-aihu` is the
 * only entry point real npm users reach, so the flag was accepted and dropped
 * on precisely the path that matters most.
 */

/**
 * Parse `--options-json '<JSON>'` into a record of override values for a
 * template manifest's `overridable` cells. Returns `{}` when the flag is
 * absent. Throws on invalid JSON, on a non-object payload, and on any value
 * that is not a string or boolean (the only two `ChoiceValue` types a manifest
 * can declare).
 */
export function parseOptionsJson(raw: string | undefined): Record<string, string | boolean> {
  if (raw === undefined) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`--options-json: invalid JSON: ${(err as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--options-json: must be a JSON object')
  }
  const out: Record<string, string | boolean> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string' && typeof v !== 'boolean') {
      throw new Error(`--options-json.${k}: value must be string or boolean`)
    }
    out[k] = v
  }
  return out
}
