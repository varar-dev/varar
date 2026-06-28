import { VarResultsReporter } from './packages/var-vitest/src/reporter.js'
import { defineConfig } from 'vitest/config'

const root = new URL('.', import.meta.url).pathname

// Vitest 4 replaced `vitest.workspace.ts` + `defineWorkspace` with `test.projects`.
// Reporters are root-level in vitest 4 workspace mode — project reporters are ignored.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'docs/tutorial/vitest.config.ts'],
    reporters: ['default', new VarResultsReporter({ cwd: root })],
  },
})
