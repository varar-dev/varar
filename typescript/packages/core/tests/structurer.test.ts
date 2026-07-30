import { expect, test } from 'vitest'
import type { Doc } from '../src/ast.ts'
import { scan } from '../src/scanner.ts'
import { structure } from '../src/structurer.ts'

test('every paragraph becomes a candidate Example, scoped by the headings above it', () => {
  const source =
    '# Withdrawing cash\n\nGiven I have $100 in my account\n\n# Overdraft\n\nGiven I have $10 in my account'
  const doc: Doc = structure('test.md', source, scan(source))
  expect(doc.examples).toHaveLength(2)
  expect(doc.examples[0]?.scopeStack).toEqual(['Withdrawing cash'])
  expect(doc.examples[1]?.scopeStack).toEqual(['Overdraft'])
})

test('two paragraphs under the same heading each become a separate Example', () => {
  const source = '## Example\n\nFirst paragraph.\n\nSecond paragraph.'
  const doc = structure('test.md', source, scan(source))
  expect(doc.examples).toHaveLength(2)
  expect(doc.examples[0]?.body[0]?.kind).toBe('paragraph')
  expect(doc.examples[1]?.body[0]?.kind).toBe('paragraph')
  expect(doc.examples[0]?.scopeStack).toEqual(['Example'])
  expect(doc.examples[1]?.scopeStack).toEqual(['Example'])
})

test('nested headings stack into an outer→inner scopeStack', () => {
  const source = '## Outer\n\nbody one\n\n### Inner\n\nbody two'
  const doc = structure('test.md', source, scan(source))
  expect(doc.examples).toHaveLength(2)
  expect(doc.examples[0]?.scopeStack).toEqual(['Outer'])
  expect(doc.examples[1]?.scopeStack).toEqual(['Outer', 'Inner'])
})

test('a heading at the same level pops the previous sibling off the scope stack', () => {
  const source = '## A\n\nbody A\n\n## B\n\nbody B'
  const doc = structure('test.md', source, scan(source))
  expect(doc.examples).toHaveLength(2)
  expect(doc.examples[0]?.scopeStack).toEqual(['A'])
  expect(doc.examples[1]?.scopeStack).toEqual(['B'])
})

test('a paragraph with no enclosing heading has an empty scopeStack', () => {
  const source = 'standalone paragraph'
  const doc = structure('p.md', source, scan(source))
  expect(doc.examples).toHaveLength(1)
  expect(doc.examples[0]?.scopeStack).toEqual([])
})

test('headings on their own produce no examples', () => {
  const source = '# Title only\n\n## Sub-title\n\n### Another'
  const doc = structure('h.md', source, scan(source))
  expect(doc.examples).toHaveLength(0)
})

test('structure preserves the source string verbatim', () => {
  const source = '# Hi\n\nbody'
  const doc = structure('p.md', source, scan(source))
  expect(doc.source).toBe(source)
  expect(doc.path).toBe('p.md')
})

test('orphan tables and fences are recorded on the Doc', () => {
  const source = '| name | age |\n|------|-----|\n| Bob  | 30  |'
  const doc = structure('o.md', source, scan(source))
  expect(doc.orphanAttachments).toHaveLength(1)
  expect(doc.orphanAttachments[0]?.kind).toBe('table')
})

test('a table right after a paragraph attaches to that paragraph (not orphan)', () => {
  const source =
    '## Example\n\nGiven these users:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |'
  const doc = structure('o.md', source, scan(source))
  expect(doc.orphanAttachments).toHaveLength(0)
  expect(doc.examples[0]?.body.some((b) => b.kind === 'table')).toBe(true)
})

test('a heading between a paragraph and a fence makes the fence an orphan', () => {
  const source = '## A\n\npara\n\n## B\n\n```\nfenced body\n```\n'
  const doc = structure('h.md', source, scan(source))
  expect(doc.orphanAttachments).toHaveLength(1)
  expect(doc.examples[0]?.body.some((b) => b.kind === 'fence')).toBe(false)
})

test('precededByDelimiter marks candidates after a heading or thematic break (ADR 0012)', () => {
  const source = 'First para.\n\nSecond para.\n\n---\n\nThird para.\n\n## H\n\nFourth para.'
  const doc = structure('d.md', source, scan(source))
  expect(doc.examples.map((e) => e.precededByDelimiter)).toEqual([
    true, // first candidate in the file
    false, // adjacent paragraph, no delimiter between
    true, // after `---`
    true, // after a heading
  ])
})
