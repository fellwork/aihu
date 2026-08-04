/**
 * Markdown → HTML for docs-next, dogfooded through the aihu render pipeline:
 * the `<markdown-doc>` component calls this at prerender time so guide bodies
 * ship as real static HTML (no bespoke build.ts). Fenced code routes through
 * the shared `codeBlock()` chrome, and headings get slug ids + anchor links so
 * the `<toc-rail>` island can build an "On this page" rail.
 */
import { marked, Renderer } from 'marked'
import { codeBlock } from './code-block.ts'

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function buildRenderer(): Renderer {
  const r = new Renderer()

  r.code = ({ text, lang }: { text: string; lang?: string }): string => {
    const label = lang?.trim() ? lang.trim() : 'aihu'
    return codeBlock(text, { name: label })
  }

  r.heading = ({ tokens, depth }: { tokens: unknown[]; depth: number }): string => {
    // @ts-expect-error marked's parser is attached at runtime
    const inline = r.parser.parseInline(tokens)
    const plain = inline.replace(/<[^>]*>/g, '')
    const id = slugify(plain)
    if (depth === 1) return `<h1>${inline}</h1>`
    // `tabindex="-1"` alongside `aria-hidden="true"` is required, not optional.
    // The "#" is decorative — a mouse affordance revealed on heading hover — so
    // it is hidden from the a11y tree; but an <a href> is focusable by default,
    // and a focusable element inside an aria-hidden subtree is axe
    // `aria-hidden-focus` (impact: serious): keyboard users tab to something
    // screen readers refuse to announce. This fired on EVERY h2/h3 of every
    // prose page. Taking it out of the tab order makes the two agree.
    return `<h${depth} id="${id}"><a class="dn-anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inline}</h${depth}>`
  }

  return r
}

export function renderMarkdown(md: string): string {
  return marked.parse(md, { renderer: buildRenderer(), async: false }) as string
}
