import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.ts'
import { createTestGrammarLoader } from './test-grammar-loader.ts'

async function rubyScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['ruby'])
}

describe('ruby dialect', () => {
  test('discovers block-DSL step defs with kind, expression, and handler params', async () => {
    const scanner = await rubyScanner()
    const source = `require 'oselvar/var'

steps(count: 0) do
  stimulus('I fly to {airport}') { |state, dest| { dest: dest } }

  sensor('The count is {int}') do |state, n, _row = nil|
    state[:count]
  end
end
`
    const defs = scanner.discoverStepDefs('a.steps.rb', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['stimulus', 'I fly to {airport}'],
      ['sensor', 'The count is {int}'],
    ])
    // Brace block params.
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'dest', typeText: '' },
    ])
    // do…end block params, including an optional parameter.
    expect(defs[1]?.handlerParams?.params).toEqual([
      { name: 'state', typeText: '' },
      { name: 'n', typeText: '' },
      { name: '_row', typeText: '' },
    ])
  })

  test('the surrounding steps(...) call and splat params do not confuse extraction', async () => {
    const scanner = await rubyScanner()
    const defs = scanner.discoverStepDefs(
      'a.steps.rb',
      `steps do\n  sensor('I greet {string}') { |_state, _s, *_extra| nil }\nend\n`,
    )
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([['sensor', 'I greet {string}']])
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: '_state', typeText: '' },
      { name: '_s', typeText: '' },
      { name: '_extra', typeText: '' },
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

  test('discovers parameter types from single- and double-quoted regexps', async () => {
    const scanner = await rubyScanner()
    const source = `steps do
  param('airport', '[A-Z]{3}', parse: ->(code) { code.downcase })
  param("money", '£\\d+\\.\\d{2}', parse: ->(raw) { raw })
end
`
    const types = scanner.discoverParameterTypes('a.steps.rb', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([
      ['airport', '[A-Z]{3}'],
      ['money', '£\\d+\\.\\d{2}'],
    ])
  })
})
