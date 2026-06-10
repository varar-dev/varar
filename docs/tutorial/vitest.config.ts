import bdd from '@oselvar/bdd-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [bdd({ cwd: new URL('../..', import.meta.url).pathname })],
  test: {
    include: ['**/*.bdd.md'],
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
