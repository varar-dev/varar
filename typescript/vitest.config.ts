import { defineConfig } from 'vitest/config'
import { VarResultsReporter } from './packages/var-vitest/src/reporter.js'

const root = new URL('.', import.meta.url).pathname

// Vitest 4 replaced `vitest.workspace.ts` + `defineWorkspace` with `test.projects`.
// Reporters are root-level in vitest 4 workspace mode — project reporters are ignored.
export default defineConfig({
  test: {
    projects: ['packages/*/vitest.config.ts'],
    reporters: ['default', new VarResultsReporter({ cwd: root })],
    // Coverage is root-level in vitest 4 workspace mode, like reporters.
    // Opt-in via `pnpm test:coverage`; reports land in coverage/ (text
    // summary + HTML + lcov for editor/CI integrations).
    coverage: {
      provider: 'v8',
      // The website is an app, not a published package, and is outside the
      // test gate (see CLAUDE.md) — keep its sources out of the report.
      include: ['packages/*/src/**'],
      exclude: ['packages/website/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
})
