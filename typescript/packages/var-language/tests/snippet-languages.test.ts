import { createRegistry } from '@oselvar/var-core'
import { expect, test } from 'vitest'
import { generateSnippet } from '../src/snippet.js'
import {
  createJavaSnippetEmitter,
  createKotlinSnippetEmitter,
  createPythonSnippetEmitter,
} from '../src/snippet-emitter.js'

test('python snippet renders a decorated def with typed args', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    snippetEmitter: createPythonSnippetEmitter(),
  })
  expect(s.fullCode).toContain('@action("I have {int} cukes")')
  expect(s.fullCode).toContain('def _(state, count: int):')
  expect(s.fullCode).toContain('raise NotImplementedError')
  expect(s.fullCode).toContain('# @context("I have {int} cukes")')
})

test('java snippet renders a binder call with Type-name args', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    snippetEmitter: createJavaSnippetEmitter(),
  })
  expect(s.fullCode).toContain('s.action(')
  expect(s.fullCode).toContain('"I have {int} cukes"')
  expect(s.fullCode).toContain('(Ctx ctx, Integer count) -> {')
  expect(s.fullCode).toContain('UnsupportedOperationException')
})

test('kotlin snippet renders a trailing lambda with user-only params', () => {
  const s = generateSnippet('I have 5 cukes', createRegistry(), {
    snippetEmitter: createKotlinSnippetEmitter(),
  })
  expect(s.fullCode).toContain('action("I have {int} cukes") { count: Int ->')
  expect(s.fullCode).toContain('TODO("not implemented")')
})

test('kotlin snippet with no parameters renders an empty lambda header', () => {
  const s = generateSnippet('the world turns', createRegistry(), {
    snippetEmitter: createKotlinSnippetEmitter(),
  })
  expect(s.fullCode).toContain('action("the world turns") {')
  expect(s.fullCode).not.toContain('->')
})
