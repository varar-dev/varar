import { describe, expect, test } from 'vitest'
import { generateVirtualModule, isVarSpecId, varVitestPlugin } from '../src/plugin.js'

describe('isVarSpecId', () => {
  const specs = new Set(['/abs/docs/hello.md', '/abs/docs/airport.md'])

  test('true when the id is a configured spec file', () => {
    expect(isVarSpecId('/abs/docs/hello.md', specs)).toBe(true)
  })

  test('false for a markdown file that is not a configured spec', () => {
    expect(isVarSpecId('/abs/README.md', specs)).toBe(false)
  })

  test('strips a vite query suffix before matching', () => {
    expect(isVarSpecId('/abs/docs/hello.md?v=123', specs)).toBe(true)
  })
})

describe('generateVirtualModule', () => {
  test('produces TS that imports runtime + toFailure, step files, and wires the meta-attaching sink', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: ['/abs/account.steps.ts'],
      scannerPluginNames: [],
    })
    expect(out).toContain("import { test as vitestTest } from 'vitest'")
    expect(out).toContain("import { resolveScannerPlugins } from '@oselvar/var-core'")
    expect(out).toContain("import { runVarSource, toFailure } from '@oselvar/var-vitest/runtime'")
    expect(out).toContain('import "/abs/account.steps.ts"')
    expect(out).toContain('const PATH = "/abs/foo.md"')
    expect(out).toContain('runVarSource(PATH, SOURCE,')
    expect(out).toContain('ctx.task.meta.varResult')
    expect(out).toContain('toFailure(error, PATH, lines[0] ?? 0)')
    expect(out).toContain('scannerPlugins: resolveScannerPlugins([])')
  })

  test('resolves configured scanner-plugin names via var-core so scannerPlugins reach the runtime', () => {
    const out = generateVirtualModule({
      varPath: '/abs/foo.md',
      stepImports: [],
      scannerPluginNames: ['gherkinTables', 'gherkinDocStrings'],
    })
    expect(out).toContain(
      'scannerPlugins: resolveScannerPlugins(["gherkinTables","gherkinDocStrings"])',
    )
  })
})

describe('varVitestPlugin', () => {
  test('returns a vite plugin object with name and resolveId/load hooks', () => {
    const plugin = varVitestPlugin()
    expect(plugin.name).toBe('@oselvar/var-vitest')
    expect(typeof plugin.load).toBe('function')
  })
})
