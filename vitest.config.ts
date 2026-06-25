import { defineConfig } from 'vitest/config'

// Vitest 4 replaced `vitest.workspace.ts` + `defineWorkspace` with `test.projects`.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts', 'docs/tutorial/vitest.config.ts'],
  },
})
