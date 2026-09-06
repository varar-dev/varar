import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { findFiles, loadConfig } from '@varar/config'
import {
  type ExampleResult,
  type LockFile,
  type OathBaseline,
  parseLockFile,
  pruneBaselines,
  stringifyLockFile,
} from '@varar/core'
import {
  buildOathResults,
  createFileBaselineStore,
  toOathPath,
  writeOathResults,
} from '@varar/runner'
import type { Reporter, TestModule } from 'vitest/node'
import { VARAR_BASELINE_META } from './runtime.ts'

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
// The baseline arrives on the FILE's meta rather than any test's, so the
// collector below reads a different slice of the same TestModule.
type BaselineModuleNode = {
  readonly moduleId: string
  meta(): unknown
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

// The baseline each oath module derived at collection time (runtime.ts parks it
// on the file's task meta). A module with no entry is one whose drift was NOT
// acknowledged, or which never ran — either way its committed entry stands.
export function collectBaselines(
  testModules: ReadonlyArray<BaselineModuleNode>,
): ReadonlyMap<string, OathBaseline> {
  const byFile = new Map<string, OathBaseline>()
  for (const m of testModules) {
    const baseline = (m.meta() as Record<string, unknown> | null | undefined)?.[
      VARAR_BASELINE_META
    ] as OathBaseline | undefined
    if (baseline) byFile.set(m.moduleId, baseline)
  }
  return byFile
}

// Fold this run's derived baselines into the committed lock. Entries for oaths
// that did not run are carried over untouched — vitest runs are routinely
// filtered (`vitest run varar/library.md`), and a filtered run must not shrink
// the lock. Key order is irrelevant: stringifyLockFile sorts, so the bytes
// depend only on the entries.
export function mergeLockFile(
  current: LockFile | null,
  baselines: ReadonlyMap<string, OathBaseline>,
): LockFile {
  return { version: 2, oaths: { ...(current?.oaths ?? {}), ...Object.fromEntries(baselines) } }
}

export type VararResultsReporterOptions = {
  readonly cwd?: string
  // Record varar.lock.json at the end of the run (default true). Turn it off
  // when this cwd is not the project that OWNS the oaths — a workspace root
  // whose `docs` globs reach down into a nested project would otherwise write a
  // second lock, keyed by a longer path, that nothing ever reads.
  readonly writeBaseline?: boolean
  readonly writeStderr?: (s: string) => void
}

// Vitest reporter (the only side-effecting piece). Writes both artifacts of a
// run: .varar/<oath>.json run records (ADR 0014) and the varar.lock.json drift
// baseline (ADR 0002). Registry-free — every ExampleResult and every derived
// baseline arrives prebuilt on task meta from the worker.
//
// End of run is the right moment for both, and the only one available: the
// plugin is a build-time transform, running per file, in parallel, and again on
// every watch-mode change, so it must not write. This hook is the same point at
// which pytest, JUnit, RSpec, cargo and vstest write their baselines.
export class VararResultsReporter implements Reporter {
  private readonly cwd: string
  private readonly baseline: boolean
  private readonly writeStderr: (s: string) => void
  constructor(options: VararResultsReporterOptions = {}) {
    this.cwd = options.cwd ?? process.cwd()
    this.baseline = options.writeBaseline ?? true
    this.writeStderr = options.writeStderr ?? ((s) => void process.stderr.write(s))
  }

  private writeResults(byFile: ReadonlyMap<string, ReadonlyArray<ExampleResult>>): void {
    for (const [filepath, examples] of byFile) {
      const oathPath = toOathPath(filepath, this.cwd)
      const source = readFileSync(filepath, 'utf8')
      writeOathResults(this.cwd, buildOathResults(oathPath, source, examples))
    }
  }

  private async writeBaselines(
    baselines: ReadonlyMap<string, OathBaseline>,
    ranAnyOath: boolean,
  ): Promise<void> {
    // A run that collected no oath at all (a plain unit-test run in a mixed
    // project) is not evidence about the lock, so it neither records nor prunes.
    if (!ranAnyOath || !this.baseline) return
    const store = createFileBaselineStore(this.cwd)
    if (baselines.size > 0) {
      const byOathPath = new Map(
        [...baselines].map(([filepath, b]) => [toOathPath(filepath, this.cwd), b] as const),
      )
      const text = await store.read()
      await store.write(
        stringifyLockFile(mergeLockFile(text ? parseLockFile(text) : null, byOathPath)),
      )
    }
    // Prune entries for oaths the config no longer discovers (#70). Keyed off
    // `docs`, NOT the oaths that ran: a filtered run is a partial view, and
    // pruning against it would delete live baselines. Only VARAR_UPDATE writes;
    // a plain run just reports.
    const update = process.env.VARAR_UPDATE === '1' || process.env.VARAR_UPDATE === 'true'
    const cfg = await loadConfig(this.cwd)
    const configured = findFiles(this.cwd, cfg.docs.include, cfg.docs.exclude).map((p) =>
      (relative(this.cwd, p) || p).split(sep).join('/'),
    )
    for (const path of await pruneBaselines({ store, keepPaths: configured, update })) {
      this.writeStderr(
        update
          ? `varar: pruned ${path} from varar.lock.json (no longer matched by docs globs)\n`
          : `varar: varar.lock.json still lists ${path}, which the docs globs no longer match — re-run with VARAR_UPDATE=1 to prune it\n`,
      )
    }
  }

  // Reporter hook (TestModule API). Called after all tests finish. vitest's
  // `TestModule` structurally satisfies both the `TestModuleNode` and the
  // `BaselineModuleNode` the pure collectors consume.
  async onTestRunEnd(testModules: ReadonlyArray<TestModule> = []): Promise<void> {
    const byFile = collectFromModules(testModules)
    this.writeResults(byFile)
    await this.writeBaselines(collectBaselines(testModules), byFile.size > 0)
  }
}
