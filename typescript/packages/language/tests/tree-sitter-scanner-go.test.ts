import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

// (kind, expression) and parameter-type extraction across every bundle are
// proven by extraction-conformance.test.ts. This file covers the Go-specific
// pieces: anchoring the expression to the first argument (so strings inside the
// handler closure aren't mistaken for it) and raw (backtick) string regexps.
async function goScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['go'])
}

describe('go dialect', () => {
  test('extracts kind + expression from Steps builder calls', async () => {
    const scanner = await goScanner()
    const src = `package fixture
func Register(s *varar.Steps) {
	s.Stimulus("I add {int}", func(state varar.Value, args []varar.Value) varar.HandlerReturn { return varar.Returns(state) })
	s.Sensor("the total is {int}", func(state varar.Value, args []varar.Value) varar.HandlerReturn { return varar.NoReturn() })
}`
    const defs = scanner.discoverStepDefs('x.steps.go', src)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['stimulus', 'I add {int}'],
      ['sensor', 'the total is {int}'],
    ])
  })

  test('a string inside the handler closure is not mistaken for the expression', async () => {
    const scanner = await goScanner()
    const src = `package fixture
func Register(s *varar.Steps) {
	s.Stimulus("real expr", func(state varar.Value, args []varar.Value) varar.HandlerReturn { return varar.Fails("inner") })
}`
    expect(scanner.discoverStepDefs('x.steps.go', src).map((d) => d.expression)).toEqual([
      'real expr',
    ])
  })

  test('Param extracts name and regexp; raw (backtick) strings stay verbatim', async () => {
    const scanner = await goScanner()
    const src =
      `package fixture
func Register(s *varar.Steps) {
	s.Param("airport", "[A-Z]{3}", parse, nil)
	s.Param("money", ` +
      '`' +
      `£\\d+\\.\\d{2}` +
      '`' +
      `, parse, format)
}`
    expect(
      scanner.discoverParameterTypes('x.steps.go', src).map((t) => [t.name, t.regexp]),
    ).toEqual([
      ['airport', '[A-Z]{3}'],
      ['money', '£\\d+\\.\\d{2}'],
    ])
  })
})
