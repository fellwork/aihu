import { defineLoader } from '@aihu/server'
import type { Block } from '../../lib/parse-hn-markup.ts'
import { parseHnMarkup } from '../../lib/parse-hn-markup.ts'

const HN_API = 'https://hacker-news.firebaseio.com/v0'

export interface HnUser {
  readonly id: string
  readonly created: number
  readonly karma: number
  readonly about?: string
  readonly submitted?: number[]
}

interface UserLoaderResult {
  readonly user: HnUser
  /**
   * Parsed form of `user.about` — structured, not an HTML string. The route
   * renders these spans through escaped bindings; no `html={}` on this path.
   */
  readonly aboutBody: ReadonlyArray<Block>
}

export const loader = defineLoader(async (ctx): Promise<UserLoaderResult> => {
  const id = ctx.params.id
  if (!id) throw new Error('Missing user id')

  const r = await fetch(`${HN_API}/user/${encodeURIComponent(id)}.json`)
  const user = (await r.json()) as HnUser | null
  if (!user) throw new Error(`User not found: ${id}`)

  // Trust boundary — stranger-authored markup becomes structured data here,
  // so the route never needs an HTML sink. See `item/[id].loader.ts`.
  return { user, aboutBody: parseHnMarkup(user.about) }
})
