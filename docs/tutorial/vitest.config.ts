import bdd from '@oselvar/bdd-vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [bdd({ cwd: new URL('../..', import.meta.url).pathname })],
  test: {
    include: ['**/*.bdd.md'],
  },
})
