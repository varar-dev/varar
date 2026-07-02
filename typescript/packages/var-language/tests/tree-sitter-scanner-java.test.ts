import { describe, expect, test } from 'vitest'
import { createTreeSitterScanner } from '../src/tree-sitter-scanner.js'
import { createTestGrammarLoader } from './test-grammar-loader.js'

async function javaScanner() {
  return createTreeSitterScanner(createTestGrammarLoader(), ['java'])
}

describe('java dialect', () => {
  test('discovers binder method calls with kind, expression, and typed lambda params', async () => {
    const scanner = await javaScanner()
    const source = `public final class AirportsSteps implements StepDefinitions {
    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(() -> new Ctx(null));
        s.action("I fly to {airport}", (Ctx ctx, String dest) -> new Ctx(dest));
        s.sensor("The count is {int}", (Ctx ctx, Integer n) -> null);
    }
}
`
    const defs = scanner.discoverStepDefs('AirportsSteps.java', source)
    expect(defs.map((d) => [d.kind, d.expression])).toEqual([
      ['action', 'I fly to {airport}'],
      ['sensor', 'The count is {int}'],
    ])
    expect(defs[0]?.handlerParams?.params).toEqual([
      { name: 'ctx', typeText: 'Ctx' },
      { name: 'dest', typeText: 'String' },
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
      `class X { void f(StateBinder<C> s) { s.action("I said \\"hi\\"\\n\\u00e9", (C c) -> c); } }\n`,
    )
    expect(defs[0]?.expression).toBe('I said "hi"\né')
  })

  test('discovers defineParameterType with Pattern.compile', async () => {
    const scanner = await javaScanner()
    const source = `class X { void f(Registrar registrar) {
        registrar.defineParameterType("airport", Pattern.compile("[A-Z]{3}"), groups -> groups[0]);
    } }
`
    const types = scanner.discoverParameterTypes('XSteps.java', source)
    expect(types.map((t) => [t.name, t.regexp])).toEqual([['airport', '[A-Z]{3}']])
  })

  test('ignores unrelated method calls', async () => {
    const scanner = await javaScanner()
    expect(
      scanner.discoverStepDefs(
        'XSteps.java',
        `class X { void f() { log.action(); other("x"); } }\n`,
      ),
    ).toEqual([])
  })
})
