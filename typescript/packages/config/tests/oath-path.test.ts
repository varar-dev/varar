import { expect, test } from 'vitest'
import { toOathPath } from '../src/oath-path.ts'

test('an oath under the root is identified by its relative POSIX path', () => {
  expect(toOathPath('/work/proj', '/work/proj/varar/library.md')).toBe('varar/library.md')
})

test('an oath outside the root keeps its ../ prefix', () => {
  expect(toOathPath('/work/proj', '/work/shared/library.md')).toBe('../shared/library.md')
})

test('the root itself falls back to the input rather than an empty identity', () => {
  expect(toOathPath('/work/proj', '/work/proj')).toBe('/work/proj')
})
