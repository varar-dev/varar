import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

// typescript's published `typescript.js` ends with a
// `//# sourceMappingURL=typescript.js.map` comment, but the `.map` is not
// shipped. Any vitest project that inlines a workspace package importing
// `typescript` (var-language/var-lsp via `import * as ts`, the website via
// ts-diagnostics.ts) makes vite transform `typescript.js`, and its sourcemap
// extraction then logs a noisy ENOENT for the missing map. Strip the dangling
// comment in `load` — before vite reads the map — so the file still transforms
// (the language-service tests need it) but vite never looks for the missing map.
export function stripTypescriptSourcemap(): Plugin {
  return {
    name: 'strip-typescript-sourcemap',
    enforce: 'pre',
    load(id) {
      const path = id.split('?')[0] ?? id
      if (!path.endsWith('/typescript/lib/typescript.js')) return null
      const code = readFileSync(path, 'utf8')
      return code.replace(/\n\/\/# sourceMappingURL=typescript\.js\.map\s*$/, '\n')
    },
  }
}
