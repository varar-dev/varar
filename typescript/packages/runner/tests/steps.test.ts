import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { explainLoadFailure, loadSteps } from '../src/steps.ts'

// Fixture step files live within the package directory so Node can resolve
// @varar/varar from this package's own node_modules.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('loadSteps builds registry with registered steps', async () => {
  const loaded = await loadSteps(['**/*.steps.ts'], FIXTURES)
  const exprs = loaded.registry.steps.map((s) => s.expression)
  expect(exprs).toContain('I have {int} items')
  // createContext, called with the step's expressionSourceFile, returns the factory's state
  const stepDef = loaded.registry.steps.find((s) => s.expression === 'I have {int} items')
  expect(stepDef).toBeDefined()
  const state = await loaded.createContext(stepDef!.expressionSourceFile)
  expect(state).toEqual({ count: 0 })
})

test('loadSteps resets between calls — second call with empty globs yields empty registry', async () => {
  await loadSteps(['**/*.steps.ts'], FIXTURES)
  // Second call with no globs: builder was reset, no imports run → empty registry
  const loaded2 = await loadSteps([], FIXTURES)
  expect(loaded2.registry.steps).toHaveLength(0)
})

// The two failures below are Node's, raised by the real ESM loader — vitest
// resolves imports through vite instead, so they are unreachable end-to-end
// here and the mapping is checked directly.
test('an ES-module step file in a CommonJS project is explained as a missing "type": "module"', () => {
  const err = new SyntaxError('Cannot use import statement outside a module')
  const explained = explainLoadFailure(err, '/p/x.steps.ts')
  expect((explained as Error).message).toMatch(/step files are ES modules/)
  expect((explained as Error).message).toMatch(/"type": "module"/)
  expect((explained as Error).message).toContain('/p/x.steps.ts')
  expect((explained as Error).cause).toBe(err)
})

test('a step file Node has no loader for is explained as TypeScript support', () => {
  const err = Object.assign(new TypeError('Unknown file extension ".ts"'), {
    code: 'ERR_UNKNOWN_FILE_EXTENSION',
  })
  const explained = explainLoadFailure(err, '/p/x.steps.ts')
  expect((explained as Error).message).toMatch(/cannot run TypeScript directly/)
  expect((explained as Error).message).toMatch(/22\.18/)
  expect((explained as Error).cause).toBe(err)
})

test('an unrelated failure is passed through untouched', () => {
  const err = new Error('your step file threw')
  expect(explainLoadFailure(err, '/p/x.steps.ts')).toBe(err)
})
