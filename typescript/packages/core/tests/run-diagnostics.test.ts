import { expect, test } from 'vitest'
import { hashSource } from '../src/hash.ts'
import type { OathResults } from '../src/result.ts'
import { runResultDiagnostics } from '../src/run-diagnostics.ts'

function results(source: string, examples: OathResults['examples']): OathResults {
  return { version: 1, oathPath: 's.md', sourceHash: hashSource(source), examples }
}

test('cell mismatch → one diagnostic per cell with expected/actual message', () => {
  const source = 'x 6 y'
  const r = results(source, [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 2, to: 3, message: 'expected 6 but was 50' },
  ])
})

test('whole-table mismatch yields multiple cell diagnostics', () => {
  const source = 'a 1 b 2 c'
  const r = results(source, [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: {
        line: 1,
        message: 'm',
        stack: 's',
        cells: [
          { from: 2, to: 3, actual: '9' },
          { from: 6, to: 7, actual: '8' },
        ],
      },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 2, to: 3, message: 'expected 1 but was 9' },
    { from: 6, to: 7, message: 'expected 2 but was 8' },
  ])
})

test('doc-string cell mismatch → one diagnostic on the body span', () => {
  const source = 'say:\nHello!\n'
  const r = results(source, [
    {
      name: 'd',
      status: 'failed',
      lines: [2],
      failure: { line: 2, message: 'm', stack: 's', cells: [{ from: 5, to: 11, actual: 'Bye' }] },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 5, to: 11, message: 'expected Hello! but was Bye' },
  ])
})

test('plain throw with no anchor (an older result) → a diagnostic spanning the failing line', () => {
  const source = 'line one\nline two\nline three'
  const r = results(source, [
    { name: 'p', status: 'failed', lines: [2], failure: { line: 2, message: 'boom', stack: 's' } },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([{ from: 9, to: 17, message: 'boom' }])
})

test('plain throw with an anchor → a diagnostic over the failing step, not its whole line', () => {
  const source = 'He asks on June 10, and the library agrees.'
  const r = results(source, [
    {
      name: 'p',
      status: 'failed',
      lines: [1],
      // 'the library agrees' — the sensor that threw, sharing a line with a stimulus
      failure: { line: 1, message: 'boom', stack: 's', anchor: { from: 24, to: 42 } },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([{ from: 24, to: 42, message: 'boom' }])
})

test('an anchor that does not fit the source falls back to the failing line', () => {
  const source = 'one\ntwo'
  const beyond = { line: 2, message: 'boom', stack: 's', anchor: { from: 4, to: 999 } }
  const empty = { line: 2, message: 'boom', stack: 's', anchor: { from: 4, to: 4 } }
  for (const failure of [beyond, empty]) {
    const r = results(source, [{ name: 'p', status: 'failed', lines: [2], failure }])
    expect(runResultDiagnostics(r, source)).toEqual([{ from: 4, to: 7, message: 'boom' }])
  }
})

test('cells win over the anchor — a mismatched cell is more precise than its step', () => {
  const source = 'x 6 y'
  const r = results(source, [
    {
      name: 'r',
      status: 'failed',
      lines: [1],
      failure: {
        line: 1,
        message: 'm',
        stack: 's',
        cells: [{ from: 2, to: 3, actual: '50' }],
        anchor: { from: 0, to: 5 },
      },
    },
  ])
  expect(runResultDiagnostics(r, source)).toEqual([
    { from: 2, to: 3, message: 'expected 6 but was 50' },
  ])
})

test('stale sourceHash → no diagnostics', () => {
  const source = 'x 6 y'
  const r: OathResults = {
    version: 1,
    oathPath: 's.md',
    sourceHash: 'fnv1a:00000000',
    examples: [
      {
        name: 'r',
        status: 'failed',
        lines: [1],
        failure: { line: 1, message: 'm', stack: 's', cells: [{ from: 2, to: 3, actual: '50' }] },
      },
    ],
  }
  expect(runResultDiagnostics(r, source)).toEqual([])
})

test('all-passed results → no diagnostics', () => {
  const source = 'whatever'
  const r = results(source, [{ name: 'ok', status: 'passed', lines: [1] }])
  expect(runResultDiagnostics(r, source)).toEqual([])
})
