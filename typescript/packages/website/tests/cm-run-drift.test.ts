import type { Drift } from '@oselvar/var-core'
import { expect, test } from 'vitest'
import { driftDiagnostics } from '../src/lib/cm-run.ts'

// A drifted paragraph in the editor: an amber warning over its span, with the
// paragraph name in the message. Pure projection — no CodeMirror state needed.
test('driftDiagnostics maps a drift to a warning over its span', () => {
  const drift: Drift = {
    name: 'Ben borrowed Dune',
    line: 8,
    span: { startOffset: 100, endOffset: 160, startLine: 8, startCol: 1, endLine: 9, endCol: 10 },
  }
  const diags = driftDiagnostics([drift])
  expect(diags).toHaveLength(1)
  expect(diags[0]?.from).toBe(100)
  expect(diags[0]?.to).toBe(160)
  expect(diags[0]?.severity).toBe('warning')
  expect(diags[0]?.message).toContain('Ben borrowed Dune')
})

test('driftDiagnostics is empty when there is no drift', () => {
  expect(driftDiagnostics([])).toEqual([])
})
