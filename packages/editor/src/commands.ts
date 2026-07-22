/**
 * Commands — the closed union the toolbar, keyboard shortcuts, and GX
 * actions share (spec §9.1). Pure model logic: the CALLER resolves the live
 * selection from the DOM at dispatch time (amended per Phase-0, A4) and
 * passes it in; commands never read a cached selection themselves.
 */

import type { EditorCore } from './core.ts'
import { containerLength, findContainer, flatten } from './doc.ts'
import type { FeaturesConfig } from './features.ts'
import { resolveFeatures } from './features.ts'
import { freshId } from './id.ts'
import { safeHref } from './safe-href.ts'
import type { Mark, Origin, SelectionState, Step } from './types.ts'

export type Command =
  | { type: 'toggleMark'; mark: 'strong' | 'em' | 'code' }
  | { type: 'setLink'; href: string | null }
  | { type: 'setBlockType'; block: 'paragraph' | 'blockquote' }
  | { type: 'setBlockType'; block: 'heading'; level: 1 | 2 | 3 }
  | { type: 'toggleList'; ordered: boolean }
  | { type: 'insertHr' }
  | { type: 'undo' }
  | { type: 'redo' }

export interface ActiveState {
  marks: Set<'strong' | 'em' | 'code' | 'link'>
  blockType: 'paragraph' | 'heading' | 'blockquote' | 'listItem' | null
  headingLevel: 1 | 2 | 3 | null
  listOrdered: boolean | null
  canUndo: boolean
  canRedo: boolean
}

interface Ranged {
  block: string
  from: number
  to: number
}

function ordered(sel: SelectionState): Ranged | null {
  if (sel.type === 'caret') return { block: sel.at.block, from: sel.at.offset, to: sel.at.offset }
  if (sel.type === 'range') {
    if (sel.anchor.block !== sel.head.block) return null // cross-block commands are v2
    return {
      block: sel.anchor.block,
      from: Math.min(sel.anchor.offset, sel.head.offset),
      to: Math.max(sel.anchor.offset, sel.head.offset),
    }
  }
  return null
}

export function canExecute(
  core: EditorCore,
  sel: SelectionState | null,
  cmd: Command,
  features?: FeaturesConfig,
): boolean {
  const f = resolveFeatures(features)
  switch (cmd.type) {
    case 'undo':
      return core.canUndo()
    case 'redo':
      return core.canRedo()
    case 'toggleMark':
    case 'setLink': {
      if (cmd.type === 'setLink' && f.link === false) return false
      const r = sel ? ordered(sel) : null
      return !!r && r.to > r.from
    }
    case 'setBlockType': {
      if (cmd.block === 'heading' && f.headings === false) return false
      if (cmd.block === 'blockquote' && f.blockquote === false) return false
      const r = sel ? ordered(sel) : null
      if (!r) return false
      const loc = findContainer(core.doc(), r.block)
      return !!loc && !loc.parentList
    }
    case 'toggleList': {
      if (f.lists === false) return false
      const r = sel ? ordered(sel) : null
      if (!r) return false
      const loc = findContainer(core.doc(), r.block)
      if (!loc) return false
      if (loc.parentList)
        return loc.parentList.children.length === 1 || loc.parentList.attrs.ordered !== cmd.ordered
      return loc.node.type === 'paragraph'
    }
    case 'insertHr': {
      const r = sel ? ordered(sel) : null
      if (!r) return false
      const loc = findContainer(core.doc(), r.block)
      return !!loc && !loc.parentList
    }
  }
}

/**
 * Execute a command against the resolved selection. Returns true when a
 * transaction applied (origin `user.command`; `history` for undo/redo).
 */
