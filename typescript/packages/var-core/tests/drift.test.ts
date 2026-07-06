import { expect, test } from 'vitest'
import {
  type Drift,
  deriveSpecBaseline,
  detectDrift,
  driftDiagnostics,
  liveExamples,
  parseVarLock,
  stringifyVarLock,
  type VarLock,
} from '../src/drift.ts'
import { hashSource } from '../src/hash.ts'
import { parse } from '../src/parse.ts'
import { plan } from '../src/plan.ts'
import { addStep, createRegistry, type Registry } from '../src/registry.ts'

// Drift carries a full paragraph span; pin only the stable name+line in most
// assertions.
function bare(drifts: ReadonlyArray<Drift>): ReadonlyArray<{ name: string; line: number }> {
  return drifts.map((d) => ({ name: d.name, line: d.line }))
}

// Registry with a single withdraw step; pass `false` for an empty registry
// (the step was renamed/deleted).
function reg(withStep = true): Registry {
  let r = createRegistry()
  if (withStep) {
    r = addStep(r, {
      expression: 'I withdraw {int}',
      expressionSourceFile: 'steps.ts',
      expressionSourceLine: 1,
      kind: 'stimulus',
      handler: () => {},
    })
  }
  return r
}

function romanReg(withStep = true): Registry {
  let r = createRegistry()
  if (withStep) {
    r = addStep(r, {
      expression: 'a decimal and a roman number',
      expressionSourceFile: 'steps.ts',
      expressionSourceLine: 1,
      kind: 'sensor',
      handler: () => {},
    })
  }
  return r
}

test('liveExamples records one entry per example-producing paragraph', () => {
  const source = 'I withdraw 40.'
  const varDoc = parse('w.md', source)
  const examples = liveExamples(varDoc, plan(varDoc, reg()))
  expect(examples).toEqual([{ name: 'I withdraw 40', line: 1 }])
})

test('a never-matched paragraph is not recorded as a live example', () => {
  const source = 'Just some prose.'
  const varDoc = parse('w.md', source)
  expect(liveExamples(varDoc, plan(varDoc, reg()))).toEqual([])
})

test('deriveSpecBaseline carries the source fingerprint', () => {
  const source = 'I withdraw 40.'
  const varDoc = parse('w.md', source)
  const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, reg()))
  expect(baseline.sourceHash).toBe(hashSource(source))
  expect(baseline.examples).toEqual([{ name: 'I withdraw 40', line: 1 }])
})

test('no baseline (first run) means no drift', () => {
  const source = 'I withdraw 40.'
  const varDoc = parse('w.md', source)
  expect(detectDrift(undefined, varDoc, plan(varDoc, reg()))).toEqual([])
})

test('an unchanged spec run against unchanged steps has no drift', () => {
  const source = 'I withdraw 40.'
  const varDoc = parse('w.md', source)
  const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, reg()))
  expect(detectDrift(baseline, varDoc, plan(varDoc, reg()))).toEqual([])
})

test('a renamed/deleted step definition drifts (Markdown unchanged, matched by name)', () => {
  const source = 'I withdraw 40.'
  const varDoc = parse('w.md', source)
  const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, reg(true)))
  // Same source, but the step is gone now.
  const drift = detectDrift(baseline, varDoc, plan(varDoc, reg(false)))
  expect(bare(drift)).toEqual([{ name: 'I withdraw 40', line: 1 }])
})

test('an in-place typo drifts (text changed, matched by line)', () => {
  const before = 'I withdraw 40.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  // Typo on the same line: no longer matches "I withdraw {int}".
  const after = 'I withdrraw 40.'
  const afterDoc = parse('w.md', after)
  const drift = detectDrift(baseline, afterDoc, plan(afterDoc, reg()))
  // Reports the baseline's name; anchors at the current (same) line.
  expect(bare(drift)).toEqual([{ name: 'I withdraw 40', line: 1 }])
})

test('a deleted paragraph is not drift', () => {
  const before = 'I withdraw 40.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  // The paragraph is gone entirely.
  const afterDoc = parse('w.md', '')
  expect(detectDrift(baseline, afterDoc, plan(afterDoc, reg()))).toEqual([])
})

test('a newly added prose paragraph is not drift', () => {
  const before = 'I withdraw 40.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  // Same example still matches; a fresh prose paragraph is added below it.
  const after = 'I withdraw 40.\n\nSome new narration.'
  const afterDoc = parse('w.md', after)
  expect(detectDrift(baseline, afterDoc, plan(afterDoc, reg()))).toEqual([])
})

test('moving an example (unchanged text) never drifts, wherever it lands', () => {
  const before = 'I withdraw 40.\n\nI withdraw 10.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  // Same two examples, order swapped.
  const after = 'I withdraw 10.\n\nI withdraw 40.'
  const afterDoc = parse('w.md', after)
  expect(detectDrift(baseline, afterDoc, plan(afterDoc, reg()))).toEqual([])
})

