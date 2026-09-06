import { readFileSync } from 'node:fs'
import type { ExampleResult } from '@varar/core'
import { buildOathResults, toOathPath, writeOathResults } from '@varar/runner'
import type { Reporter, TestModule } from 'vitest/node'

// Structural shape of the slice of vitest's TestModule API the collector reads.
// `meta()` is typed `unknown` so both vitest's real `TestModule` (whose
// `meta()` returns the augmentation-free `TaskMeta`) and the plain test fakes
// satisfy it without a module augmentation — the plugin stashes each example's
// result on `ctx.task.meta.vararResult`, which we narrow when reading.
type TestCaseNode = {
  meta(): unknown
}
type TestModuleNode = {
  readonly moduleId: string
  readonly children: { allTests(): Iterable<TestCaseNode> }
}

// Group every test's meta.vararResult by its owning oath module, in declaration
// order. Modules that produced no var results (e.g. only var:diagnostic tasks)
// are skipped.
export function collectFromModules(
  testModules: ReadonlyArray<TestModuleNode>,
): ReadonlyMap<string, ReadonlyArray<ExampleResult>> {
  const byFile = new Map<string, ExampleResult[]>()
  for (const m of testModules) {
    const examples: ExampleResult[] = []
    for (const tc of m.children.allTests()) {
      const vararResult = (tc.meta() as { vararResult?: ExampleResult } | null | undefined)
        ?.vararResult
      if (vararResult) examples.push(vararResult)
    }
    if (examples.length > 0) byFile.set(m.moduleId, examples)
  }
  return byFile
}

export type VararResultsReporterOptions = { readonly cwd?: string }

// Vitest reporter (the only side-effecting piece). Reads each oath's source,
// hashes it, and writes .varar/<oath>.json through the shared runner writer —
// the same one `varar run` uses, so a CLI run and a vitest run leave identical
// records. Registry-free: every ExampleResult arrives prebuilt on task.meta
// from the worker.
export class VararResultsReporter implements Reporter {
  private readonly cwd: string
  constructor(options: VararResultsReporterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
  }

  private writeResults(byFile: ReadonlyMap<string, ReadonlyArray<ExampleResult>>): void {
    for (const [filepath, examples] of byFile) {
      const oathPath = toOathPath(filepath, this.cwd)
      const source = readFileSync(filepath, 'utf8')
      writeOathResults(this.cwd, buildOathResults(oathPath, source, examples))
    }
  }

  // Reporter hook (TestModule API). Called after all tests finish. vitest's
  // `TestModule` structurally satisfies the `TestModuleNode` the pure collector
  // consumes.
  onTestRunEnd(testModules: ReadonlyArray<TestModule> = []): void {
    this.writeResults(collectFromModules(testModules))
  }
}
