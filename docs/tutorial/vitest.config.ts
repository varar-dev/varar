import varPlugin from '@oselvar/var-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [varPlugin({ cwd: new URL('../..', import.meta.url).pathname })],
  test: {
    include: ['**/*.var.md'],
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
