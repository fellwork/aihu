/**
 * Step application, exact inversion, and forward position mapping (spec §2).
 *
 * `applyStep` mutates a DRAFT doc (the core clones before applying so a
 * rejection never partially applies) and returns an error code or null.
 * `invertStep(step, docBefore)` is total: every step has an exact inverse
 * computed against the pre-application doc.
 */

import {
  containerLength,
  findContainer,
  findTopBlock,
  flatten,
  isInlineContainer,
  normalizeRuns,
  rebuild,
  validMark,
} from './doc.ts'
import type {
  BlockNode,
  DocNode,
  HeadingAttrs,
  InlineContainer,
  ListAttrs,
  ListItemNode,
  Point,
  Step,
  TextNode,
} from './types.ts'

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

export function applyStep(doc: DocNode, step: Step): string | null {
  switch (step.t) {
    case 'insertText':
      return applyInsertRuns(doc, step.at, [{ text: step.text, mark: step.mark }])
    case 'insertRuns':
      return applyInsertRuns(doc, step.at, step.runs)
    case 'deleteRange': {
      if (step.from.block !== step.to.block) return 'cross_block'
      const loc = findContainer(doc, step.from.block)
      if (!loc) return 'unknown_block'
      const { text, marks } = flatten(loc.node)
      const from = step.from.offset
      const to = step.to.offset
      if (from < 0 || to > text.length || from > to) return 'bad_offset'
      loc.node.content = rebuild(text.slice(0, from) + text.slice(to), [
        ...marks.slice(0, from),
        ...marks.slice(to),
      ])
      return null
    }
    case 'setMark': {
      if (step.from.block !== step.to.block) return 'cross_block'
      if (!validMark(step.mark)) return 'bad_href'
      const loc = findContainer(doc, step.from.block)
      if (!loc) return 'unknown_block'
      const { text, marks } = flatten(loc.node)
      if (step.from.offset < 0 || step.to.offset > text.length) return 'bad_offset'
      if (step.from.offset > step.to.offset) return 'bad_offset'
      for (let i = step.from.offset; i < step.to.offset; i++) marks[i] = step.mark
      loc.node.content = rebuild(text, marks)
      return null
    }
    case 'setRuns': {
      const loc = findContainer(doc, step.id)
      if (!loc) return 'unknown_block'
      for (const run of step.runs) if (!validMark(run.mark)) return 'bad_href'
      loc.node.content = step.runs.map((r) => ({ text: r.text, mark: r.mark }))
      return null
    }
    case 'splitBlock':
      return applySplit(doc, step)
    case 'mergeBlock':
      return applyMerge(doc, step.first, step.second)
    case 'insertBlock':
      return applyInsertBlock(doc, step)
    case 'removeBlock':
      return applyRemoveBlock(doc, step.id)
    case 'setBlockType':
      return applySetBlockType(doc, step)
    case 'setAttrs': {
      const found = findTopBlock(doc, step.id)
      if (!found) return 'unknown_block'
      const b = found.node
      if (b.type === 'heading') {
        const level = (step.attrs as HeadingAttrs).level
        b.attrs.level = Math.min(3, Math.max(1, level)) as 1 | 2 | 3 // I5: clamp at write
        return null
      }
      if (b.type === 'list') {
        b.attrs.ordered = Boolean((step.attrs as ListAttrs).ordered)
        return null
      }
      return 'bad_attrs_target'
    }
  }
}

function applyInsertRuns(doc: DocNode, at: Point, runs: TextNode[]): string | null {
  const loc = findContainer(doc, at.block)
  if (!loc) return 'unknown_block'
  for (const run of runs) if (!validMark(run.mark)) return 'bad_href'
  const { text, marks } = flatten(loc.node)
  if (at.offset < 0 || at.offset > text.length) return 'bad_offset'
  let insText = ''
  const insMarks: (typeof marks)[number][] = []
  for (const run of runs) {
    insText += run.text
    for (let i = 0; i < run.text.length; i++) insMarks.push(run.mark)
  }
  loc.node.content = rebuild(text.slice(0, at.offset) + insText + text.slice(at.offset), [
    ...marks.slice(0, at.offset),
    ...insMarks,
    ...marks.slice(at.offset),
  ])
  return null
}

