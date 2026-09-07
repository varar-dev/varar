import { join } from 'node:path'
import { hashSource, type OathBaseline } from '@varar/core'
// buildOathResults/resultFilePath/toOathPath live in @varar/runner: the CLI and
// this reporter are two adapters of one port and must write identical records.
import { buildOathResults, resultFilePath, toOathPath } from '@varar/runner'
import { describe, expect, test } from 'vitest'
import { collectBaselines, collectFromModules, mergeLockFile } from '../src/reporter.ts'

const passed = { name: 'A', status: 'passed' as const, lines: [3] }
const failed = {
  name: 'B',
  status: 'failed' as const,
  lines: [5],
  failure: { line: 5, message: 'm', stack: 's', cells: [{ from: 1, to: 2, actual: '4' }] },
}

describe('buildOathResults', () => {
  test('wraps examples with version, path, and source hash', () => {
    const r = buildOathResults('docs/a.md', 'src', [passed, failed])
    expect(r).toEqual({
      version: 1,
      oathPath: 'docs/a.md',
      sourceHash: hashSource('src'),
      examples: [passed, failed],
    })
  })
})

describe('collectFromModules', () => {
  test('groups examples by moduleId via meta(), skips meta-less tests and empty modules', () => {
    const modules = [
      {
        moduleId: '/cwd/docs/a.md',
        children: {
          allTests: () => [
            { meta: () => ({ vararResult: passed }) },
            { meta: () => ({ vararResult: failed }) },
            { meta: () => ({}) }, // var:diagnostic-style test, no vararResult
          ],
        },
      },
      {
        moduleId: '/cwd/docs/empty.md',
        children: { allTests: () => [{ meta: () => ({}) }] },
      },
    ]
    const byFile = collectFromModules(modules)
    expect([...byFile.keys()]).toEqual(['/cwd/docs/a.md'])
    expect(byFile.get('/cwd/docs/a.md')).toEqual([passed, failed])
  })
})

describe('path helpers', () => {
  test('toOathPath returns a POSIX path relative to cwd', () => {
    const abs = join('/cwd', 'docs', 'a.md')
    expect(toOathPath(abs, '/cwd')).toBe('docs/a.md')
  })
  test('resultFilePath mirrors the oath path under .varar/', () => {
    expect(resultFilePath('docs/a.md', '/cwd')).toBe(join('/cwd', '.varar', 'docs/a.md.json'))
  })
})

const baselineA: OathBaseline = { sourceHash: 'ha', examples: [{ name: 'A', line: 3 }] }
const baselineB: OathBaseline = { sourceHash: 'hb', examples: [{ name: 'B', line: 5 }] }

describe('collectBaselines', () => {
  test('reads the derived baseline off each module’s own meta', () => {
    const modules = [
      { moduleId: '/cwd/docs/a.md', meta: () => ({ vararBaseline: baselineA }) },
      // An oath whose drift was not acknowledged parks nothing, so its
      // committed entry must survive untouched.
      { moduleId: '/cwd/docs/drifted.md', meta: () => ({}) },
    ]
    const byFile = collectBaselines(modules)
    expect([...byFile.keys()]).toEqual(['/cwd/docs/a.md'])
    expect(byFile.get('/cwd/docs/a.md')).toEqual(baselineA)
  })
})

describe('mergeLockFile', () => {
  test('a filtered run rewrites only what ran and keeps the rest', () => {
    const current = {
      version: 2 as const,
      oaths: { 'docs/a.md': baselineA, 'docs/b.md': baselineB },
    }
    const merged = mergeLockFile(current, new Map([['docs/a.md', baselineB]]))
    expect(merged.oaths).toEqual({ 'docs/a.md': baselineB, 'docs/b.md': baselineB })
  })

  test('records into an absent lock', () => {
    expect(mergeLockFile(null, new Map([['docs/a.md', baselineA]]))).toEqual({
      version: 2,
      oaths: { 'docs/a.md': baselineA },
    })
  })
})
