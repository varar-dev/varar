import { expect, test } from 'vitest'
import { executePlan } from '../src/execute.ts'
import { toFailure } from '../src/failure.ts'
import { attachFailureAnchor, readFailureAnchor } from '../src/failure-anchor.ts'
import { hashSource } from '../src/hash.ts'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry } from '../src/registry.ts'
import { runResultDiagnostics } from '../src/run-diagnostics.ts'
import { spanFromOffsets } from '../src/span.ts'

// A throwing sensor sharing its line with a stimulus that passed: the whole
// chain (executePlan → toFailure → runResultDiagnostics) must land on the
// sensor's own text, since underlining the line would blame the stimulus too.
const SOURCE = '# L\n\nHe asks on June 10, and the library agrees.\n'
const STEP_TEXT = 'the library agrees'

function throwingPlan() {
  let r = createRegistry()
  r = addStep(r, {
    expression: 'asks on June 10',
    expressionSourceFile: 's.ts',
    expressionSourceLine: 1,
    kind: 'stimulus',
    handler: () => {},
  })
  r = addStep(r, {
    expression: STEP_TEXT,
    expressionSourceFile: 's.ts',
    expressionSourceLine: 2,
    kind: 'sensor',
    handler: () => {
      throw new Error('expected the library to refuse')
    },
  })
  return plan(parse('l.md', SOURCE), r)
}

async function failureOf() {
  const p = throwingPlan()
  let run: (() => void | Promise<void>) | undefined
  executePlan(p, {
    sink: {
      example: (_n, r) => {
        run = r
      },
    },
    reporter: { diagnostic: () => {} },
  })
  try {
    await run?.()
  } catch (error) {
    return toFailure(error, 'l.md', 3)
  }
  throw new Error('the example was expected to fail')
}

test('a thrown step records the anchor of the step that threw', async () => {
  const f = await failureOf()
  expect(f.anchor).toBeDefined()
  expect(SOURCE.slice(f.anchor?.from ?? 0, f.anchor?.to ?? 0)).toBe(STEP_TEXT)
})

test('the diagnostic underlines the failing step, leaving the passing one alone', async () => {
  const f = await failureOf()
  const diags = runResultDiagnostics(
    {
      version: 1,
      oathPath: 'l.md',
      sourceHash: hashSource(SOURCE),
      examples: [{ name: 'e', status: 'failed', lines: [3], failure: f }],
    },
    SOURCE,
  )
  expect(diags).toHaveLength(1)
  expect(SOURCE.slice(diags[0]?.from ?? 0, diags[0]?.to ?? 0)).toBe(STEP_TEXT)
  expect(diags[0]?.message).toBe('expected the library to refuse')
})

test('the anchor rides on the error without becoming an enumerable property', () => {
  const err = new Error('boom')
  attachFailureAnchor(err, spanFromOffsets(SOURCE, 5, 9))
  expect(readFailureAnchor(err)?.startOffset).toBe(5)
  expect(JSON.stringify({ ...err })).toBe('{}')
  // Non-objects are ignored rather than throwing — a step may throw anything.
  expect(() => attachFailureAnchor('a string', spanFromOffsets(SOURCE, 0, 1))).not.toThrow()
  expect(readFailureAnchor('a string')).toBeUndefined()
})