function defaultTail(type: InlineContainer['type']): 'paragraph' | 'listItem' {
  // Enter at the end of a heading/blockquote yields a paragraph (standard
  // editor UX); paragraphs continue as paragraphs; listItems as listItems.
  return type === 'listItem' ? 'listItem' : 'paragraph'
}

function applySplit(doc: DocNode, step: Extract<Step, { t: 'splitBlock' }>): string | null {
  const loc = findContainer(doc, step.at.block)
  if (!loc) return 'unknown_block'
  const { text, marks } = flatten(loc.node)
  if (step.at.offset < 0 || step.at.offset > text.length) return 'bad_offset'
  const tailType =
    step.tail?.type ?? (loc.node.type === 'paragraph' ? 'paragraph' : defaultTail(loc.node.type))
  const tailRuns = rebuild(text.slice(step.at.offset), marks.slice(step.at.offset))
  loc.node.content = rebuild(text.slice(0, step.at.offset), marks.slice(0, step.at.offset))

  if (loc.parentList) {
    // Splitting a listItem: tail must be a listItem in the same list.
    if (tailType !== 'listItem') return 'bad_split_tail'
    const item: ListItemNode = { id: step.newId, type: 'listItem', content: tailRuns }
    loc.parentList.children.splice(loc.itemIndex + 1, 0, item)
    return null
  }
  if (tailType === 'listItem') return 'bad_split_tail'
  const tail: BlockNode =
    tailType === 'heading'
      ? {
          id: step.newId,
          type: 'heading',
          attrs: { level: step.tail?.attrs?.level ?? 1 },
          content: tailRuns,
        }
      : { id: step.newId, type: tailType, content: tailRuns }
  doc.children.splice(loc.topIndex + 1, 0, tail)
  return null
}

function applyMerge(doc: DocNode, firstId: string, secondId: string): string | null {
  const a = findContainer(doc, firstId)
  const b = findContainer(doc, secondId)
  if (!a || !b) return 'unknown_block'
  if (a.parentList || b.parentList) {
    // listItem merges only within the SAME list, adjacent items.
    if (a.parentList !== b.parentList || b.itemIndex !== a.itemIndex + 1) return 'bad_merge'
    a.node.content = normalizeRuns([...a.node.content, ...b.node.content])
    a.parentList?.children.splice(b.itemIndex, 1)
    return null
  }
  if (b.topIndex !== a.topIndex + 1) return 'bad_merge'
  a.node.content = normalizeRuns([...a.node.content, ...b.node.content])
  doc.children.splice(b.topIndex, 1)
  return null
}

function applyInsertBlock(doc: DocNode, step: Extract<Step, { t: 'insertBlock' }>): string | null {
  const node = step.node
  if (node.type === 'listItem') {
    // Insert a listItem: after a sibling item, or at the start of `in` list.
    if (step.after !== null) {
      const sib = findContainer(doc, step.after)
      if (!sib?.parentList) return 'bad_insert_target'
      if (findsId(doc, node.id)) return 'I2_dup_id'
      sib.parentList.children.splice(sib.itemIndex + 1, 0, node)
      return null
    }
    if (!step.in) return 'bad_insert_target'
    const list = findTopBlock(doc, step.in)
    if (!list || list.node.type !== 'list') return 'bad_insert_target'
    if (findsId(doc, node.id)) return 'I2_dup_id'
    list.node.children.unshift(node)
    return null
  }
  if (findsId(doc, node.id)) return 'I2_dup_id'
  if (step.after === null) {
    doc.children.unshift(node)
    return null
  }
  const anchor = findTopBlock(doc, step.after)
  if (!anchor) return 'bad_insert_target'
  doc.children.splice(anchor.index + 1, 0, node)
  return null
}

function findsId(doc: DocNode, id: string): boolean {
  for (const b of doc.children) {
    if (b.id === id) return true
    if (b.type === 'list') for (const item of b.children) if (item.id === id) return true
  }
  return false
}

