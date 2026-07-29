import { expect, test } from 'vitest'
import {
  relativeImports,
  resolveRelative,
  unresolvedRelativeImports,
} from '../src/lib/module-resolution.ts'

test('a relative specifier resolves against the importer directory', () => {
  const paths = ['src/varar/library.steps.ts', 'src/library.ts']
  expect(resolveRelative('../library.ts', 'src/varar/library.steps.ts', paths)).toBe(
    'src/library.ts',
  )
})

test('an extensionless or .js specifier falls back to the .ts tab', () => {
  const paths = ['steps/yahtzee.steps.ts', 'yahtzee.ts']
  expect(resolveRelative('../yahtzee', 'steps/yahtzee.steps.ts', paths)).toBe('yahtzee.ts')
  expect(resolveRelative('../yahtzee.js', 'steps/yahtzee.steps.ts', paths)).toBe('yahtzee.ts')
})

test('a specifier pointing outside the mounted files does not resolve', () => {
  // The regression: steps mounted at steps/ while the library sits in src/ —
  // '../library.ts' lands on 'library.ts', which no tab provides.
  const paths = ['steps/library.steps.ts', 'src/library.ts']
  expect(resolveRelative('../library.ts', 'steps/library.steps.ts', paths)).toBeUndefined()
})

test('relativeImports finds every relative specifier shape', () => {
  const source = [
    "import { steps } from '@varar/varar'",
    "import { lateFee } from '../library.ts'",
    "import './side-effect.ts'",
    "export { score } from './yahtzee'",
    "const m = await import('./lazy.ts')",
  ].join('\n')
  expect(relativeImports(source)).toEqual([
    '../library.ts',
    './side-effect.ts',
    './yahtzee',
    './lazy.ts',
  ])
})

test('unresolvedRelativeImports reports the importer and the specifier', () => {
  const files = [
    { path: 'steps/library.steps.ts', source: "import { lateFee } from '../library.ts'" },
    { path: 'src/library.ts', source: 'export const lateFee = 0' },
  ]
  expect(unresolvedRelativeImports(files)).toEqual([
    { from: 'steps/library.steps.ts', specifier: '../library.ts' },
  ])
})

test('unresolvedRelativeImports is empty when every import has a tab', () => {
  const files = [
    { path: 'src/varar/library.steps.ts', source: "import { lateFee } from '../library.ts'" },
    { path: 'src/library.ts', source: 'export const lateFee = 0' },
  ]
  expect(unresolvedRelativeImports(files)).toEqual([])
})
