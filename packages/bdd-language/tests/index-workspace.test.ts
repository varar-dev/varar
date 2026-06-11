import { expect, test } from 'vitest'
import { buildWorkspaceIndex } from '../src/index-workspace.js'

test('cross-references matched substrings in .bdd.md to their step defs', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/abs/steps/account.steps.ts',
        source: `step('I have {int} cukes', (ctx, n) => {})
`,
      },
    ],
    bddFiles: [
      {
        path: '/abs/belly.bdd.md',
        source: '# Belly\n\nGiven I have 5 cukes',
      },
    ],
  })
  expect(idx.stepDefs).toHaveLength(1)
  expect(idx.matches).toHaveLength(1)
  const m = idx.matches[0]
  expect(m?.bddPath).toBe('/abs/belly.bdd.md')
  expect(m?.stepDef.expression).toBe('I have {int} cukes')
  // Match starts somewhere inside line 3 (the body).
  expect(m?.range.start.line).toBe(3)
})

test('an unmatched keyword-led sentence produces NO diagnostic (no Given/When/Then heuristic)', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [],
    bddFiles: [{ path: '/m.bdd.md', source: '# M\n\nGiven I have 5 cukes' }],
  })
  expect(idx.diagnostics).toEqual([])
})

test('ambiguous matches surface as ambiguous-match diagnostics', () => {
  const idx = buildWorkspaceIndex({
    stepFiles: [
      {
        path: '/s.ts',
        source: `step('I have {int} cukes', () => {})
step('I have {int} {word}', () => {})
`,
      },
    ],
    bddFiles: [{ path: '/a.bdd.md', source: '# Ambig\n\nGiven I have 5 cukes' }],
  })
  const codes = idx.diagnostics.map((d) => d.code)
  expect(codes).toContain('ambiguous-match')
})

test('the index is empty for an empty workspace', () => {
  const idx = buildWorkspaceIndex({ stepFiles: [], bddFiles: [] })
  expect(idx.stepDefs).toEqual([])
  expect(idx.matches).toEqual([])
  expect(idx.diagnostics).toEqual([])
})