function applyRemoveBlock(doc: DocNode, id: string): string | null {
  const top = findTopBlock(doc, id)
  if (top) {
    doc.children.splice(top.index, 1)
    return null // I1 (doc non-empty) is checked at transaction level
  }
  const loc = findContainer(doc, id)
  if (!loc?.parentList) return 'unknown_block'
  if (loc.parentList.children.length <= 1) return 'last_item' // convert the list instead
  loc.parentList.children.splice(loc.itemIndex, 1)
  return null
}

function applySetBlockType(
  doc: DocNode,
  step: Extract<Step, { t: 'setBlockType' }>,
): string | null {
  const top = findTopBlock(doc, step.id)
  if (top) {
    const b = top.node
    if (step.type === 'list') {
      // Wrap an inline container into a single-item list. The container id
      // becomes the listItem id (Point stability); the list takes newId.
      if (!isInlineContainer(b)) return 'bad_convert'
      if (!step.newId) return 'missing_new_id'
      if (findsId(doc, step.newId)) return 'I2_dup_id'
      const attrs = step.attrs as ListAttrs | undefined
      doc.children[top.index] = {
        id: step.newId,
        type: 'list',
        attrs: { ordered: Boolean(attrs?.ordered) },
        children: [{ id: b.id, type: 'listItem', content: b.content }],
      }
      return null
    }
    if (b.type === 'list') {
      // Unwrap: only a single-item list converts back to an inline container.
      if (b.children.length !== 1) return 'bad_convert'
      const item = b.children[0] as ListItemNode
      doc.children[top.index] = makeContainer(step, item.id, item.content)
      return null
    }
    if (!isInlineContainer(b)) return 'bad_convert' // hr cannot retype
    doc.children[top.index] = makeContainer(step, b.id, b.content)
    return null
  }
  return 'unknown_block' // listItem retyping is not a step; commands compose primitives
}

function makeContainer(
  step: Extract<Step, { t: 'setBlockType' }>,
  id: string,
  content: TextNode[],
): BlockNode {
  if (step.type === 'heading') {
    const level = (step.attrs as HeadingAttrs | undefined)?.level ?? 1
    return {
      id,
      type: 'heading',
      attrs: { level: Math.min(3, Math.max(1, level)) as 1 | 2 | 3 }, // I5
      content,
    }
  }
  return { id, type: step.type as 'paragraph' | 'blockquote', content }
}

// ---------------------------------------------------------------------------
// invert — exact inverse of each step against the pre-application doc
// ---------------------------------------------------------------------------

