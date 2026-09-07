import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { OathBaseline } from '@varar/core'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { VararResultsReporter } from '../src/reporter.ts'

// The reporter is the TypeScript port's baseline writer (ADR 0002). These cover
// the paths the adapter smoke contract cannot reach from outside: what a run
// does to a lock entry whose oath the docs globs no longer match.

const OATH = 'varar/a.md'
const baseline: OathBaseline = { sourceHash: 'h', examples: [{ name: 'A', line: 3 }] }

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'varar-reporter-'))
  writeFileSync(
    join(dir, 'varar.config.json'),
    JSON.stringify({ docs: { include: ['varar/**/*.md'], exclude: [] }, steps: [] }),
  )
  mkdirSync(join(dir, 'varar'), { recursive: true })
  writeFileSync(join(dir, OATH), '# A\n\nsomething happens\n')
  writeFileSync(
    join(dir, 'varar.lock.json'),
    JSON.stringify({ version: 2, oaths: { [OATH]: baseline, 'gone.md': baseline } }, null, 2),
  )
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.VARAR_UPDATE
})

function run(writeStderr: (s: string) => void = () => {}): Promise<void> {
  const modules = [
    {
      moduleId: join(dir, OATH),
      meta: () => ({ vararBaseline: baseline }),
      children: {
        allTests: () => [
          { meta: () => ({ vararResult: { name: 'A', status: 'passed', lines: [3] } }) },
        ],
      },
    },
  ]
  // The fakes are the structural slice of vitest's TestModule the reporter reads.
  return new VararResultsReporter({ cwd: dir, writeStderr }).onTestRunEnd(
    modules as unknown as Parameters<VararResultsReporter['onTestRunEnd']>[0],
  )
}

function lock(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, 'varar.lock.json'), 'utf8')).oaths
}

test('a plain run reports a stale baseline path but does not delete it', async () => {
  const err: string[] = []
  await run((s) => err.push(s))
  // stringifyLockFile sorts, so the committed bytes never depend on write order.
  expect(Object.keys(lock())).toEqual(['gone.md', OATH])
  expect(err.join('')).toContain('gone.md')
  expect(err.join('')).toContain('VARAR_UPDATE=1')
})

test('VARAR_UPDATE=1 prunes a baseline path the docs globs no longer match', async () => {
  process.env.VARAR_UPDATE = '1'
  const err: string[] = []
  await run((s) => err.push(s))
  expect(Object.keys(lock())).toEqual([OATH])
  expect(err.join('')).toContain('pruned gone.md')
})

test('writeBaseline: false leaves the lock alone entirely', async () => {
  const before = readFileSync(join(dir, 'varar.lock.json'), 'utf8')
  await new VararResultsReporter({ cwd: dir, writeBaseline: false }).onTestRunEnd([
    {
      moduleId: join(dir, OATH),
      meta: () => ({ vararBaseline: baseline }),
      children: {
        allTests: () => [
          { meta: () => ({ vararResult: { name: 'A', status: 'passed', lines: [3] } }) },
        ],
      },
    },
  ] as unknown as Parameters<VararResultsReporter['onTestRunEnd']>[0])
  expect(readFileSync(join(dir, 'varar.lock.json'), 'utf8')).toBe(before)
})
