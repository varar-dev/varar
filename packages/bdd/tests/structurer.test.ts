import { expect, test } from 'vitest'
import type { Bdd } from '../src/ast.js'
import { scan } from '../src/scanner.js'
import { structure } from '../src/structurer.js'

test('structure produces one Example per heading whose body has content', () => {
  const source =
    '# Withdrawing cash\n\nGiven I have $100 in my account\n\n# Overdraft\n\nGiven I have $10 in my account'
  const bdd: Bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(2)
  expect(bdd.examples[0]?.name).toBe('Withdrawing cash')
  expect(bdd.examples[1]?.name).toBe('Overdraft')
})

test('structure attaches all body blocks to the example', () => {
  const source = '## Example\n\nFirst paragraph.\n\nSecond paragraph.'
  const bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(1)
  expect(bdd.examples[0]?.body).toHaveLength(2)
})

test('structure ends an example at the next heading at any level', () => {
  const source = '## Outer\n\nbody one\n\n### Inner\n\nbody two'
  const bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(2)
  expect(bdd.examples[0]?.name).toBe('Outer')
  expect(bdd.examples[0]?.body).toHaveLength(1)
  expect(bdd.examples[1]?.name).toBe('Inner')
})

test('structure ignores headings with empty bodies', () => {
  const source = '# Title only\n\n## Real example\n\nbody'
  const bdd = structure('test.bdd.md', source, scan(source))
  expect(bdd.examples).toHaveLength(1)
  expect(bdd.examples[0]?.name).toBe('Real example')
})

test('structure preserves the source string verbatim', () => {
  const source = '# Hi\n\nbody'
  const bdd = structure('p.bdd.md', source, scan(source))
  expect(bdd.source).toBe(source)
  expect(bdd.path).toBe('p.bdd.md')
})
