import { expect, test } from 'vitest'
import { VERSION } from '../src/index.ts'

test('package exposes a version constant', () => {
  // release/stamp.sh rewrites this constant in src/index.ts at release time, so
  // pin the shape, not the value — asserting '0.0.0' would fail the gate that
  // `release/prepare.sh` runs after stamping.
  expect(VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/)
})
