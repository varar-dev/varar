import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { createFileBaselineStore, varLockPath } from '../src/baseline-store.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'var-baseline-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('read returns null when var.lock.json is absent', () => {
  expect(createFileBaselineStore(dir).read()).toBeNull()
})

test('write then read round-trips the raw contents', () => {
  const store = createFileBaselineStore(dir)
  store.write('{"version":1,"specs":{}}\n')
  expect(store.read()).toBe('{"version":1,"specs":{}}\n')
  // Written to var.lock.json at the project root.
  expect(readFileSync(varLockPath(dir), 'utf8')).toBe('{"version":1,"specs":{}}\n')
})

test('read picks up an externally written lockfile', () => {
  writeFileSync(varLockPath(dir), '{"version":1,"specs":{"a.md":{"sourceHash":"x","examples":[]}}}')
  expect(createFileBaselineStore(dir).read()).toContain('a.md')
})
