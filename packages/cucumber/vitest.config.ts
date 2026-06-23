import varPlugin from '@oselvar/var-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Point the plugin at THIS package's var.config.ts (not the repo-root one
  // which is scoped to the tutorial).
  plugins: [varPlugin({ cwd: new URL('.', import.meta.url).pathname })],
  // Vite follows symlinks by default. Setting preserveSymlinks keeps the
  // resolved path as `library.feature.var.md` so the var plugin sees the
  // intended extension instead of vite trying to parse `library.feature`
  // as JavaScript.
  resolve: { preserveSymlinks: true },
  test: {
    include: ['**/*.var.md'],
    server: { deps: { inline: [/^@oselvar\//] } },
  },
})
