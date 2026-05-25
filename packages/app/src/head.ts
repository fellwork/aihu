import type { HeadConfig } from './config.ts'

/** Escape a string for safe inclusion in a double-quoted HTML attribute value. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Escape text for safe inclusion in element text content (e.g. <title>). */
function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Transform a built index.html, applying the app-level <head> config.
 *
 * Precedence rule: **config overrides source.** When the source index.html
 * already declares a tag that `app.head` also configures (title, charset,
 * viewport, or a meta with a matching name/property), the configured value
 * replaces the source value in place — no duplicates are emitted. Tags present
 * only in the source are left untouched; tags present only in config are
 * injected just before `</head>` (or appended if no `</head>` exists).
 *
 * This is the sensible precedence because `app.head` is the explicit,
 * type-checked intent of the application author in aihu.config.ts, whereas the
 * source index.html is typically a Vite scaffold default.
 */
export function applyHeadConfig(html: string, head: HeadConfig | undefined): string {
  if (!head) return html

  let out = html
  const inject: string[] = []

  // title → set/replace <title>
  if (head.title !== undefined) {
    const tag = `<title>${escapeText(head.title)}</title>`
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag)
    } else {
      inject.push(tag)
    }
  }

  // charset → <meta charset>
  if (head.charset !== undefined) {
    const tag = `<meta charset="${escapeAttr(head.charset)}">`
    if (/<meta\s+[^>]*charset\s*=\s*["'][^"']*["'][^>]*>/i.test(out)) {
      out = out.replace(/<meta\s+[^>]*charset\s*=\s*["'][^"']*["'][^>]*>/i, tag)
    } else {
      inject.push(tag)
    }
  }

  // viewport → <meta name="viewport">
  if (head.viewport !== undefined) {
    const tag = `<meta name="viewport" content="${escapeAttr(head.viewport)}">`
    const viewportRe = /<meta\s+[^>]*name\s*=\s*["']viewport["'][^>]*>/i
    if (viewportRe.test(out)) {
      out = out.replace(viewportRe, tag)
    } else {
      inject.push(tag)
    }
  }

  // meta[] → one <meta> per entry, keyed by name/property (config overrides
  // any matching source meta; unkeyed metas are always injected).
  for (const entry of head.meta ?? []) {
    const key = entry.name !== undefined ? 'name' : entry.property !== undefined ? 'property' : null
    const keyVal = key ? entry[key] : undefined

    const attrs = Object.entries(entry)
      .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
      .join(' ')
    const tag = `<meta ${attrs}>`

    if (key && keyVal !== undefined) {
      const re = new RegExp(
        `<meta\\s+[^>]*${key}\\s*=\\s*["']${keyVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
        'i',
      )
      if (re.test(out)) {
        out = out.replace(re, tag)
        continue
      }
    }
    inject.push(tag)
  }

  if (inject.length === 0) return out

  const block = inject.join('\n    ')
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `    ${block}\n  </head>`)
  }
  // No </head> in source — append the tags so they are not silently dropped.
  return `${out}\n${block}`
}
