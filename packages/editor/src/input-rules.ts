/**
 * Input rules — markdown-ish autoformat (spec §5).
 *
 * The engine runs after an `insertText` commit whose text ends with a rule's
 * trigger; first matching rule wins; the emitted steps are applied as a
 * SEPARATE transaction with `origin: 'inputrule'` so a single undo restores
 * the literal typed text. Rules never run while composing, never on
 * `agent:*` transactions, and blockStart rules only convert paragraphs.
 *
 * `fence` (codeBlock) is deliberately absent — codeBlock is v2.
 */

import { containerText, findContainer } from './doc.ts'
import type { FeaturesConfig } from './features.ts'
import { freshId } from './id.ts'
import { safeHref } from './safe-href.ts'
import type { DocNode, Point, Step } from './types.ts'

export interface InputRuleContext {
  blockId: string
  caret: Point
  doc: DocNode
}

export interface InputRule {
  id: string
  scope: 'blockStart' | 'inline'
  /** Char whose insertion arms the check ('\n' = Enter, checked pre-split). */
  trigger: string
  /** Applied to block text [0, caret); must end at the caret. */
  match: RegExp
  apply(m: RegExpExecArray, ctx: InputRuleContext): Step[]
}

const del = (block: string, from: number, to: number): Step => ({
  t: 'deleteRange',
  from: { block, offset: from },
  to: { block, offset: to },
})

