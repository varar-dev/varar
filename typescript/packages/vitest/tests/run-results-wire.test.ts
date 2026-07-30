import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { OathResults } from '@varar/core'
import { expect, test } from 'vitest'

// The cross-port wire format of .varar/<oathPath>.json (ADR 0014). Every port
// builds this same value and must serialize it byte-for-byte identically — see
// conformance/run-results/README.md for what that pins and why the bundle
// goldens don't cover it.
const EXPECTED = resolve(import.meta.dirname, '../../../../conformance/run-results/expected.json')

const results: OathResults = {
  version: 1,
  oathPath: 'varar/library.md',
  sourceHash: 'fnv1a:1622dfca',
  examples: [
    { name: 'Maya borrowed *Emma*, due back on June 1, 2026', status: 'passed', lines: [3, 4] },
    {
      name: 'Ben borrowed *Dune* for £2.50 & kept it',
      status: 'failed',
      lines: [13, 14],
      failure: {
        line: 14,
        message: 'expected £2.50 but was £3.00\nand the library <refused>',
        stack: '<stack>',
        cells: [{ from: 71, to: 77, actual: '£3.00' }],
        anchor: { from: 60, to: 90 },
      },
    },
    {
      name: 'Noor borrowed *Kindred*',
      status: 'failed',
      lines: [8, 9],
      failure: { line: 9, message: 'expected the library to refuse', stack: '<stack>' },
    },
  ],
}

test('the run-result wire format matches the cross-port fixture', () => {
  // Exactly what the reporter writes — this port IS the reference, so the
  // fixture is regenerated from here when the format changes deliberately.
  expect(`${JSON.stringify(results, null, 2)}\n`).toBe(readFileSync(EXPECTED, 'utf8'))
})
