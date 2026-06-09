import { expect, test } from 'vitest'
import { isKeywordLed, stripLeadingKeyword } from '../src/keywords.js'

test('isKeywordLed returns true for English Given/When/Then/And/But', () => {
  expect(isKeywordLed('Given I have 5 cukes')).toBe(true)
  expect(isKeywordLed('When I withdraw 40')).toBe(true)
  expect(isKeywordLed('Then I should have 60 left')).toBe(true)
  expect(isKeywordLed('And another thing')).toBe(true)
  expect(isKeywordLed('But not this one')).toBe(true)
})

test('isKeywordLed returns false for non-keyword sentences', () => {
  expect(isKeywordLed('I have 5 cukes')).toBe(false)
  expect(isKeywordLed('Some narration here')).toBe(false)
})

test('isKeywordLed recognizes other-locale keywords (e.g. French Étant donné)', () => {
  expect(isKeywordLed("Étant donné que j'ai 5 concombres")).toBe(true)
})

test('stripLeadingKeyword removes the keyword + following whitespace', () => {
  expect(stripLeadingKeyword('Given I have 5 cukes')).toBe('I have 5 cukes')
  expect(stripLeadingKeyword('Then I should have 60 left')).toBe('I should have 60 left')
})

test('stripLeadingKeyword leaves non-keyword sentences unchanged', () => {
  expect(stripLeadingKeyword('I have 5 cukes')).toBe('I have 5 cukes')
})
