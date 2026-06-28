import varPlugin from '@oselvar/var-vitest'
import { VarResultsReporter } from '@oselvar/var-vitest/reporter'
import { defineConfig } from 'vitest/config'

const root = new URL('../..', import.meta.url).pathname

export default defineConfig({
  plugins: [varPlugin({ cwd: root })],
  test: {
    include: ['**/*.var.md'],
    reporters: ['default', new VarResultsReporter({ cwd: root })],
    // Inline workspace packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
