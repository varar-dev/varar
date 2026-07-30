import { expect, test } from 'vitest'
import { parse } from '../src/parse.ts'

test('parse returns a Doc whose Examples come from paragraphs and carry the heading stack', () => {
  const source = '# Hello\n\nbody'
  const doc = parse('hello.md', source)
  expect(doc.path).toBe('hello.md')
  expect(doc.source).toBe(source)
  // One paragraph, one Example. Example name is computed by the planner, not
  // captured here; the structurer's job is just to track scope + body.
  expect(doc.examples).toHaveLength(1)
  expect(doc.examples[0]?.scopeStack).toEqual(['Hello'])
})
