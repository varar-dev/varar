// The test runners `varar init` knows how to scaffold, one row each.
//
// A runner is a CHOICE, not a constant: `@varar/vitest` is the only adapter
// today, but jest is the obvious second. Adding it must be a new row here plus
// its adapter package — nothing outside this table may name a runner, or the
// door closes again the first time someone special-cases `if (runner ===
// 'vitest')` in init.ts.

export type RunnerId = 'vitest' | 'jest'

export type Runner = {
  readonly id: RunnerId
  // The adapter that plugs var into this runner, or null when none exists yet.
  // A null adapter is a hard stop: scaffolding a project whose oaths cannot run
  // is worse than refusing.
  readonly adapter: string | null
  // Filenames whose presence means "this project already uses this runner".
  readonly configFiles: ReadonlyArray<string>
  // Any of these in an existing config means var is already wired into it.
  // Not just the adapter's package name: a monorepo may import the plugin and
  // the reporter by relative path, and re-adding the imports would bind those
  // identifiers twice.
  readonly wiredMarkers: ReadonlyArray<string>
  // Where a fresh config is written (the first configFiles entry).
  readonly configFile: string
  readonly config: string
  // Added to devDependencies. The adapter's version tracks the CLI's own, since
  // they are released together.
  readonly devDependencies: (version: string) => ReadonlyArray<readonly [string, string]>
  // Wire an EXISTING config that does not mention the adapter yet. Returns the
  // edited source, or null when the shape is not one we recognise — then init
  // prints `snippet` and leaves the file byte-identical.
  readonly wire: (source: string) => string | null
  readonly snippet: string
}

const VITEST_CONFIG = `import vararPlugin from '@varar/vitest'
import { VararResultsReporter } from '@varar/vitest/reporter'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Reads varar.config.json and drives vitest's include/exclude from its globs,
  // then transforms each oath into a test per example.
  plugins: [vararPlugin()],
  test: {
    // Records .varar/<oath>.json run results and the varar.lock.json drift
    // baseline. \`VARAR_UPDATE=1 vitest run\` accepts drift and re-records it.
    reporters: ['default', new VararResultsReporter()],
  },
})
`

const VITEST_SNIPPET = `import vararPlugin from '@varar/vitest'
import { VararResultsReporter } from '@varar/vitest/reporter'

// inside defineConfig({ … }):
  plugins: [vararPlugin()],
  test: {
    reporters: ['default', new VararResultsReporter()],
  },
`

const VITEST_IMPORTS = `import vararPlugin from '@varar/vitest'
import { VararResultsReporter } from '@varar/vitest/reporter'
`

// Insert `insertion` immediately after the sole occurrence of `anchor`. Returns
// null unless the anchor appears EXACTLY once: a config with two `plugins: [`
// (a projects array, a conditional branch) is not a shape a string edit can
// reason about, and guessing wrong corrupts a file the user wrote.
function insertAfterSole(source: string, anchor: string, insertion: string): string | null {
  const first = source.indexOf(anchor)
  if (first === -1) return null
  if (source.indexOf(anchor, first + anchor.length) !== -1) return null
  return source.slice(0, first + anchor.length) + insertion + source.slice(first + anchor.length)
}

// Deliberately narrow. Recognises one shape — a single `export default
// defineConfig({ … })` — and adds the plugin and the reporter to it. Anything
// else falls through to the printed snippet, which is a better outcome than a
// config mangled by a clever regex.
function wireVitest(source: string): string | null {
  const DEFINE = 'export default defineConfig({'
  if (insertAfterSole(source, DEFINE, '') === null) return null

  let out: string | null = source.includes('plugins: [')
    ? insertAfterSole(source, 'plugins: [', 'vararPlugin(), ')
    : insertAfterSole(source, DEFINE, '\n  plugins: [vararPlugin()],')
  if (out === null) return null

  if (out.includes('reporters: [')) {
    out = insertAfterSole(out, 'reporters: [', 'new VararResultsReporter(), ')
  } else if (out.includes('test: {')) {
    out = insertAfterSole(
      out,
      'test: {',
      "\n    reporters: ['default', new VararResultsReporter()],",
    )
  } else {
    out = insertAfterSole(
      out,
      DEFINE,
      "\n  test: { reporters: ['default', new VararResultsReporter()] },",
    )
  }
  if (out === null) return null
  return VITEST_IMPORTS + out
}

export const RUNNERS: ReadonlyArray<Runner> = [
  {
    id: 'vitest',
    adapter: '@varar/vitest',
    configFiles: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vitest.config.mjs'],
    wiredMarkers: ['@varar/vitest', 'vararPlugin', 'VararResultsReporter'],
    configFile: 'vitest.config.ts',
    config: VITEST_CONFIG,
    devDependencies: (version) => [
      ['@varar/varar', `^${version}`],
      ['@varar/vitest', `^${version}`],
      ['vitest', '^5.0.0'],
    ],
    wire: wireVitest,
    snippet: VITEST_SNIPPET,
  },
  {
    id: 'jest',
    adapter: null,
    configFiles: ['jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.cjs'],
    wiredMarkers: [],
    configFile: 'jest.config.ts',
    config: '',
    devDependencies: () => [],
    wire: () => null,
    snippet: '',
  },
]

export function runnerById(id: string): Runner | undefined {
  return RUNNERS.find((r) => r.id === id)
}

// What init can see of a project without deciding anything — the pure input to
// detection, so the rules below are testable without a filesystem.
export type ProjectProbe = {
  // Filenames present in cwd (not paths).
  readonly files: ReadonlySet<string>
  readonly devDependencies: ReadonlyArray<string>
  // package.json's `jest` key, which configures jest without a config file.
  readonly hasJestKey: boolean
  readonly testScript: string | undefined
}

export type Detection = { readonly runner: Runner; readonly reason: string }

// First match wins. Detection reports what it picked and why, because a wrong
// guess writes files.
export function detectRunner(probe: ProjectProbe): Detection {
  for (const runner of RUNNERS) {
    const found = runner.configFiles.find((f) => probe.files.has(f))
    if (found) return { runner, reason: `${found}` }
    if (runner.id === 'jest' && probe.hasJestKey) {
      return { runner, reason: 'a "jest" key in package.json' }
    }
  }
  for (const runner of RUNNERS) {
    if (probe.devDependencies.includes(runner.id)) {
      return { runner, reason: `${runner.id} in devDependencies` }
    }
  }
  for (const runner of RUNNERS) {
    // Word-boundary match: a script reading `vitest run` names vitest, one
    // reading `my-jester` does not.
    if (probe.testScript && new RegExp(`\\b${runner.id}\\b`).test(probe.testScript)) {
      return { runner, reason: `the "test" script` }
    }
  }
  const fallback = RUNNERS[0] as Runner
  return { runner: fallback, reason: 'nothing else to go on' }
}

export function noAdapterMessage(runner: Runner): string {
  const name = runner.id[0]?.toUpperCase() + runner.id.slice(1)
  return (
    `varar: no ${name} adapter yet — var cannot run oaths under ${runner.id}.\n` +
    `  Use \`varar init --runner vitest\`, or follow/open an issue at\n` +
    '  https://github.com/varar-dev/varar/issues\n'
  )
}
