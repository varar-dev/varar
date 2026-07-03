import { expect, test } from 'vitest'
import { inferStepRole } from '../src/step-role.js'

test('nothing after → sensor (expectation last)', () => {
  expect(inferStepRole({ before: ['stimulus'], after: [] })).toBe('sensor')
})

test('no neighbours at all → sensor', () => {
  expect(inferStepRole({ before: [], after: [] })).toBe('sensor')
})

test('steps follow → stimulus', () => {
  expect(inferStepRole({ before: [], after: ['sensor'] })).toBe('stimulus')
})

test('steps on both sides → stimulus', () => {
  expect(inferStepRole({ before: ['stimulus'], after: ['stimulus'] })).toBe('stimulus')
})
