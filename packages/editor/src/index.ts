/**
 * @aihu/editor — hand-rolled, zero-third-party-dep, GX-governed rich-text
 * editor (architecture.md, Phase-0 amended).
 *
 * Two layers (spec §3.1):
 *  - EditorCore + serializers: plain TS, zero DOM — what a server or agent
 *    test harness drives.
 *  - EditorView: binds one core to one contenteditable root.
 * The `<aihu-editor>` SFC (components/editor.aihu) wraps the view.
 */

export type {
  AgentAccess,
  AgentCallResult,
  AgentProposal,
  DocOutlineEntry,
  SelectionContext,
} from './agent-gateway.ts'
export { AgentGateway } from './agent-gateway.ts'
export type { ActiveState, Command } from './commands.ts'
export { activeState, canExecute, executeCommand } from './commands.ts'
export { EditorCore } from './core.ts'
export {
  containerLength,
  containerText,
  emptyDoc,
  findContainer,
  inlineContainers,
  markAt,
  migrate,
  normalizeRuns,
  validateDoc,
} from './doc.ts'
export type { FeaturesConfig } from './features.ts'
export { defaultFeatures, resolveFeatures } from './features.ts'
export { freshId } from './id.ts'
export type { InputRule, InputRuleContext } from './input-rules.ts'
export { builtinRules, matchInputRules } from './input-rules.ts'
export {
  docEqualsIgnoringIds,
  fromMarkdown,
  parseInlineToRuns,
  toJSON,
  toMarkdown,
} from './markdown.ts'
export { plainTextToBlocks, sanitizeHtmlToBlocks } from './paste-sanitize.ts'
export { blockElOf, readDomSelection, toDom, toModel, writeDomSelection } from './position-map.ts'
export { diffToSteps, reconcileSteps, runsFromDom } from './readback.ts'
export { safeHref } from './safe-href.ts'
export { applyStep, invertStep, mapPoint } from './steps.ts'
export type {
  ApplyResult,
  BlockNode,
  Dispose,
  DocNode,
  HeadingAttrs,
  InlineContainer,
  ListAttrs,
  ListItemNode,
  Mark,
  Origin,
  Point,
  SelectionState,
  Step,
  TextNode,
  Transaction,
} from './types.ts'
export type { EditorViewOptions } from './view.ts'
export { EditorView } from './view.ts'
