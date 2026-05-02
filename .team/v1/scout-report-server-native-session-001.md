# Scout Report: Server-Native Track (Rust napi-rs Port)
**Date:** 2026-05-02 | **Audit Scope:** packages/server/src/ssr.ts, stream-types.ts, test suite, compiler release pattern | **Session:** 001

---

## §1 HTML Emission Contract (ssr.ts)

### escapeAttr (line 106–108)
- **Inputs:** val: string
- **Outputs:** escaped string
- **Replacement table (exact):**
  - & → &amp;
  - " → &quot;
- **Not escaped:** <, >, ', newlines (attr-context safe)

### renderNode (line 110–132, sync)
- **Inputs:** node: unknown, path: string, hydratable: boolean
- **Outputs:** HTML string
- **Conditionals:**
  - if (typeof node !== 'object' || node === null) → return ''
  - if (!('kind' in obj)) → return ''
  - if (obj.kind === 'leaf') → emit text (no wrapping tag, no escape)
  - if (obj.kind === 'branch') → emit <tag attrs>children</tag>
  - **Fall-through (unknown kind):** returns '' (silent, no throw)
- **Attr emission (line 120–124):**
  - Iterates Object.entries(attrs) — **insertion order** (ES2015)
  - if (v === true) → emit  k (no ="")
  - else if (v !== false && v !== undefined) → emit  k="<escapeAttr(v)>"
  - false, undefined → omitted
- **data-scribe-path format (line 125):** data-scribe-path="${escapeAttr(path)}" (path: 0, 0.0, 0.0.1)
- **Tag default:** 'div' if absent
- **Children iteration:** children.map((c, i) => renderNode(c, ${path}.${i}, hydratable)).join('')

### renderNodeAsync (line 188–265, async boundary walker)
- **Inputs:** same as renderNode + controller, pendingState
- **DataSource detection (line 214–217):**
  - Duck-type: if (!dataSource || typeof dataSource !== 'object')
  - If no dataSource → synchronous walk
- **DataSource.status transitions:**
  - 'pending' → register onReady callback, increment pendingState.count, return
  - 'ready' → render children sync, decrement count in callback
  - 'error' → call controller.error(dataSource.error)
- **Post-walk:** emitStateScriptAndClose invoked only if pendingState.count === 0 && pendingState.walkDone

### buildHead (line 167–183)
- **Inputs:** head: HeadConfig
- **Outputs:** <title><meta…><link…> string (no <head> wrapper)
- **Iteration:** Object.entries() on each meta/link (insertion order)
- **Attr format:** ${k}="${escapeAttr(v as string)}" for all keys
- **Title:** <title>${head.title}</title> (text never escaped)

### renderToStream (line 267–320, public API)
- **Step 1:** If opts.head, emit <!DOCTYPE html><html${lang}><head>${headHtml}</head><body>
- **Step 2:** Resolve component
  - If { toHtml() } → call sync, enqueue HTML directly
  - If () => node → call factory, kick off async walk
- **State script:** emitted by emitStateScriptAndClose when serializer() succeeds; swallows errors
- **State script format:** <script type="application/json" id="__scribe_state__">${JSON.stringify(state)}</script>
- **Closing tags:** If opts.head, emit </body></html>

### renderToString (line 322–345, public API)
- **Context setup:** If opts.contextSetup && _setContextMap && _clearContextMap:
  1. Call contextSetup(_setContextMap, _clearContextMap)
  2. Call _setContextMap(new Map()) to activate
  3. Call _clearContextMap() in finally block
- No early return if context absent

---

## §2 ComponentDescription Tagged Union

**Type (line 104–105):**
- (() => unknown) — factory returning arbor Branch/Leaf
- { toHtml(): string } — escape-hatch direct provider

**Rendering paths:**
- **Factory:** renderNode() sync walk or renderNodeAsync() for streaming
- **toHtml():** bypasses tree walk; output enqueued as-is (no escaping)

---

## §3 _setContextFns Injection Slot

**Module-level state (line 16–17):**
- _setContextMap: ((map: Map<symbol, unknown>) => void) | undefined
- _clearContextMap: (() => void) | undefined

**Entrypoint (line 21–32):** _setContextFns(set, clear): void

**Expected caller:** _setContextFns(setSsrContextMap, clearSsrContextMap) from @scribe/context/ssr

**Interaction with renderToString (line 330–335):**
- If opts.contextSetup + both fns: activate map, call contextSetup, clear in finally
- If not configured: no context map

**FFI boundary implication:**
- Rust cannot import @scribe/context (hard constraint)
- Rust calls Rust callbacks via FFI, OR accepts context map as parameter

---

## §4 SsrOptions Surface