export const builtinRules: InputRule[] = [
  {
    id: 'heading',
    scope: 'blockStart',
    trigger: ' ',
    match: /^(#{1,6}) $/,
    apply: (m, ctx) => [
      del(ctx.blockId, 0, (m[0] as string).length),
      {
        t: 'setBlockType',
        id: ctx.blockId,
        type: 'heading',
        attrs: { level: Math.min((m[1] as string).length, 3) as 1 | 2 | 3 },
      },
    ],
  },
  {
    id: 'bullet',
    scope: 'blockStart',
    trigger: ' ',
    match: /^[-*] $/,
    apply: (m, ctx) => [
      del(ctx.blockId, 0, (m[0] as string).length),
      {
        t: 'setBlockType',
        id: ctx.blockId,
        type: 'list',
        attrs: { ordered: false },
        newId: freshId(),
      },
    ],
  },
  {
    id: 'ordered',
    scope: 'blockStart',
    trigger: ' ',
    match: /^\d+[.)] $/,
    apply: (m, ctx) => [
      del(ctx.blockId, 0, (m[0] as string).length),
      {
        t: 'setBlockType',
        id: ctx.blockId,
        type: 'list',
        attrs: { ordered: true },
        newId: freshId(),
      },
    ],
  },
  {
    id: 'quote',
    scope: 'blockStart',
    trigger: ' ',
    match: /^> $/,
    apply: (m, ctx) => [
      del(ctx.blockId, 0, (m[0] as string).length),
      { t: 'setBlockType', id: ctx.blockId, type: 'blockquote' },
    ],
  },
  {
    id: 'hr',
    scope: 'blockStart',
    trigger: '\n',
    match: /^(-{3,})$/,
    apply: (m, ctx) => [
      del(ctx.blockId, 0, (m[0] as string).length),
      {
        t: 'insertBlock',
        after: null,
        node: { id: freshId(), type: 'hr' },
        ...insertBeforeSelf(ctx),
      },
    ],
  },
  {
    id: 'strong',
    scope: 'inline',
    trigger: '*',
    match: /\*\*([^*\s](?:[^*]*[^*\s])?)\*\*$/,
    apply: markApply('strong'),
  },
  {
    id: 'strong',
    scope: 'inline',
    trigger: '_',
    match: /__([^_\s](?:[^_]*[^_\s])?)__$/,
    apply: markApply('strong'),
  },
  {
    id: 'em',
    scope: 'inline',
    trigger: '*',
    match: /(?<!\*)\*([^*\s](?:[^*]*[^*\s])?)\*$/,
    apply: markApply('em'),
  },
  {
    id: 'em',
    scope: 'inline',
    trigger: '_',
    match: /(?<!_)_([^_\s](?:[^_]*[^_\s])?)_$/,
    apply: markApply('em'),
  },
  {
    id: 'code',
    scope: 'inline',
    trigger: '`',
    match: /`([^`]+)`$/,
    apply: markApply('code'),
  },
  {
    id: 'link',
    scope: 'inline',
    trigger: ')',
    match: /\[([^\]]+)\]\(([^)\s]+)\)$/,
    apply: (m, ctx) => {
      const href = safeHref(m[2] as string)
      if (!href || /[\s)]/.test(href)) return [] // bad href: keep the literal text
      const end = ctx.caret.offset
      const start = end - (m[0] as string).length
      return [
        del(ctx.blockId, start, end),
        {
          t: 'insertText',
          at: { block: ctx.blockId, offset: start },
          text: m[1] as string,
          mark: { type: 'link', attrs: { href } },
        },
      ]
    },
  },
]

/** hr inserts BEFORE the current (emptied) paragraph: `after` = previous block. */
function insertBeforeSelf(ctx: InputRuleContext): { after?: string | null } {
  const loc = findContainer(ctx.doc, ctx.blockId)
  if (!loc || loc.parentList) return {}
  const prev = loc.topIndex > 0 ? ctx.doc.children[loc.topIndex - 1] : null
  return { after: prev ? prev.id : null }
}

function markApply(type: 'strong' | 'em' | 'code') {
  return (m: RegExpExecArray, ctx: InputRuleContext): Step[] => {
    const end = ctx.caret.offset
    const start = end - (m[0] as string).length
    return [
      del(ctx.blockId, start, end),
      {
        t: 'insertText',
        at: { block: ctx.blockId, offset: start },
        text: m[1] as string,
        mark: { type },
      },
    ]
  }
}

/** Rule ids pruned by the features config (spec §9.1). */
function ruleEnabled(rule: InputRule, features: FeaturesConfig): boolean {
  const cfg = features.inputRules
  if (cfg === false) return false
  if (typeof cfg === 'object' && cfg.disable?.includes(rule.id)) return false
  if (rule.id === 'heading' && features.headings === false) return false
  if ((rule.id === 'bullet' || rule.id === 'ordered') && features.lists === false) return false
  if (rule.id === 'quote' && features.blockquote === false) return false
  if (rule.id === 'link' && features.link === false) return false
  return true
}

/**
 * Find the first matching rule for the text before the caret. `trigger` is
 * the char that just committed ('\n' for Enter). Returns the steps to apply
 * as an `origin: 'inputrule'` transaction, or null.
 */
export function matchInputRules(
  doc: DocNode,
  blockId: string,
  caretOffset: number,
  trigger: string,
  features: FeaturesConfig,
  extraRules: InputRule[] = [],
): { rule: InputRule; steps: Step[]; caretAfter: Point } | null {
  const loc = findContainer(doc, blockId)
  if (!loc) return null
  // blockStart conversions only apply to paragraphs (never re-typing headings,
  // quotes, or list items); inline rules apply in any inline container.
  const text = containerText(loc.node).slice(0, caretOffset)
  for (const rule of [...builtinRules, ...extraRules]) {
    if (rule.trigger !== trigger) continue
    if (rule.scope === 'blockStart' && (loc.node.type !== 'paragraph' || loc.parentList)) continue
    const cfg = featureGate(features)
    if (!ruleEnabled(rule, cfg)) continue
    rule.match.lastIndex = 0
    const m = rule.match.exec(text)
    if (!m) continue
    if (rule.scope === 'blockStart' && m.index !== 0) continue
    if (m.index + (m[0] as string).length !== text.length) continue // must end at caret
    const steps = rule.apply(m, { blockId, caret: { block: blockId, offset: caretOffset }, doc })
    if (steps.length === 0) continue
    const caretAfter = caretAfterSteps(rule, m, blockId, caretOffset)
    return { rule, steps, caretAfter }
  }
  return null
}

function featureGate(features: FeaturesConfig): FeaturesConfig {
  return features
}

function caretAfterSteps(
  rule: InputRule,
  m: RegExpExecArray,
  blockId: string,
  caretOffset: number,
): Point {
  if (rule.scope === 'blockStart') return { block: blockId, offset: 0 }
  const matchLen = (m[0] as string).length
  const contentLen = (m[1] as string | undefined)?.length ?? 0
  return { block: blockId, offset: caretOffset - matchLen + contentLen }
}