export function executeCommand(
  core: EditorCore,
  sel: SelectionState | null,
  cmd: Command,
  features?: FeaturesConfig,
  origin: Origin = 'user.command',
): boolean {
  if (!canExecute(core, sel, cmd, features)) return false
  switch (cmd.type) {
    case 'undo':
      return core.undo()
    case 'redo':
      return core.redo()
    case 'toggleMark': {
      const r = ordered(sel as SelectionState) as Ranged
      const mark: Mark = { type: cmd.mark }
      const next = rangeHasMark(core, r, mark) ? null : mark
      return dispatchSel(
        core,
        origin,
        [
          {
            t: 'setMark',
            from: { block: r.block, offset: r.from },
            to: { block: r.block, offset: r.to },
            mark: next,
          },
        ],
        {
          type: 'range',
          anchor: { block: r.block, offset: r.from },
          head: { block: r.block, offset: r.to },
        },
      )
    }
    case 'setLink': {
      const r = ordered(sel as SelectionState) as Ranged
      let mark: Mark | null = null
      if (cmd.href !== null) {
        const encoded = encodeURI(cmd.href.trim())
        if (!safeHref(encoded) || /[\s)]/.test(encoded)) return false
        mark = { type: 'link', attrs: { href: encoded } }
      }
      return dispatchSel(
        core,
        origin,
        [
          {
            t: 'setMark',
            from: { block: r.block, offset: r.from },
            to: { block: r.block, offset: r.to },
            mark,
          },
        ],
        {
          type: 'range',
          anchor: { block: r.block, offset: r.from },
          head: { block: r.block, offset: r.to },
        },
      )
    }
    case 'setBlockType': {
      const r = ordered(sel as SelectionState) as Ranged
      const loc = findContainer(core.doc(), r.block)
      if (!loc) return false
      const steps: Step[] =
        cmd.block === 'heading'
          ? [{ t: 'setBlockType', id: r.block, type: 'heading', attrs: { level: cmd.level } }]
          : [{ t: 'setBlockType', id: r.block, type: cmd.block }]
      // toggling the same type back to paragraph
      if (
        cmd.block === 'heading' &&
        loc.node.type === 'heading' &&
        loc.node.attrs.level === cmd.level
      ) {
        steps[0] = { t: 'setBlockType', id: r.block, type: 'paragraph' }
      } else if (cmd.block === 'blockquote' && loc.node.type === 'blockquote') {
        steps[0] = { t: 'setBlockType', id: r.block, type: 'paragraph' }
      }
      return dispatchSel(core, origin, steps, keepSel(sel as SelectionState))
    }
    case 'toggleList': {
      const r = ordered(sel as SelectionState) as Ranged
      const loc = findContainer(core.doc(), r.block)
      if (!loc) return false
      if (loc.parentList) {
        if (loc.parentList.attrs.ordered !== cmd.ordered) {
          return dispatchSel(
            core,
            origin,
            [{ t: 'setAttrs', id: loc.parentList.id, attrs: { ordered: cmd.ordered } }],
            keepSel(sel as SelectionState),
          )
        }
        // unwrap single-item list back to paragraph
        if (loc.parentList.children.length === 1) {
          return dispatchSel(
            core,
            origin,
            [{ t: 'setBlockType', id: loc.parentList.id, type: 'paragraph' }],
            keepSel(sel as SelectionState),
          )
        }
        return false
      }
      return dispatchSel(
        core,
        origin,
        [
          {
            t: 'setBlockType',
            id: r.block,
            type: 'list',
            attrs: { ordered: cmd.ordered },
            newId: freshId(),
          },
        ],
        keepSel(sel as SelectionState),
      )
    }
    case 'insertHr': {
      const r = ordered(sel as SelectionState) as Ranged
      return dispatchSel(
        core,
        origin,
        [{ t: 'insertBlock', after: r.block, node: { id: freshId(), type: 'hr' } }],
        keepSel(sel as SelectionState),
      )
    }
  }
}

function keepSel(sel: SelectionState): SelectionState {
  return sel
}

function dispatchSel(
  core: EditorCore,
  origin: Origin,
  steps: Step[],
  selectionAfter: SelectionState,
): boolean {
  return core.dispatch(origin, steps, selectionAfter).ok
}

function rangeHasMark(core: EditorCore, r: Ranged, mark: Mark): boolean {
  const loc = findContainer(core.doc(), r.block)
  if (!loc) return false
  const { marks } = flatten(loc.node)
  if (r.to <= r.from) return false
  for (let i = r.from; i < r.to; i++) {
    const m = marks[i] ?? null
    if (!m || m.type !== mark.type) return false
  }
  return true
}

/** Toolbar-facing state (spec §9.2). */
export function activeState(core: EditorCore, sel: SelectionState | null): ActiveState {
  const state: ActiveState = {
    marks: new Set(),
    blockType: null,
    headingLevel: null,
    listOrdered: null,
    canUndo: core.canUndo(),
    canRedo: core.canRedo(),
  }
  const r = sel ? ordered(sel) : null
  if (!r) return state
  const loc = findContainer(core.doc(), r.block)
  if (!loc) return state
  state.blockType = loc.parentList ? 'listItem' : (loc.node.type as ActiveState['blockType'])
  if (loc.node.type === 'heading') state.headingLevel = loc.node.attrs.level
  if (loc.parentList) state.listOrdered = loc.parentList.attrs.ordered
  const { marks } = flatten(loc.node)
  if (r.to > r.from) {
    // range: a mark is active when EVERY code unit in the range carries it
    for (const t of ['strong', 'em', 'code', 'link'] as const) {
      let all = true
      for (let i = r.from; i < r.to; i++) {
        const m = marks[i] ?? null
        if (!m || m.type !== t) {
          all = false
          break
        }
      }
      if (all) state.marks.add(t)
    }
  } else if (r.from > 0 && r.from <= containerLength(loc.node)) {
    // caret: report the mark typed text would inherit (left neighbor)
    const left = marks[r.from - 1] ?? null
    if (left) state.marks.add(left.type)
  }
  return state
}
