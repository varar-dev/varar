import { expect, test } from 'vitest'
import { parse } from '../src/parse.js'

test('parse returns a Bdd with examples for a simple markdown source', () => {
  const source = '# Hello\n\nbody'
  const bdd = parse('hello.bdd.md', source)
  expect(bdd.path).toBe('hello.bdd.md')
  expect(bdd.source).toBe(source)
  expect(bdd.examples).toHaveLength(1)
  expect(bdd.examples[0]?.name).toBe('Hello')
})
