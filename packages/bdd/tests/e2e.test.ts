import { expect, test } from 'vitest'
import { addStep, createRegistry, parse, plan } from '../src/index.js'

test('end-to-end: a complete BDD file with headings, prose, list, table, and fence', () => {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'I have {int} in my account',
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
  r = addStep(r, {
    expression: 'I should have {int} left',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 3,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'these users exist',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 4,
    handler: () => {},
  })
  r = addStep(r, {
    expression: 'I send the payload',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 5,
    handler: () => {},
  })

  const source = `# Withdrawing cash

Given I have 100 in my account, when I withdraw 40, then I should have 60 left.

# Importing users

Given these users exist:

| name | age |
|------|-----|
| Bob  | 30  |
| Eve  | 25  |

When I send the payload:

\`\`\`json
{ "action": "import" }
\`\`\``

  const result = plan(parse('e.bdd.md', source), r)
  expect(result.diagnostics).toHaveLength(0)
  expect(result.examples).toHaveLength(2)

  const withdraw = result.examples[0]
  expect(withdraw?.name).toBe('Withdrawing cash')
  expect(withdraw?.steps.map((s) => s.text)).toEqual([
    'I have 100 in my account',
    'I withdraw 40',
    'I should have 60 left',
  ])

  const importing = result.examples[1]
  expect(importing?.name).toBe('Importing users')
  expect(importing?.steps).toHaveLength(2)
  expect(importing?.steps[0]?.dataTable?.rows).toHaveLength(2)
  expect(importing?.steps[1]?.docString?.contentType).toBe('json')
})
