import { expect, test } from 'vitest'
import { resolveScannerPlugins } from '../src/plugins/registry.js'

test('resolves known plugin names to ScannerPlugin instances', () => {
  const plugins = resolveScannerPlugins(['gherkinTables', 'gherkinDocStrings'])
  expect(plugins.map((p) => p.name)).toEqual(['gherkin/tables', 'gherkin/doc-strings'])
})

test('empty names resolve to an empty list', () => {
  expect(resolveScannerPlugins([])).toEqual([])
})

test('an unknown name throws, naming the plugin and the known names', () => {
  expect(() => resolveScannerPlugins(['gherkinTables', 'nope'])).toThrowError(
    /unknown scanner plugin "nope".*gherkinTables.*gherkinDocStrings/i,
  )
})
