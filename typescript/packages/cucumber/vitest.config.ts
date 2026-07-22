import vararPlugin from '@varar/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Point the plugin at THIS package's varar.config.json (not the repo-root one
  // which is scoped to the tutorial).
  plugins: [vararPlugin({ cwd: new URL('.', import.meta.url).pathname })],
  // Force a single `@varar/varar` instance so the steps registered via
  // `steps` (author side) and the registry glue (`@varar/varar/registry`)
  // share one module — otherwise the registry splits and no steps are seen.
  resolve: { dedupe: ['@varar/varar'] },
  test: {
    include: ['**/*.feature'],
    server: { deps: { inline: [/^@varar\//] } },
  },
})
