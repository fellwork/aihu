import { defineLoader } from '@aihu/server'

const HN_API = 'https://hacker-news.firebaseio.com/v0'
const PAGE_SIZE = 30

export interface Story {
  readonly id: number
  readonly title: string
  readonly url?: string
  readonly by: string
  readonly score: number
  readonly time: number
  readonly descendants?: number
}

interface IndexLoaderResult {
  readonly stories: ReadonlyArray<Story>
  readonly page: number
  readonly hasMore: boolean
}

/**
 * Loader for the top-stories page. Reads `?page=N` from the URL
 * (default 1), pages over `topstories.json` (500 ids), then fans
 * out a parallel fetch for each id on the page.
 */
export const loader = defineLoader(async (ctx): Promise<IndexLoaderResult> => {
  const pageParam = ctx.url.searchParams.get('page')
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1)

  const idsRes = await fetch(`${HN_API}/topstories.json`)
  const ids = (await idsRes.json()) as number[]
  const start = (page - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE
  const pageIds = ids.slice(start, end)

  const stories = await Promise.all(
    pageIds.map(async (id) => {
      const r = await fetch(`${HN_API}/item/${id}.json`)
      return (await r.json()) as Story
    }),
  )

  return {
    stories: stories.filter((s) => s != null),
    page,
    hasMore: end < ids.length,
  }
})
