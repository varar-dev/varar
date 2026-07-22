import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { bundleFixture } from './bundle-fixtures.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// (kind, expression) and parameter-type extraction are proven across every
// bundle and language by extraction-conformance.test.ts. This file covers the
// Ruby-specific pieces that test doesn't: handler-param extraction (sourced
// from real, executed bundle fixtures, not inline strings) and the
// language-specific escape rules and false-positive guards.
async function rubyScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['ruby'])
}

describe('ruby dialect', () => {
  test('extracts handler params (simple, do…end, optional, splat) from bundle fixtures', async () => {
    const scanner = await rubyScanner()

    // 01: a brace block and a do…end block, plain params.
    const simple = bundleFixture('01-roman-numerals', '.rb')
    const simpleDefs = scanner.discoverStepDefs(simple.name, simple.source)
    expect(simpleDefs.map((d) => d.kind)).toEqual(['stimulus', 'sensor'])
    expect(simpleDefs[0]?.handlerParams?.params).toEqual([
      { name: '_state', typeText: '' },
      { name: 'n', typeText: '' },
    ])
    expect(simpleDefs[1]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: '_expected', typeText: '' },
    ])

    // 07: an optional block parameter (`|_state, _row = nil|`).
    const optional = bundleFixture('07-row-check-mismatch', '.rb')
    const optionalDefs = scanner.discoverStepDefs(optional.name, optional.source)
    expect(optionalDefs[0]?.handlerParams?.params).toEqual([
      { name: '_state', typeText: '' },
      { name: '_row', typeText: '' },
    ])

    // 11: a splat block parameter (`|_state, s, *extra|`).
    const splat = bundleFixture('11-emoji-offsets', '.rb')
    const splatDefs = scanner.discoverStepDefs(splat.name, splat.source)
    expect(splatDefs[0]?.handlerParams?.params).toEqual([
      { name: '_state', typeText: '' },
      { name: 's', typeText: '' },
      { name: 'extra', typeText: '' },
    ])
  })

  test('single-quoted strings keep backslashes; double-quoted strings decode escapes', async () => {
    const scanner = await rubyScanner()
    const single = scanner.discoverStepDefs(
      'a.steps.rb',
      `steps do\n  sensor('a \\d+ and \\.') { |_s| nil }\nend\n`,
    )
    expect(single[0]?.expression).toBe('a \\d+ and \\.')
    const double = scanner.discoverStepDefs(
      'a.steps.rb',
      `steps do\n  sensor("said \\"hi\\"\\n\\ttab é") { |_s| nil }\nend\n`,
    )
    expect(double[0]?.expression).toBe('said "hi"\n\ttab é')
  })

  test('ignores stimulus/sensor/param calls that have a receiver', async () => {
    const scanner = await rubyScanner()
    // Only the bare DSL calls are step defs; `logger.stimulus(...)` is not.
    const defs = scanner.discoverStepDefs(
      'a.steps.rb',
      `steps do\n  logger.stimulus('nope') { |_s| nil }\n  sensor('yes') { |_s| nil }\nend\n`,
    )
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([['sensor', 'yes']])
  })
})
