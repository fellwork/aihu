import type { BlockNode, DocNode, ListItemNode, Mark, TextNode } from '../src/types.ts'

let n = 0
export function tid(): string {
  n += 1
  return `t_${n}`
}

export function run(text: string, mark: Mark | null = null): TextNode {
  return { text, mark }
}

export function para(id: string, ...content: TextNode[]): BlockNode {
  return { id, type: 'paragraph', content }
}

export function heading(id: string, level: 1 | 2 | 3, ...content: TextNode[]): BlockNode {
  return { id, type: 'heading', attrs: { level }, content }
}

export function quote(id: string, ...content: TextNode[]): BlockNode {
  return { id, type: 'blockquote', content }
}

export function item(id: string, ...content: TextNode[]): ListItemNode {
  return { id, type: 'listItem', content }
}

export function list(id: string, ordered: boolean, ...children: ListItemNode[]): BlockNode {
  return { id, type: 'list', attrs: { ordered }, children }
}

export function hr(id: string): BlockNode {
  return { id, type: 'hr' }
}

export function doc(...children: BlockNode[]): DocNode {
  return { schema: 'aihu-editor/doc', version: 1, children }
}
