import { defineConfig } from 'vitest/config'
import { stripTypescriptSourcemap } from '../../vitest.plugins.js'

export default defineConfig({
  // static-examples.ts pulls in @varar/language, which imports
  // `typescript` — inlined below, so vite transforms typescript.js and needs
  // its dangling sourcemap comment stripped (see vitest.plugins.ts).
  plugins: [stripTypescriptSourcemap()],
  test: {
    include: ['tests/**/*.test.ts'],
    // Vite by default treats workspace packages as node_modules and skips its
    // TS transform. Inline them so cross-package imports (e.g. `@varar/varar`)
    // resolve `./foo.js` → `./foo.ts` via vite's resolver, no build required.
    server: { deps: { inline: [/^@varar\//] } },
  },
})
