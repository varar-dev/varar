import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadSteps } from '../src/steps.ts'

// Fixture step files live within the package directory so Node can resolve
// @oselvar/var from this package's own node_modules.
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
