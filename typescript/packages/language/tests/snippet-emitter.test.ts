import { expect, test } from 'vitest'
import {
  createJavaSnippetEmitter,
  createKotlinSnippetEmitter,
  createPythonSnippetEmitter,
  createTypeScriptSnippetEmitter,
  emitterForLanguage,
} from '../src/snippet-emitter.ts'

test('maps a Number-typed parameter type to "number"', () => {
  const emitter = createTypeScriptSnippetEmitter()
  expect(emitter.typeNameFor({ type: Number })).toBe('number')
})

test('maps anything else, including custom parameter types, to "string"', () => {
  const emitter = createTypeScriptSnippetEmitter()
  expect(emitter.typeNameFor({ type: String })).toBe('string')
  expect(emitter.typeNameFor({ type: Boolean })).toBe('string')
})

test('python emitter maps Number to int, others to str, renders name: Type', () => {
  const e = createPythonSnippetEmitter()
  expect(e.typeNameFor({ type: Number })).toBe('int')
  expect(e.typeNameFor({ type: String })).toBe('str')
  expect(e.renderParam('count', 'int')).toBe('count: int')
  expect(e.renderParam('row', '')).toBe('row')
  expect(e.renderStateParam()).toBe('state')
  expect(e.stateInParams).toBe(true)
})

test('java emitter maps Number to Integer, renders Type name', () => {
  const e = createJavaSnippetEmitter()
  expect(e.typeNameFor({ type: Number })).toBe('Integer')
  expect(e.typeNameFor({ type: String })).toBe('String')
  expect(e.renderParam('count', 'Integer')).toBe('Integer count')
  expect(e.renderStateParam()).toBe('Ctx ctx')
})

test('kotlin emitter maps Number to Int and has no state param', () => {
  const e = createKotlinSnippetEmitter()
  expect(e.typeNameFor({ type: Number })).toBe('Int')
  expect(e.renderParam('count', 'Int')).toBe('count: Int')
  expect(e.stateInParams).toBe(false)
  expect(e.renderStateParam()).toBe('')
})

test('emitterForLanguage normalizes tsx and defaults unknown to typescript', () => {
  expect(emitterForLanguage('typescript-tsx').language).toBe('typescript')
  expect(emitterForLanguage('python').language).toBe('python')
  expect(emitterForLanguage(undefined).language).toBe('typescript')
  expect(emitterForLanguage('rust').language).toBe('typescript')
})
