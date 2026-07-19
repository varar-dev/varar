import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { bundleFixture } from './bundle-fixtures.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// (kind, expression) and parameter-type extraction (including Pattern.compile,
// via bundle 13) are proven across every bundle by extraction-conformance.test.ts.
// This file covers the Java-specific pieces: typed lambda-param extraction
// (from real, executed bundle fixtures) plus escapes, the bare-identifier
// lambda form, and false-positive guards.
async function javaScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['java'])
}

describe('java dialect', () => {
  test('extracts typed lambda params (incl. nested generics) from bundle fixtures', async () => {
    const scanner = await javaScanner()

    const simple = bundleFixture('01-roman-numerals', '.java')
    const simpleDefs = scanner.discoverStepDefs(simple.name, simple.source)
    expect(simpleDefs.map((d) => d.kind)).toEqual(['stimulus', 'sensor'])
    expect(simpleDefs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'n', typeText: 'Integer' },
    ])
    expect(simpleDefs[1]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'expected', typeText: 'String' },
    ])

    // 07: a generic parameter type (Map<String, String>).
    const map = bundleFixture('07-row-check-mismatch', '.java')
    expect(scanner.discoverStepDefs(map.name, map.source)[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'row', typeText: 'Map<String, String>' },
    ])

    // 11: a nested generic (List<List<String>>).
    const nested = bundleFixture('11-emoji-offsets', '.java')
    expect(scanner.discoverStepDefs(nested.name, nested.source)[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'name', typeText: 'String' },
      { name: 'table', typeText: 'List<List<String>>' },
    ])
  })

  test('handles a bare single-identifier lambda parameter', async () => {
    const scanner = await javaScanner()
    const defs = scanner.discoverStepDefs(
      'XSteps.java',
      `class X { void f(StateBinder<C> s) { s.sensor("plain", g -> g); } }\n`,
    )
    expect(defs[0]?.handlerParams?.params).toEqual([{ name: 'g', typeText: '' }])
  })

  test('decodes escape sequences including \\uXXXX', async () => {
    const scanner = await javaScanner()
    const defs = scanner.discoverStepDefs(
      'XSteps.java',
      `class X { void f(StateBinder<C> s) { s.stimulus("I said \\"hi\\"\\n\\u00e9", (C c) -> c); } }\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\né')
  })

  test('ignores unrelated method calls', async () => {
    const scanner = await javaScanner()
    expect(
      scanner.discoverStepDefs(
        'XSteps.java',
        `class X { void f() { log.stimulus(); other("x"); } }\n`,
      ),
    ).toEqual([])
  })
})
