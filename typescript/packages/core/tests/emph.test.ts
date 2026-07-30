import { expect, test } from 'vitest'
import { findHits } from '../src/matcher.ts'
import { addStep, createRegistry } from '../src/registry.ts'

function emphReg() {
  return addStep(createRegistry(), {
    expression: 'the book {emph}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
}

test.each([
  ['*Emma*', 'Emma'],
  ['_Emma_', 'Emma'],
  ['**Emma**', 'Emma'],
  ['__Emma__', 'Emma'],
  ['***Emma***', 'Emma'],
  ['___Emma___', 'Emma'],
  // Mixed delimiters: only the outermost pair is stripped.
  ['**_Emma_**', '_Emma_'],
])('{emph} matches %s and passes the inner value %s', (notation, value) => {
  const sentence = `the book ${notation}`
  const hits = findHits(sentence, emphReg())
  const hit = hits[0]
  if (!hit) throw new Error(`expected a hit for ${notation}`)
  expect(hit.args).toEqual([value])
  // The highlighted (inner) span covers the value, not the delimiters.
  const inner = hit.paramInnerSpans[0]
  if (!inner) throw new Error('expected an inner span')
  expect(sentence.slice(inner.start, inner.end)).toBe(value)
  // The full-notation span still covers the delimiters.
  const outer = hit.paramSpans[0]
  if (!outer) throw new Error('expected an outer span')
  expect(sentence.slice(outer.start, outer.end)).toBe(notation)
})

test('{emph} format renders a value back in single-asterisk emphasis', () => {
  const hit = findHits('the book *Emma*', emphReg())[0]
  if (!hit) throw new Error('expected a hit')
  const format = hit.formats[0]
  if (!format) throw new Error('expected an emph format')
  expect(format('Emma')).toBe('*Emma*')
})
