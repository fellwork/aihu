import { defineLoader } from '@scribe/server'

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

  return { user }
})
