import { expect, test } from 'vitest'
import { discoverStepDefs } from '../src/step-defs.js'

test('discovers a single step call with its source range', () => {
  const source = `import { step } from '@oselvar/bdd-vitest'
step('I have {int} cukes', (ctx, n) => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.expression).toBe('I have {int} cukes')
  // The expression literal starts at character 5 of line 2 (1-based).
  expect(defs[0]?.expressionRange.start.line).toBe(2)
  expect(defs[0]?.callRange.start.line).toBe(2)
})

test('discovers multiple step calls across the file', () => {
  const source = `import { step } from '@oselvar/bdd-vitest'
step('first', () => {})
step('second', () => {})
step('third', () => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs.map((d) => d.expression)).toEqual(['first', 'second', 'third'])
})

test('handles the destructured-step pattern: const { step } = defineContext(...)', () => {
  const source = `import { defineContext } from '@oselvar/bdd-vitest'
const { step } = defineContext(() => ({}))
step('I greet {string}', (ctx, name: string) => {})
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(1)
  expect(defs[0]?.expression).toBe('I greet {string}')
})

test('ignores `step` in unrelated positions (e.g. shadowed locals, comments)', () => {
  const source = `// step('not a real step', () => {})
function step() {}
const obj = { step: 1 }
`
  const defs = discoverStepDefs('steps.ts', source)
  expect(defs).toHaveLength(0)
})

test('returns empty array for a file with no step calls', () => {
  expect(discoverStepDefs('empty.ts', '')).toEqual([])
  expect(discoverStepDefs('empty.ts', 'const x = 1\n')).toEqual([])
})
