import { demo } from '@aihu/plugin-demo'
import { defineAihuConfig } from '@aihu/server'

export default defineAihuConfig({
  plugins: [demo()],
})
