import { expect, test } from 'vitest'
import { findHits } from '../src/matcher.js'
import { addStep, createRegistry } from '../src/registry.js'

function reg() {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 'steps.ts',
    expressionSourceLine: 5,
    handler: () => {},
  })
  return r
}

test('findHits returns no hits when nothing matches', () => {
  expect(findHits('hello world', reg())).toEqual([])
})

test('findHits returns one hit per step expression that matches', () => {
  const hits = findHits('Given I have 5 cukes in my belly', reg())
  expect(hits).toHaveLength(1)
  expect(hits[0]?.expression).toBe('I have {int} cukes')
  expect(hits[0]?.matchStart).toBe(6)
  expect(hits[0]?.matchEnd).toBe(20)
  expect(hits[0]?.args).toEqual([5])
})

test('findHits returns multiple hits when multiple expressions match non-overlapping ranges', () => {
  const hits = findHits('I have 5 cukes and I withdraw 3', reg())
  expect(hits.map((h) => h.expression)).toEqual(['I have {int} cukes', 'I withdraw {int}'])
})
