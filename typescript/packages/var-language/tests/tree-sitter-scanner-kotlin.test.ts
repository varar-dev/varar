import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { bundleFixture } from './bundle-fixtures.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// (kind, expression) and parameter-type extraction (including Regex(...) and
// raw-string Regex, via bundles 13/15) are proven across every bundle by
// extraction-conformance.test.ts. This file covers the Kotlin-specific pieces:
// typed lambda-param extraction (from real, executed bundle fixtures), the
// state-as-receiver zero-parameter lambda, escapes, and false-positive guards.
async function kotlinScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['kotlin'])
}

describe('kotlin dialect', () => {
  test('extracts typed lambda params (incl. nested generics) from bundle fixtures', async () => {
    const scanner = await kotlinScanner()

    const simple = bundleFixture('01-roman-numerals', '.kt')
    const simpleDefs = scanner.discoverStepDefs(simple.name, simple.source)
    expect(simpleDefs.map((d) => d.kind)).toEqual(['stimulus', 'sensor'])
    expect(simpleDefs[0]?.handlerParams?.params).toEqual([{ name: 'n', typeText: 'Int' }])
    expect(simpleDefs[1]?.handlerParams?.params).toEqual([{ name: 'expected', typeText: 'String' }])

    // 07: a generic parameter type (Map<String, String>).
    const map = bundleFixture('07-row-check-mismatch', '.kt')
    expect(scanner.discoverStepDefs(map.name, map.source)[0]?.handlerParams?.params).toEqual([
      { name: 'row', typeText: 'Map<String, String>' },
    ])

    // 11: two params, one a nested generic (List<List<String>>).
    const nested = bundleFixture('11-emoji-offsets', '.kt')
    expect(scanner.discoverStepDefs(nested.name, nested.source)[0]?.handlerParams?.params).toEqual([
      { name: 'name', typeText: 'String' },
      { name: 'table', typeText: 'List<List<String>>' },
    ])
  })

  test('a zero-parameter lambda (state as receiver) has undefined handlerParams', async () => {
    const scanner = await kotlinScanner()
    const defs = scanner.discoverStepDefs(
      'x.steps.kt',
      `val stepDefs = steps(::Ctx) {\n    sensor("zero") { dest }\n}\n`,
    )
    expect(defs).toHaveLength(1)
    expect(defs[0]?.handlerParams).toBeUndefined()
  })

  test('decodes escape sequences including \\$ and \\uXXXX', async () => {
    const scanner = await kotlinScanner()
    const defs = scanner.discoverStepDefs(
      'x.steps.kt',
      `val stepDefs = steps(::Ctx) {\n    stimulus("costs \\$5\\n\\u00e9") { n: Int -> copy() }\n}\n`,
    )
    expect(defs[0]?.expression).toBe('costs $5\né')
  })

  test('ignores non-step trailing-lambda calls', async () => {
    const scanner = await kotlinScanner()
    expect(
      scanner.discoverStepDefs('x.steps.kt', `val x = listOf("a").map { it }\nfun other() {}\n`),
    ).toEqual([])
  })
})
