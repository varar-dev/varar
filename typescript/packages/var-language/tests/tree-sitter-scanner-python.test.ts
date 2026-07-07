import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { bundleFixture } from './bundle-fixtures.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// (kind, expression) and parameter-type extraction are proven across every
// bundle and language by extraction-conformance.test.ts. This file covers the
// Python-specific pieces: handler-param extraction (from real, executed bundle
// fixtures) plus escape decoding and the `re.compile`/raw-string regexp forms
// that no bundle uses.
async function pythonScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['python'])
}

describe('python dialect', () => {
  test('extracts handler params (simple, default, splat) from bundle fixtures', async () => {
    const scanner = await pythonScanner()

    const simple = bundleFixture('01-roman-numerals', '.py')
    const simpleDefs = scanner.discoverStepDefs(simple.name, simple.source)
    expect(simpleDefs.map((d) => d.kind)).toEqual(['stimulus', 'sensor'])
    expect(simpleDefs[0]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'n', typeText: '' },
    ])
    expect(simpleDefs[1]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'expected', typeText: '' },
    ])

    // 07: a default parameter (`row=None`).
    const dflt = bundleFixture('07-row-check-mismatch', '.py')
    expect(scanner.discoverStepDefs(dflt.name, dflt.source)[0]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'row', typeText: '' },
    ])

    // 11: a splat parameter — Python surfaces it with its leading star.
    const splat = bundleFixture('11-emoji-offsets', '.py')
    expect(scanner.discoverStepDefs(splat.name, splat.source)[0]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 's', typeText: '' },
      { name: '*extra', typeText: '' },
    ])
  })

  test('decodes escapes; leaves unknown escapes backslashed like Python does', async () => {
    const scanner = await pythonScanner()
    const defs = scanner.discoverStepDefs(
      'a.steps.py',
      `@stimulus("I said \\"hi\\"\\n\\ttwice \\u00e9\\a\\z")\ndef _(state):\n    pass\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\n\ttwice é\\z')
  })

  test('resolves parameter-type regexps from raw strings and re.compile (no bundle uses these)', async () => {
    const scanner = await pythonScanner()
    const source = `import re
param("iata", r"[A-Z]{3}\\d")
param("code", re.compile(r"[0-9]+"))
`
    expect(
      scanner.discoverParameterTypes('a.steps.py', source).map((t) => [t.name, t.regexp]),
    ).toEqual([
      ['iata', '[A-Z]{3}\\d'],
      ['code', '[0-9]+'],
    ])
  })

  test('ignores non-step decorators and bare calls', async () => {
    const scanner = await pythonScanner()
    const source = `@other("not a step")
def _(state):
    pass


action = "shadowed"
`
    expect(scanner.discoverStepDefs('a.steps.py', source)).toEqual([])
  })

  test('a .py file scanned by a scanner without the python dialect yields []', async () => {
    const scanner = await createTreeSitterScanner(createTestGrammarLoader(), ['typescript'])
    expect(scanner.discoverStepDefs('a.steps.py', '@stimulus("x")\ndef _(s):\n    pass\n')).toEqual(
      [],
    )
  })
})
