import { expect, test } from 'vitest'
import { findHits, resolveHits } from '../src/matcher.ts'
import { addStep, createRegistry, defineParameterType } from '../src/registry.ts'

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

test('resolveHits picks longest-leftmost when ranges overlap', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have {int} cukes in my belly',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    handler: () => {},
  })
  const hits = findHits('I have 5 cukes in my belly', r)
  const result = resolveHits(hits)
  expect(result.kind).toBe('ok')
  if (result.kind !== 'ok') throw new Error('expected ok')
  expect(result.steps).toHaveLength(1)
  expect(result.steps[0]?.expression).toBe('I have {int} cukes in my belly')
})

test('resolveHits returns ambiguous when same start and same length match', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I have {int} {word}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    handler: () => {},
  })
  const hits = findHits('I have 5 cukes', r)
  const result = resolveHits(hits)
  expect(result.kind).toBe('ambiguous')
  if (result.kind !== 'ambiguous') throw new Error('expected ambiguous')
  expect(result.collisions).toHaveLength(1)
  expect(result.collisions[0]?.candidates).toHaveLength(2)
})

function greetReg() {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I greet {string}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  return r
}

test('paramInnerSpans excludes {string} quotes while paramSpans keeps them', () => {
  const sentence = 'Given I greet "hi there" warmly'
  const hits = findHits(sentence, greetReg())
  const hit = hits[0]
  if (!hit) throw new Error('expected a hit')
  const outer = hit.paramSpans[0]
  const inner = hit.paramInnerSpans[0]
  if (!outer || !inner) throw new Error('expected spans')
  expect(sentence.slice(outer.start, outer.end)).toBe('"hi there"')
  expect(sentence.slice(inner.start, inner.end)).toBe('hi there')
})

test('paramInnerSpans handles the single-quote {string} alternation branch', () => {
  const sentence = "I greet 'hi there'"
  const hits = findHits(sentence, greetReg())
  const hit = hits[0]
  if (!hit) throw new Error('expected a hit')
  const outer = hit.paramSpans[0]
  const inner = hit.paramInnerSpans[0]
  if (!outer || !inner) throw new Error('expected spans')
  expect(sentence.slice(outer.start, outer.end)).toBe("'hi there'")
  expect(sentence.slice(inner.start, inner.end)).toBe('hi there')
})

test('paramInnerSpans falls back to the whole match for group-less {int}', () => {
  const sentence = 'I have 42 cukes'
  const hits = findHits(sentence, reg())
  const hit = hits[0]
  if (!hit) throw new Error('expected a hit')
  expect(hit.paramInnerSpans).toEqual(hit.paramSpans)
  const inner = hit.paramInnerSpans[0]
  if (!inner) throw new Error('expected a span')
  expect(sentence.slice(inner.start, inner.end)).toBe('42')
})

test('a custom parameter type with a capture group highlights only the inner content', () => {
  let r = createRegistry()
  r = defineParameterType(r, { name: 'title', regexp: /\*([^*]+)\*/ })
  r = addStep(r, {
    expression: 'borrowed {title}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const sentence = 'Maya borrowed *Emma* today'
  const hits = findHits(sentence, r)
  const hit = hits[0]
  if (!hit) throw new Error('expected a hit')
  const outer = hit.paramSpans[0]
  const inner = hit.paramInnerSpans[0]
  if (!outer || !inner) throw new Error('expected spans')
  expect(sentence.slice(outer.start, outer.end)).toBe('*Emma*')
  expect(sentence.slice(inner.start, inner.end)).toBe('Emma')
})

test('a custom parameter type with no capture group highlights the whole match', () => {
  let r = createRegistry()
  r = defineParameterType(r, {
    name: 'title',
    regexp: /\+[^+]+\+/,
    parse: (raw) => raw.slice(1, -1),
  })
  r = addStep(r, {
    expression: 'borrowed {title}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  const sentence = 'Maya borrowed +Emma+ today'
  const hits = findHits(sentence, r)
  const hit = hits[0]
  if (!hit) throw new Error('expected a hit')
  expect(hit.paramInnerSpans).toEqual(hit.paramSpans)
  const inner = hit.paramInnerSpans[0]
  if (!inner) throw new Error('expected a span')
  expect(sentence.slice(inner.start, inner.end)).toBe('+Emma+')
})

test('resolveHits returns all non-overlapping hits left-to-right', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} cukes',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I withdraw {int}',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    handler: () => {},
  })
  const hits = findHits('Given I have 5 cukes and I withdraw 3', r)
  const result = resolveHits(hits)
  if (result.kind !== 'ok') throw new Error('expected ok')
  expect(result.steps.map((s) => s.expression)).toEqual(['I have {int} cukes', 'I withdraw {int}'])
})
