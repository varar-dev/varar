import type { FileSystem } from '@oselvar/var-lsp'

export function createMapFileSystem(initial: Record<string, string> = {}): FileSystem {
  const map = new Map(Object.entries(initial))
  return {
    async list(globs) {
      const exts = globs.map((g) => g.slice(g.lastIndexOf('.')))
      return [...map.keys()].filter((p) => exts.some((e) => p.endsWith(e)))
    },
    async read(path) {
      const v = map.get(path)
      if (v === undefined) throw new Error(`no such file: ${path}`)
      return v
    },
    async write(path, content) {
      map.set(path, content)
    },
  }
}
