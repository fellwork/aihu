import { defineAihuConfig } from '@aihu/server'
import { cloudflare } from '@aihu/adapter-cloudflare'

// apps/docs — the Aihu documentation site, dogfooding the Cloudflare Pages adapter.
// arch-1 §3.2 + §4.1
export default defineAihuConfig({
  adapter: cloudflare(),
  build: { target: 'universal' },
})
