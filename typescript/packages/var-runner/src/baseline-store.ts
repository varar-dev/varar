import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BaselineStore } from '@varar/core'

// The committed drift baseline lives at the project root as varar.lock.json.
export function varLockPath(cwd: string): string {
  return join(cwd, 'varar.lock.json')
}

// The Node BaselineStore: varar.lock.json on disk. The core owns the format;
// this adapter only reads and writes the raw text.
export function createFileBaselineStore(cwd: string): BaselineStore {
  const path = varLockPath(cwd)
  return {
    read: () => (existsSync(path) ? readFileSync(path, 'utf8') : null),
    write: (contents: string) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, contents)
    },
  }
}
