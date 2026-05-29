import { defineLoader } from '@aihu/server'
import { runWithContext } from '@aihu/context/ssr'
import { createContext, provide } from '@aihu/context'

interface PostBody {
  readonly title: string
  readonly body: string
  readonly readingTimeMs: number
}

/**
 * Context token carrying per-request reading metadata alongside the
 * route.data loader handoff. Demonstrates @aihu/context as a parallel
 * data channel — see [slug].aihu @state block for the inject call.
 */
export interface ReadingContext {
  slug: string
  estimatedReadingTimeMs: number
}

export const ReadingContextToken = createContext<ReadingContext>()

// Demo content. In a real app this would be a DB query, file read, or RPC.
const POSTS: Record<string, { title: string; body: string }> = {
  hello: {
    title: 'Hello, world',
    body: 'First post — rendered by the server loader and handed to the SFC via route.data.',
  },
  meta: {
    title: 'Why aihu is meta',
    body: 'Layered, separable, vanilla custom elements all the way down.',
  },
  agents: {
    title: 'Agents are first-class',
    body: 'Every component is MCP-readable through the @agent block.',
  },
}

/**
 * The loader runs server-side per matched route. Its return value is
 * serialised onto the SSR payload and injected as the `route.data` prop on
 * the SFC.
 *
 * See docs/site/data-fetching.md → "Server loaders → SFC handoff" for the
 * full handoff contract.
 */
export const loader = defineLoader(async (ctx): Promise<PostBody> => {
  const slug = ctx.params.slug
  const post = POSTS[slug]
  if (!post) throw new Error(`Post not found: ${slug}`)

  // Simulate a measurable server-side cost so the demo isn't purely synchronous.
  const start = Date.now()
  await new Promise((resolve) => setTimeout(resolve, 5))

  const result: PostBody = {
    title: post.title,
    body: post.body,
    readingTimeMs: Date.now() - start,
  }

  // Provide ReadingContext alongside route.data as a parallel data channel.
  // runWithContext scopes the provide call to this request's context map so
  // context values cannot leak across concurrent SSR requests.
  runWithContext(new Map(), () => {
    provide(ReadingContextToken, {
      slug,
      estimatedReadingTimeMs: result.readingTimeMs,
    })
  })

  return result
})
