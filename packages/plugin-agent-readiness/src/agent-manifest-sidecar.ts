/**
 * Read the compiler's build-time agent-meta sidecars (`<tag>.agent-manifest.json`).
 *
 * WHY THIS EXISTS (FEL-434b). The `## Components` section of llms.txt is built
 * from `getAllAgentMetadata()` — the LIVE registry, populated by the
 * `registerAgentMetadata(...)` call the compiler emits into component JS. That
 * call is deliberately elided from CLIENT builds (mcp_emit.rs: no scope /
 * rateLimit bytes in the browser bundle), so on a client-target build the
 * registry is EMPTY and the section came out empty too. #668 made the compiler
 * emit the manifest for every agent component including client builds; this
 * module is the consumer that closes the loop.
 *
 * POLICY MUST NOT BECOME PUBLIC. The sidecar is a build artifact and it MAY
 * carry policy — `scope`, `rateLimit`, `streamOutput` are all real members of
 * the emitted JSON. llms.txt is served to anonymous agents, so the mapping
 * below is an ALLOWLIST, not a deny-list: only `tag` / `describes` / `state` /
 * `actions` / `extract` are copied across. A policy field added to the manifest
 * later cannot leak by default — it has to be added here on purpose.
 *
 * `extract` IS copied, and must be: it is the input to the fail-closed
 * `deriveReadPolicy` filter in `llms-txt.ts`. Carrying it forward is what lets
 * a non-advertised component stay out of the document; dropping it would
 * silently advertise everything.
 *
 * ADDRESSING. One file per component, named `<tag>.agent-manifest.json`,
 * matching the sibling `<tag>.ts` / `<tag>.route.json` / `<tag>.aihu.ts`
 * sidecars. The pre-#668 fixed `agent-manifest.json` name collided when N ≥ 2
 * agent components compiled into one output directory — the second write
 * clobbered the first, so only one component could ever be listed.
 */

import type { AgentMetadata } from '@aihu/agent'

/** Filename suffix the compiler writes per agent component. */
export const AGENT_MANIFEST_SUFFIX = '.agent-manifest.json'

/** One `tools[]` entry as the compiler emits it. Every member is untrusted. */
interface ManifestTool {
  readonly tag?: unknown
  readonly describes?: unknown
  readonly state?: unknown
  readonly actions?: unknown
  readonly extract?: unknown
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Project one manifest tool onto registry metadata, copying ONLY the members
 * llms.txt renders plus the `extract` policy that decides whether it renders
 * at all. Returns null for anything without a usable `tag`.
 */
function toAgentMetadata(tool: ManifestTool): AgentMetadata | null {
  if (typeof tool.tag !== 'string' || tool.tag === '') return null
  const meta: AgentMetadata = { tag: tool.tag }
  if (typeof tool.describes === 'string') meta.describes = tool.describes
  if (isRecord(tool.state)) meta.state = tool.state as Record<string, string>
  if (isRecord(tool.actions)) {
    meta.actions = tool.actions as NonNullable<AgentMetadata['actions']>
  }
  // Absent `extract` is the resolved default posture, not "no policy" — leave
  // the member off entirely so `deriveReadPolicy` applies its own default.
  if (tool.extract !== undefined) {
    meta.extract = tool.extract as NonNullable<AgentMetadata['extract']>
  }
  return meta
}

/**
 * Parse one sidecar's JSON text into registry metadata.
 *
 * Never throws: a malformed or truncated sidecar yields an empty array rather
 * than failing the whole build. A component that cannot be parsed is a missing
 * listing, which is safe; a thrown error would take down llms.txt entirely.
 */
export function componentsFromManifestJson(text: string): ReadonlyArray<AgentMetadata> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.tools)) return []
  const out: AgentMetadata[] = []
  for (const tool of parsed.tools) {
    if (!isRecord(tool)) continue
    const meta = toAgentMetadata(tool as ManifestTool)
    if (meta !== null) out.push(meta)
  }
  return out
}

/**
 * Read every `*.agent-manifest.json` in `dir` (non-recursive) and return the
 * components they describe, sorted by tag so the emitted document is
 * byte-stable across runs regardless of directory-read order.
 *
 * `node:fs` is imported lazily so this module stays importable on Workers —
 * the rest of the package is edge-safe and a static `node:` import at the top
 * of a file reachable from `index.ts` would break that.
 */
export async function readAgentManifestDir(dir: string): Promise<ReadonlyArray<AgentMetadata>> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    // No such directory → no components, same as an app with none.
    return []
  }
  const out: AgentMetadata[] = []
  for (const name of names.filter((n) => n.endsWith(AGENT_MANIFEST_SUFFIX)).sort()) {
    try {
      out.push(...componentsFromManifestJson(await readFile(join(dir, name), 'utf8')))
    } catch {
      // Unreadable file → skip it, same rationale as a parse failure.
    }
  }
  return out.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
}
