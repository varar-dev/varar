import { expect, test } from 'vitest'
import { buildWorkspaceIndex, createIndexCache } from '../src/index-workspace.ts'
import type { StepDefScanner } from '../src/scanner.ts'

const STEPS = { path: '/w/greet.steps.ts', source: "sensor('I greet {string}', ...)" }
const OATH = { path: '/w/varar/a.md', source: 'First I greet "world".\n' }

// A scanner that reports one step def and counts how often it was asked. The
// real one runs tree-sitter, which is the cost the cache exists to avoid.
function countingScanner(): StepDefScanner & { calls: () => number } {
  let calls = 0
  return {
    calls: () => calls,
    discoverParameterTypes: () => [],
    discoverStepDefs: (file: string) => {
      calls++
      return [
        {
          expression: 'I greet {string}',
          kind: 'sensor' as const,
          file,
          expressionRange: {
            start: { line: 1, character: 1 },
            end: { line: 1, character: 20 },
          },
          range: { start: { line: 1, character: 1 }, end: { line: 1, character: 20 } },
          callRange: { start: { line: 1, character: 1 }, end: { line: 1, character: 20 } },
        },
      ]
    },
  }
}

test('a second index with the same cache re-scans no step file', () => {
  const scanner = countingScanner()
  const cache = createIndexCache()
  const input = { stepFiles: [STEPS], oathFiles: [OATH], scanner }

  buildWorkspaceIndex(input, cache)
  expect(scanner.calls()).toBe(1)
  buildWorkspaceIndex(input, cache)
  expect(scanner.calls()).toBe(1)
})

test('an edited step file is re-scanned; its unchanged siblings are not', () => {
  const scanner = countingScanner()
  const cache = createIndexCache()
  const other = { path: '/w/other.steps.ts', source: "sensor('unrelated', ...)" }

  buildWorkspaceIndex({ stepFiles: [STEPS, other], oathFiles: [OATH], scanner }, cache)
  expect(scanner.calls()).toBe(2)

  buildWorkspaceIndex(
    {
      stepFiles: [{ ...STEPS, source: `${STEPS.source}\n// edited` }, other],
      oathFiles: [OATH],
      scanner,
    },
    cache,
  )
  expect(scanner.calls()).toBe(3)
})

test('the index exposes each oath’s doc and plan, so drift need not re-plan', () => {
  const scanner = countingScanner()
  const idx = buildWorkspaceIndex({ stepFiles: [STEPS], oathFiles: [OATH], scanner })
  const planned = idx.oaths.get(OATH.path)

  expect(planned?.doc.path).toBe(OATH.path)
  expect(planned?.plan.examples.map((e) => e.name)).toEqual(['First I greet "world"'])
})

test('a cached plan is reused only while the registry is unchanged', () => {
  const scanner = countingScanner()
  const cache = createIndexCache()
  const first = buildWorkspaceIndex({ stepFiles: [STEPS], oathFiles: [OATH], scanner }, cache)
  const cached = buildWorkspaceIndex({ stepFiles: [STEPS], oathFiles: [OATH], scanner }, cache)
  // Same source, same registry → the very same planned object comes back.
  expect(cached.oaths.get(OATH.path)).toBe(first.oaths.get(OATH.path))

  const afterStepEdit = buildWorkspaceIndex(
    {
      stepFiles: [{ ...STEPS, source: `${STEPS.source}\n// edited` }],
      oathFiles: [OATH],
      scanner,
    },
    cache,
  )
  expect(afterStepEdit.oaths.get(OATH.path)).not.toBe(first.oaths.get(OATH.path))
})
