import { defineLoader } from '@aihu/server'
import { sanitizeHnHtml } from '../../lib/sanitize-hn-html.ts'

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
}

export const loader = defineLoader(async (ctx): Promise<UserLoaderResult> => {
  const id = ctx.params.id
  if (!id) throw new Error('Missing user id')

  const r = await fetch(`${HN_API}/user/${encodeURIComponent(id)}.json`)
  const user = (await r.json()) as HnUser | null
  if (!user) throw new Error(`User not found: ${id}`)

  // Trust boundary — `about` is stranger-authored HTML rendered through an
  // `html={}` binding, which SSR interpolates raw into served bytes. See the
  // note in `item/[id].loader.ts`.
  return { user: user.about === undefined ? user : { ...user, about: sanitizeHnHtml(user.about) } }
})
