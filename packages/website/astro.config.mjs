import mdx from '@astrojs/mdx'
import { defineConfig } from 'astro/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = resolve(__dirname, '../..')

const VAR_CONFIG_PATH = resolve(repoRoot, 'packages/var/src/config.ts')
const VAR_HANDLERS_PATH = resolve(repoRoot, 'packages/var-lsp/src/handlers.ts')

/** Vite plugin that stubs Node-only modules for the browser worker bundle.
 *  - packages/var/src/config.ts  — uses node:fs/path/url (loadVarConfig)
 *  - packages/var-lsp/src/handlers.ts — uses node:url (fileURLToPath in uriToPath)
 *    We replace uriToPath with a plain string-strip version for the browser.
 */
function browserifyNodePackages() {
  return {
    name: 'browserify-node-packages',
    enforce: 'pre',
    load(id) {
      if (id === VAR_CONFIG_PATH) {
        return `
export async function loadVarConfig(_cwd) {
  throw new Error('loadVarConfig is not available in the browser')
}
`
      }
      // handlers.ts uses fileURLToPath from node:url. Provide a browser-safe
      // version that strips file:// (same as server.ts's own uriToPath does).
      if (id === VAR_HANDLERS_PATH) {
        return null // let vite transform it normally but we patch below
      }
    },
    resolveId(id) {
      if (id === 'node:url' || id === 'node:path' || id === 'node:fs') {
        // Return a virtual module id
        return `\0virtual:${id}`
      }
    },
    load(id) {
      if (id === '\0virtual:node:url') {
        return `
export function fileURLToPath(url) {
  if (typeof url === 'string' && url.startsWith('file://')) {
    return url.slice('file://'.length)
  }
  return String(url)
}
export function pathToFileURL(path) {
  return new URL('file://' + path)
}
`
      }
      if (id === '\0virtual:node:path') {
        return `
export function resolve(...args) { return args.join('/').replace(/\\/\\//g, '/') }
export function join(...args) { return args.join('/').replace(/\\/\\//g, '/') }
export function basename(p, ext) { const b = p.split('/').pop() || ''; return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b }
export function dirname(p) { return p.split('/').slice(0, -1).join('/') || '/' }
export default { resolve, join, basename, dirname }
`
      }
      if (id === '\0virtual:node:fs') {
        return `
export function existsSync() { return false }
export default { existsSync }
`
      }
    },
  }
}

export default defineConfig({
  site: 'https://oselvar.github.io',
  base: '/var',
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [mdx()],
  vite: {
    plugins: [browserifyNodePackages()],
    worker: {
      plugins: () => [browserifyNodePackages()],
    },
  },
})
