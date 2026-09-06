import { describe, expect, test } from 'vitest'
import { detectRunner, type ProjectProbe, RUNNERS, runnerById } from '../src/runners.ts'

function probe(overrides: Partial<ProjectProbe> = {}): ProjectProbe {
  return {
    files: new Set<string>(),
    devDependencies: [],
    hasJestKey: false,
    testScript: undefined,
    ...overrides,
  }
}

describe('detectRunner', () => {
  test('an existing runner config wins over everything else', () => {
    const d = detectRunner(
      probe({ files: new Set(['jest.config.ts']), devDependencies: ['vitest'] }),
    )
    expect(d.runner.id).toBe('jest')
    expect(d.reason).toBe('jest.config.ts')
  })

  test('a "jest" key in package.json counts as a config', () => {
    expect(detectRunner(probe({ hasJestKey: true })).runner.id).toBe('jest')
  })

  test('falls back to devDependencies, then the test script', () => {
    expect(detectRunner(probe({ devDependencies: ['jest', 'typescript'] })).runner.id).toBe('jest')
    expect(detectRunner(probe({ testScript: 'jest --ci' })).runner.id).toBe('jest')
  })

  test('a test script that merely contains the name as a substring does not count', () => {
    expect(detectRunner(probe({ testScript: 'run-my-jester' })).runner.id).toBe('vitest')
  })

  test('defaults to vitest with nothing to go on', () => {
    const d = detectRunner(probe())
    expect(d.runner.id).toBe('vitest')
    expect(d.reason).toBe('nothing else to go on')
  })
})

describe('the runner table is the extension point', () => {
  test('every runner declares a config file it also detects', () => {
    for (const r of RUNNERS) expect(r.configFiles).toContain(r.configFile)
  })

  test('jest is a row with no adapter, not a special case', () => {
    expect(runnerById('jest')?.adapter).toBeNull()
    expect(runnerById('vitest')?.adapter).toBe('@varar/vitest')
    expect(runnerById('mocha')).toBeUndefined()
  })
})

describe('wiring an existing vitest config', () => {
  const vitest = runnerById('vitest')

  test('adds the plugin and the reporter to a plain defineConfig', () => {
    const wired = vitest?.wire(
      "import { defineConfig } from 'vitest/config'\n\nexport default defineConfig({\n  test: {\n    globals: true,\n  },\n})\n",
    )
    expect(wired).toContain("import vararPlugin from '@varar/vitest'")
    expect(wired).toContain('plugins: [vararPlugin()]')
    expect(wired).toContain("reporters: ['default', new VararResultsReporter()]")
    // The user's own settings survive.
    expect(wired).toContain('globals: true')
  })

  test('joins an existing plugins array and an existing reporters array', () => {
    const wired = vitest?.wire(
      "export default defineConfig({\n  plugins: [react()],\n  test: { reporters: ['verbose'] },\n})\n",
    )
    expect(wired).toContain('plugins: [vararPlugin(), react()]')
    expect(wired).toContain("reporters: [new VararResultsReporter(), 'verbose']")
  })

  test('declines a config whose shape it cannot reason about', () => {
    // Two `plugins: [` — a projects array, a conditional branch — is exactly
    // the case where a string edit would guess wrong.
    expect(
      vitest?.wire(
        'export default defineConfig({\n  plugins: [a()],\n  test: { projects: [{ plugins: [b()] }] },\n})\n',
      ),
    ).toBeNull()
    // Not a `defineConfig` call at all.
    expect(vitest?.wire('const config = { test: {} }\nexport default config\n')).toBeNull()
  })
})