export function invertStep(step: Step, docBefore: DocNode): Step {
  switch (step.t) {
    case 'insertText':
      return {
        t: 'deleteRange',
        from: step.at,
        to: { block: step.at.block, offset: step.at.offset + step.text.length },
      }
    case 'insertRuns': {
      let len = 0
      for (const run of step.runs) len += run.text.length
      return {
        t: 'deleteRange',
        from: step.at,
        to: { block: step.at.block, offset: step.at.offset + len },
      }
    }
    case 'deleteRange': {
      const loc = mustFind(docBefore, step.from.block)
      const { text, marks } = flatten(loc.node)
      const runs = rebuild(
        text.slice(step.from.offset, step.to.offset),
        marks.slice(step.from.offset, step.to.offset),
      )
      return { t: 'insertRuns', at: step.from, runs }
    }
    case 'setMark': {
      const loc = mustFind(docBefore, step.from.block)
      return { t: 'setRuns', id: step.from.block, runs: loc.node.content.map(cloneRun) }
    }
    case 'setRuns': {
      const loc = mustFind(docBefore, step.id)
      return { t: 'setRuns', id: step.id, runs: loc.node.content.map(cloneRun) }
    }
    case 'splitBlock':
      return { t: 'mergeBlock', first: step.at.block, second: step.newId }
    case 'mergeBlock': {
      const first = mustFind(docBefore, step.first)
      const second = mustFind(docBefore, step.second)
      const tail =
        second.node.type === 'heading'
          ? { type: 'heading' as const, attrs: { level: second.node.attrs.level } }
          : { type: second.node.type }
      return {
        t: 'splitBlock',
        at: { block: step.first, offset: containerLength(first.node) },
        newId: step.second,
        tail,
      }
    }
    case 'insertBlock':
      return { t: 'removeBlock', id: step.node.id }
    case 'removeBlock': {
      const top = findTopBlock(docBefore, step.id)
      if (top) {
        const prev = top.index > 0 ? (docBefore.children[top.index - 1] as BlockNode).id : null
        return { t: 'insertBlock', after: prev, node: structuredClone(top.node) }
      }
      const loc = mustFind(docBefore, step.id)
      const prevItem =
        loc.itemIndex > 0
          ? (loc.parentList as NonNullable<typeof loc.parentList>).children[loc.itemIndex - 1]
          : null
      return {
        t: 'insertBlock',
        after: prevItem ? prevItem.id : null,
        node: structuredClone(loc.node) as ListItemNode,
        ...(prevItem ? {} : { in: (loc.parentList as NonNullable<typeof loc.parentList>).id }),
      }
    }
    case 'setBlockType': {
      const top = findTopBlock(docBefore, step.id)
      if (!top) return step // unreachable for valid steps (apply would reject)
      const b = top.node
      if (step.type === 'list') {
        // inverse of wrap: unwrap the new list back to the original container
        if (b.type === 'heading')
          return {
            t: 'setBlockType',
            id: step.newId as string,
            type: 'heading',
            attrs: { level: b.attrs.level },
          }
        return {
          t: 'setBlockType',
          id: step.newId as string,
          type: b.type as 'paragraph' | 'blockquote',
        }
      }
      if (b.type === 'list') {
        // inverse of unwrap: re-wrap with the original list id + attrs
        return {
          t: 'setBlockType',
          id: step.id,
          type: 'list',
          attrs: { ordered: b.attrs.ordered },
          newId: b.id,
        }
      }
      if (b.type === 'heading')
        return { t: 'setBlockType', id: step.id, type: 'heading', attrs: { level: b.attrs.level } }
      return { t: 'setBlockType', id: step.id, type: b.type as 'paragraph' | 'blockquote' }
    }
    case 'setAttrs': {
      const top = findTopBlock(docBefore, step.id)
      if (!top) return step
      const b = top.node
      if (b.type === 'heading')
        return { t: 'setAttrs', id: step.id, attrs: { level: b.attrs.level } }
      if (b.type === 'list')
        return { t: 'setAttrs', id: step.id, attrs: { ordered: b.attrs.ordered } }
      return step
    }
  }
}

function cloneRun(run: TextNode): TextNode {
  return { text: run.text, mark: run.mark ? structuredClone(run.mark) : null }
}

function mustFind(doc: DocNode, id: string) {
  const loc = findContainer(doc, id)
  if (!loc) throw new Error(`editor: invert against missing container ${id}`)
  return loc
}

// ---------------------------------------------------------------------------
// mapPoint — forward-map a Point through a step (spec §1.2; collab substrate)
// ---------------------------------------------------------------------------

export function mapPoint(step: Step, p: Point): Point {
  switch (step.t) {
    case 'insertText':
    case 'insertRuns': {
      if (p.block !== step.at.block) return p
      let len = 0
      if (step.t === 'insertText') len = step.text.length
      else for (const run of step.runs) len += run.text.length
      return p.offset >= step.at.offset ? { block: p.block, offset: p.offset + len } : p
    }
    case 'deleteRange': {
      if (p.block !== step.from.block) return p
      if (p.offset <= step.from.offset) return p
      if (p.offset <= step.to.offset) return { block: p.block, offset: step.from.offset }
      return { block: p.block, offset: p.offset - (step.to.offset - step.from.offset) }
    }
    case 'splitBlock': {
      if (p.block !== step.at.block) return p
      if (p.offset <= step.at.offset) return p
      return { block: step.newId, offset: p.offset - step.at.offset }
    }
    case 'mergeBlock': {
      if (p.block !== step.second) return p
      // offset shifts by the length of `first` — mapped lazily by callers that
      // know docBefore; without it we can only re-anchor to the merged block.
      return { block: step.first, offset: p.offset }
    }
    case 'removeBlock':
      if (p.block === step.id) return { block: step.id, offset: 0 } // dangling; caller re-anchors
      return p
    case 'setMark':
    case 'setRuns':
    case 'insertBlock':
    case 'setBlockType':
    case 'setAttrs':
      return p
  }
}
