import vararPlugin from '@varar/vitest'
import { defineConfig } from 'vitest/config'

// The var plugin reads this project's varar.config.json and drives vitest's
// include/exclude from its globs — varar.config.json is the single source of
// truth for which `.md` files are specs and where the steps live.
const projectDir = new URL('.', import.meta.url).pathname

export default defineConfig({
  plugins: [vararPlugin({ cwd: projectDir })],
  test: {
    // Inline the var packages so the plugin and runtime are transformed by vite.
    server: { deps: { inline: [/^@varar\//] } },
  },
})
