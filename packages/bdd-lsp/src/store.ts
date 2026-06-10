import { readFileSync } from 'node:fs'
import { glob as nativeGlob } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadBddConfig } from '@oselvar/bdd'
import { type WorkspaceIndex, buildWorkspaceIndex } from '@oselvar/bdd-language'

export type Store = {
  reindex(workspaceRoot: string): Promise<void>
  index(): WorkspaceIndex
  workspaceRoot(): string
}

export function createStore(): Store {
  let current: WorkspaceIndex = { stepDefs: [], matches: [], diagnostics: [] }
  let root = ''
  return {
    async reindex(workspaceRoot: string) {
      root = workspaceRoot
      const cfg = await loadBddConfig(workspaceRoot)
      const stepPaths = await findFiles(workspaceRoot, cfg.steps)
      const bddPaths = await findFiles(workspaceRoot, cfg.bdds)
      const stepFiles = stepPaths.map((path) => ({
        path,
        source: readFileSync(path, 'utf8'),
      }))
      const bddFiles = bddPaths.map((path) => ({
        path,
        source: readFileSync(path, 'utf8'),
      }))
      current = buildWorkspaceIndex({ stepFiles, bddFiles })
    },
    index() {
      return current
    },
    workspaceRoot() {
      return root
    },
  }
}

const glob = nativeGlob as unknown as (
  pattern: string,
  opts: { cwd: string },
) => AsyncIterable<string>

async function findFiles(cwd: string, patterns: ReadonlyArray<string>): Promise<string[]> {
  const out: string[] = []
  const seen = new Set<string>()
  for (const pattern of patterns) {
    for await (const entry of glob(pattern, { cwd })) {
      const abs = resolve(cwd, entry)
      if (!seen.has(abs)) {
        seen.add(abs)
        out.push(abs)
      }
    }
  }
  return out
}
