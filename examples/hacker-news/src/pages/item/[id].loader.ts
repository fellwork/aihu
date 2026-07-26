import { defineLoader } from '@aihu/server'
import type { Block } from '../../lib/parse-hn-markup.ts'
import { parseHnMarkup } from '../../lib/parse-hn-markup.ts'

const HN_API = 'https://hacker-news.firebaseio.com/v0'
const MAX_DEPTH = 6
const MAX_COMMENTS_PER_LEVEL = 50

export interface HnItem {
  readonly id: number
  readonly type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt'
  readonly by?: string
  readonly text?: string
  readonly title?: string
  readonly url?: string
  readonly score?: number
  readonly time?: number
  readonly kids?: number[]
  readonly descendants?: number
  readonly deleted?: boolean
  readonly dead?: boolean
}

export interface CommentNode {
  readonly id: number
  readonly by: string
  /**
   * Structured, NOT an HTML string. The route renders these spans through
   * ordinary escaped bindings; there is no `html={}` on this data path.
   */
  readonly body: ReadonlyArray<Block>
  readonly time: number
  readonly children: ReadonlyArray<CommentNode>
}

interface ItemLoaderResult {
  readonly story: HnItem
  /** Parsed form of `story.text` — see the note on CommentNode.body. */
  readonly storyBody: ReadonlyArray<Block>
  readonly comments: ReadonlyArray<CommentNode>
}

async function fetchItem(id: number): Promise<HnItem | null> {
  const r = await fetch(`${HN_API}/item/${id}.json`)
  return (await r.json()) as HnItem | null
}

async function fetchComments(ids: ReadonlyArray<number>, depth: number): Promise<CommentNode[]> {
  if (depth >= MAX_DEPTH) return []
  const slice = ids.slice(0, MAX_COMMENTS_PER_LEVEL)
  const items = await Promise.all(slice.map((id) => fetchItem(id)))
  const out: CommentNode[] = []
  for (const c of items) {
    if (!c || c.deleted || c.dead) continue
    const children = c.kids?.length ? await fetchComments(c.kids, depth + 1) : []
    out.push({
      id: c.id,
      by: c.by ?? 'anonymous',
      // The trust boundary. Stranger-authored markup becomes structured data
      // HERE, once, for every comment at every depth — so no render site has
      // to remember, and none of them needs `html={}`.
      body: parseHnMarkup(c.text),
      time: c.time ?? 0,
      children,
    })
  }
  return out
}

/**
 * Loader for a story-detail page. Fetches the story, then walks its
 * `kids` tree breadth-first. Bounded by MAX_DEPTH and
 * MAX_COMMENTS_PER_LEVEL to keep the loader payload reasonable.
 */
export const loader = defineLoader(async (ctx): Promise<ItemLoaderResult> => {
  const id = Number.parseInt(ctx.params.id ?? '0', 10)
  if (!Number.isFinite(id) || id <= 0) throw new Error('Invalid item id')

  const story = await fetchItem(id)
  if (!story) throw new Error(`Item not found: ${id}`)

  const comments = story.kids?.length ? await fetchComments(story.kids, 0) : []

  return { story, storyBody: parseHnMarkup(story.text), comments }
})
