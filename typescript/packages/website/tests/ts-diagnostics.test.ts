import { expect, test } from 'vitest'
// The real dogfood sample the front-page editor shows — if the editor's
// virtual module drifts from the actual @varar/varar API, this file stops
// type-checking cleanly and the first test fails, exactly like the front
// page would.
import librarySteps from '../../../../examples/typescript-vitest/steps/library.steps.ts?raw'
import { createTsDiagnostics } from '../src/lib/ts-diagnostics.ts'

// The sample imports its domain module ('../src/library'); the in-browser
// service has no filesystem, so mirror what the editor does for unresolvable
// local imports: nothing. Those imports type as `any`, which must not produce
// diagnostics with the service's lenient options — assert only on messages
// that are NOT unresolved-module noise for the domain module.
function realProblems(tsd: ReturnType<typeof createTsDiagnostics>, name: string, source: string) {
  tsd.updateDoc(name, source)
  return tsd.diagnostics(name).filter((d) => !d.message.includes("/library'"))
}

test('the front-page library sample type-checks against the real @varar/varar types', () => {
  const problems = realProblems(createTsDiagnostics(), 'library_steps.ts', librarySteps)
  expect(problems).toEqual([])
})

test('stimulus and sensor are the destructurable names steps returns', () => {
  const source = `import { steps } from '@varar/varar'
const { stimulus, sensor } = steps(() => ({ total: 0 }))
stimulus('I add {int}', (state, n) => ({ total: state.total + n }))
sensor('the total is {int}', (state) => state.total)
`
  const problems = realProblems(createTsDiagnostics(), 'adds.steps.ts', source)
  expect(problems).toEqual([])
})

test('the stale pre-rename API names are rejected', () => {
  const source = `import { steps } from '@varar/varar'
const { context, action } = steps(() => ({}))
`
  const tsd = createTsDiagnostics()
  tsd.updateDoc('old.steps.ts', source)
  const messages = tsd.diagnostics('old.steps.ts').map((d) => d.message)
  expect(messages.join('\n')).toContain("Property 'context' does not exist")
})

test('a format whose parameter contradicts its parse return is a type error', () => {
  const source = `import { steps } from '@varar/varar'
const { sensor } = steps(() => ({})).param(
  'money',
  /£\\d+\\.\\d{2}/,
  (raw) => ({ value: Number(raw.slice(1)) }),
  (m: string) => m,
)
`
  const tsd = createTsDiagnostics()
  tsd.updateDoc('money.steps.ts', source)
  expect(tsd.diagnostics('money.steps.ts').length).toBeGreaterThan(0)
})
