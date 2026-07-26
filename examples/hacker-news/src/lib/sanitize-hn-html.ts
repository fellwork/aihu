/**
 * Allowlist sanitiser for Hacker News user-authored HTML.
 *
 * WHY THIS EXISTS. `html={}` is an intentionally unsafe primitive — it means
 * "interpolate this raw", and the compiler honours that literally. Since #572
 * it is honoured on the SERVER too: `ssr_string_emit.rs` interpolates the
 * value straight into the bytes we serve, so an `html={}` binding pointed at
 * remote content is stored XSS that fires while the parser builds the
 * document, before any of our JS runs.
 *
 * The primitive is fine. Aiming it at `item.text` / `user.about` — strings
 * that arrive verbatim from the HN Firebase API, authored by strangers — is
 * not. This module is the trust boundary: everything downstream of a loader
 * may be treated as trusted precisely because it passed through here.
 *
 * HOW IT IS SAFE. Escape-first, then re-permit. We do NOT parse HTML and strip
 * bad parts — that is the approach every sanitiser CVE is written about,
 * because "bad" is an open set and parsers disagree. Instead every byte is
 * made inert first, and then a closed set of exact literal patterns is
 * restored. Anything the allowlist does not name stays escaped by default, so
 * a novel payload shape fails closed rather than slipping through.
 *
 * HN's real tag vocabulary for `text`/`about` is small: <p>, <i>, <pre>,
 * <code>, and <a href> with rel="nofollow". That is the whole allowlist.
 */

/** A well-formed HTML entity: named, decimal, or hex. */
const ENTITY = /&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#\d{1,7}|#[xX][0-9a-fA-F]{1,6});/y

/** Tags permitted with no attributes, open and close. */
const SIMPLE_TAGS = ['p', 'i', 'pre', 'code'] as const

/**
 * Render every byte inert, preserving entities the API already encoded.
 *
 * HN pre-escapes literal characters in its payloads — a comment containing
 * `a < b` arrives as `a &lt; b`. Blindly escaping `&` would double-encode
 * those into visible `&lt;` noise, so a `&` that begins a well-formed entity
 * is passed through. That is safe: `&lt;` decodes to a text-node `<`, which
 * cannot open an element.
 */
function escapeInert(input: string): string {
  let out = ''
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === '&') {
      ENTITY.lastIndex = i
      const m = ENTITY.exec(input)
      if (m) {
        out += m[0]
        i += m[0].length - 1
        continue
      }
      out += '&amp;'
    } else if (ch === '<') out += '&lt;'
    else if (ch === '>') out += '&gt;'
    else if (ch === '"') out += '&quot;'
    else if (ch === "'") out += '&#39;'
    else out += ch
  }
  return out
}

/**
 * Only `http(s)` links become live anchors. The check runs on the still-escaped
 * href, so `javascript:`, `data:`, and `vbscript:` cannot match the required
 * literal prefix. A rejected href is simply left escaped — it renders as text.
 */
function isSafeHref(escapedHref: string): boolean {
  return /^https?:\/\//i.test(escapedHref.trim())
}

/**
 * Sanitise a Hacker News HTML fragment to the allowlist above.
 *
 * Known, deliberate imprecision: text the author escaped by hand so it would
 * *display* as `<p>` is restored to a real `<p>`. That is a fidelity wart, not
 * a hole — the restored set contains only inert formatting tags, and anchors
 * are still scheme-checked.
 */
export function sanitizeHnHtml(input: string | undefined | null): string {
  if (!input) return ''

  let out = escapeInert(input)

  for (const t of SIMPLE_TAGS) {
    out = out.replaceAll(`&lt;${t}&gt;`, `<${t}>`)
    out = out.replaceAll(`&lt;/${t}&gt;`, `</${t}>`)
  }

  // Anchors: restore only when the href survives the scheme check. The capture
  // is non-greedy and stops at the first `&quot;`, so a raw `"` cannot appear
  // inside it and the attribute cannot be broken out of.
  out = out.replace(
    /&lt;a href=&quot;(.*?)&quot;(?: rel=&quot;nofollow&quot;)?&gt;/g,
    (whole, href: string) =>
      isSafeHref(href) ? `<a href="${href}" rel="nofollow noopener noreferrer">` : whole,
  )
  out = out.replaceAll('&lt;/a&gt;', '</a>')

  return out
}