test('moving AND rewording an example that still matches does not drift', () => {
  const before = 'I withdraw 40.\n\nI withdraw 10.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  // Second example reworded (10 → 11, still matches {int}) and moved to the top.
  const after = 'I withdraw 11.\n\nI withdraw 40.'
  const afterDoc = parse('w.md', after)
  expect(detectDrift(baseline, afterDoc, plan(afterDoc, reg()))).toEqual([])
})

test('move + reword + prose landing on the old line does not false-positive', () => {
  // The exact case a raw line-number fallback got wrong: the example moves and
  // is reworded (still matches), and unrelated prose now sits at its old line.
  const before = 'I withdraw 40.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  const after = 'Just some notes.\n\nI withdraw 41.'
  const afterDoc = parse('w.md', after)
  expect(detectDrift(baseline, afterDoc, plan(afterDoc, reg()))).toEqual([])
})

test('a paragraph rewritten past recognition is a remove+add, not drift', () => {
  const before = 'I withdraw 40.'
  const beforeDoc = parse('w.md', before)
  const baseline = deriveSpecBaseline(before, beforeDoc, plan(beforeDoc, reg()))
  // Wholly different prose (no word overlap) → below the similarity threshold.
  const after = 'The branch closed years ago.'
  const afterDoc = parse('w.md', after)
  expect(detectDrift(baseline, afterDoc, plan(afterDoc, reg()))).toEqual([])
})

test('a header-bound table records its binding paragraph once', () => {
  const source =
    'Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n'
  const varDoc = parse('r.md', source)
  const examples = liveExamples(varDoc, plan(varDoc, romanReg()))
  // Two rows run, but the baseline records the single binding paragraph.
  expect(examples).toEqual([{ name: 'Each row gives a decimal and a roman number:', line: 1 }])
})

test('a header-bound binding paragraph that stops matching drifts', () => {
  const source =
    'Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n'
  const varDoc = parse('r.md', source)
  const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, romanReg(true)))
  const drift = detectDrift(baseline, varDoc, plan(varDoc, romanReg(false)))
  expect(bare(drift)).toEqual([{ name: 'Each row gives a decimal and a roman number:', line: 1 }])
})

test('a drift carries the drifted paragraph span', () => {
  const source = 'Some prose first.\n\nI withdraw 40.'
  const varDoc = parse('w.md', source)
  const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, reg(true)))
  const [drift] = detectDrift(baseline, varDoc, plan(varDoc, reg(false)))
  if (!drift) throw new Error('expected a drift')
  // The example is on line 3; the span covers that paragraph, not line 1's prose.
  expect(drift.line).toBe(3)
  expect(drift.span.startLine).toBe(3)
  expect(source.slice(drift.span.startOffset, drift.span.endOffset)).toBe('I withdraw 40.')
})

test('driftDiagnostics projects drift onto error-severity diagnostics', () => {
  const source = 'I withdraw 40.'
  const varDoc = parse('w.md', source)
  const baseline = deriveSpecBaseline(source, varDoc, plan(varDoc, reg(true)))
  const drifts = detectDrift(baseline, varDoc, plan(varDoc, reg(false)))
  const diags = driftDiagnostics(drifts)
  expect(diags).toHaveLength(1)
  expect(diags[0]?.severity).toBe('error')
  expect(diags[0]?.code).toBe('drift')
  expect(diags[0]?.message).toContain('I withdraw 40')
  expect(diags[0]?.span.startLine).toBe(1)
})

test('parseVarLock round-trips a valid lock', () => {
  const lock: VarLock = {
    version: 1,
    specs: {
      'library.md': { sourceHash: 'fnv1a:1a2b3c4d', examples: [{ name: 'I check out', line: 7 }] },
    },
  }
  expect(parseVarLock(stringifyVarLock(lock))).toEqual(lock)
})

test('stringifyVarLock sorts spec paths for a stable diff', () => {
  const lock: VarLock = {
    version: 1,
    specs: {
      'zebra.md': { sourceHash: 'fnv1a:00000001', examples: [] },
      'alpha.md': { sourceHash: 'fnv1a:00000002', examples: [] },
    },
  }
  const text = stringifyVarLock(lock)
  expect(text.indexOf('alpha.md')).toBeLessThan(text.indexOf('zebra.md'))
  expect(text.endsWith('}\n')).toBe(true)
})

test('parseVarLock rejects malformed input', () => {
  expect(parseVarLock('not json')).toBeNull()
  expect(parseVarLock('{}')).toBeNull() // missing version/specs
  expect(parseVarLock('{"version":2,"specs":{}}')).toBeNull() // wrong version
  expect(parseVarLock('{"version":1,"specs":{"a.md":{"examples":[]}}}')).toBeNull() // no sourceHash
})