| Field | Type | Required? | Default | FFI Status |
|-------|------|-----------|---------|-----------|
| head | HeadConfig \\| undefined | No | undefined | JS-side (doc preamble) |
| hydratable | boolean \\| undefined | No | false | Rust-compatible |
| serializer | () => Record<string, unknown> \\| undefined | No | undefined | JS-only |
| contextSetup | (activate, deactivate) => void \\| undefined | No | undefined | JS-only |

**v1 plan:** head, hydratable move to Rust; serializer, contextSetup stay JS-side.

---

## §5 Test Surface

| Test File | Summary | Parity Oracle? |
|-----------|---------|----------------|
| ssr.test.ts (12 tests) | Basic rendering, attrs, head, serializer, hydratable | Yes — disabled="" vs disabled |
| ssr-stream.test.ts (6+ tests) | Streaming, DataSource suspension, chunk ordering | Yes — <body> pre-boundary |
| compliance/ssr-output.test.ts (9+ tests) | DOCTYPE, <html>, <head>, <meta>, <link>, attrs | Yes — locks exact bytes |

**Critical invariants:**
- <!DOCTYPE html> start when opts.head
- Boolean disabled: true → " disabled" (no ="")
- Boolean disabled: false → omitted
- __scribe_state__ before </body></html>
- data-scribe-path: 0, 0.0, 0.0.1 (dot-indexed, escaped)
- <meta>, <link> attrs in insertion order

---

## §6 Compiler Release-Workflow Delta

**.github/workflows/release.yml:**
- Trigger: push tags:v* or workflow_dispatch
- Matrix: 4 targets (darwin-arm64, darwin-x64, linux-x64, windows-x64)
- Build: cargo build --release --target <triple>
- Distribution: GitHub Release assets

**packages/compiler/js/postinstall.ts:**
- Runs: npm postinstall
- Logic: Detect process.platform/arch, fetch asset from releases/latest/download/
- Fallback: SCRIBE_COMPILE_BIN env var
- Output: packages/compiler/bin/scribe-compile<.exe>

**napi-rs parallel:**
- Build: napi build --release --target <triple>
- Artifacts: <package>.<triple>.node per triple
- Distribution: npm optionalDependencies @scribe/server-<platform>-<arch>
- Loading: require('@scribe/server-x64') or conditional per platform

**Key diff:** napi-rs uses npm native platform selector (simpler).

---

## §7 napi-rs 2.x State of the Art

**Current:** 2.x stable (Jan 2025)

**Key macros:** #[napi], #[napi(constructor)], #[napi(getter)], #[napi(object)]

**CLI:** napi build --release, napi build --target <triple>

**Conventional layout:**
- src/lib.rs
- Cargo.toml with [lib] crate-type = ["cdylib"]
- package.json with napi config + optionalDependencies

**Recommended optionalDependencies:**
- @scribe/server-darwin-arm64
- @scribe/server-darwin-x64
- @scribe/server-linux-x64
- @scribe/server-win32-x64

Load via: `require('@scribe/server-${process.platform}-${process.arch}')`

---

## §8 Edge-Runtime Detection

| Runtime | Detection Signal | Skip Native? |
|---------|------------------|--------------|
| Cloudflare Workers | typeof globalThis.caches === 'object' | YES |
| Deno Deploy | typeof globalThis.Deno === 'object' | YES |
| Vercel Edge | typeof process === 'undefined' OR process.env.VERCEL_REGION | YES |
| Bun | typeof globalThis.Bun === 'object' | NO (supports napi v1.0+) |
| Node.js | typeof process === 'object' && process.versions.node | NO |

**Conditional loader:** If isEdge return tsImplementation, else try native addon fallback to TS.

---

## §9 Do-Not-Break List

1. **DOCTYPE and structure:**
   - Start with <!DOCTYPE html> when opts.head
   - <html> before <head>, <head> before <body>, </body></html> at end

2. **Boolean attributes:**
   - disabled: true → " disabled" (not " disabled=\"\"")
   - disabled: false → omitted entirely
   - disabled: undefined → omitted

3. **Attribute escaping:**
   - & → &amp;
   - " → &quot;
   - Order: insertion order, not alphabetic

4. **data-scribe-path:**
   - Format: data-scribe-path="0.0.1" (dot-delimited, numeric)
   - Must be escaped via escapeAttr()

5. **State script:**
   - Before </body></html>
   - Format: <script type="application/json" id="__scribe_state__">{…}</script>

6. **Attr iteration:** Object.entries() insertion order

---

## §10 Surface-to-Architect

**Undecided issues:**

1. **Context map FFI:** How does Rust call back into JS?
   - Rust accepts opaque ContextMap handle
   - Rust calls JS callbacks (like current TS)
   - Defer context support to v1.M

2. **serializer error handling:** Swallow, propagate, or log?

3. **Fall-through unknown kind:** Silently return '' or throw?

4. **Attr escape scope:** { toHtml() } text never escaped — document contract?

5. **Bun .node loading:** Test with Bun v1.0+ before shipping.

---

**End Scout Report**