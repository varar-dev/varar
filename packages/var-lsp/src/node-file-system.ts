import { readFileSync, writeFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { FileSystem } from './file-system.js'

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

export function createNodeFileSystem(root: string): FileSystem {
  return {
    async list(patterns) {
      const out: string[] = []
      const seen = new Set<string>()
      for (const pattern of patterns) {
        for await (const rel of glob(pattern, { cwd: root })) {
          const abs = resolve(root, rel)
          if (!seen.has(abs)) {
            seen.add(abs)
            out.push(abs)
          }
        }
      }
      return out
    },
    async read(path) {
      return readFileSync(path, 'utf8')
    },
    async write(path, content) {
      writeFileSync(path, content, 'utf8')
    },
  }
}
