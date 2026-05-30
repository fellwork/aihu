import { cloudflare } from '@aihu/adapter-cloudflare'
import { defineConfig } from '@aihu/app'

export default defineConfig({
  adapter: cloudflare({ name: 'cf-adapter-demo', mode: 'workers' }),
})
