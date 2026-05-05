import { defineLoader } from '@aihu/server'

interface PostBody {
  readonly title: string
  readonly body: string
  readonly readingTimeMs: number
}

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

  return {
    title: post.title,
    body: post.body,
    readingTimeMs: Date.now() - start,
  }
})
