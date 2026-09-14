import {
  buildWorkspace,
  type CellDiff,
  deriveOathBaseline,
  detectDrift,
  driftDiagnostics,
  isCellMismatchError,
  type OathBaseline,
  type OathWorkspace,
  parse,
  type Reporter,
  toFailure,
} from '@varar/core'
import { examplesWithRuns, planOath } from '@varar/runner'
import { buildRegistry, contextFactory } from '@varar/varar/registry'
import { test } from 'vitest'

export type CollectPorts = {
  // Defaults to registering one failing vitest test per diagnostic. The
  // registration lives HERE (not in the generated module) so editors doing
  // static AST test discovery on the transformed oath never see a phantom
  // `test(...)` callsite — only the real per-example ones.
  readonly reporter?: Reporter
  // The number of examples the build-time static plan produced. When the
  // runtime plan disagrees (a step definition the static scanner could not
  // see appeared or vanished), a failing guard test is registered instead of
  // letting the suites silently diverge.
  readonly expectedCount?: number
  // This oath's committed drift baseline (from varar.lock.json), injected by the
  // plugin. When present, drift is detected and reported as a diagnostic (a
  // failing `varar:diagnostic:drift` test). VARAR_UPDATE=1 accepts all drift:
  // the gate is skipped and the baseline is re-recorded by the reporter at the
  // end of the run.
  readonly baseline?: OathBaseline | null
  // The project's reference topology, inlined by the plugin (ADR 0016): the
  // sources of every oath this one references, transitively, plus the
  // consumed-section keys. Absent in a project that uses no reference blocks.
  readonly workspace?: {
    readonly sources: Readonly<Record<string, string>>
    readonly referenced: ReadonlyArray<string>
  }
}

// Baselines derived at collection time, keyed by oath path, waiting for a test
// body to attach them to the file's task meta (the only channel out of the
// worker). Module-scoped because one worker collects several oaths; an entry is
// consumed on first attach, so a re-collected oath (watch mode) always parks a
// freshly derived baseline rather than reusing a stale one.
const pendingBaselines = new Map<string, OathBaseline>()

// The referenced documents this oath's steps came from, parked beside the
// baseline and attached on the same channel.
const pendingDocuments = new Map<string, Readonly<Record<string, string>>>()

// The key the file-level task meta carries the derived baseline under. The
// reporter reads it back through vitest's TestModule.meta().
export const VARAR_BASELINE_META = 'vararBaseline'

// Marks an oath module that is a discovered oath but contributes no standalone
// example, because every section it holds is referenced from another oath (ADR
// 0016). The reporter writes it an EMPTY .varar/<oath>.json: skipping the file
// would leave the language server showing diagnostics from the run before the
// section was consumed.
export const VARAR_CONSUMED_META = 'vararConsumed'

// The sources of every OTHER oath this one's steps were spliced in from (ADR
// 0016), parked on the file's task meta for the reporter to hash into the run
// result's `documents`. Absent when nothing was spliced in.
export const VARAR_DOCUMENTS_META = 'vararDocuments'

export type CollectedExample = {
  readonly name: string
  // Unique source lines of the example's matched steps, for the reporter.
  // Lines in THIS oath. A step a reference block spliced in from another oath
  // (ADR 0016) contributes none: its line belongs to that document, and a
  // line-wash renderer would otherwise decorate an unrelated sentence here.
  readonly lines: ReadonlyArray<number>
  readonly run: () => void | Promise<void>
}

// Build the registry from the step modules the virtual module imported, plan
// the oath, and hand back one lazily-executed closure per example. The
// virtual module registers one STATIC `test("literal name", ...)` per example
// — so editors can discover names and locations without running anything —
// and looks each body up here by index via `vararTestBody`.
export function collectVararExamples(
  path: string,
  source: string,
  ports: CollectPorts,
): ReadonlyArray<CollectedExample> {
  const reporter: Reporter = ports.reporter ?? {
    diagnostic: (d) =>
      test(`varar:diagnostic:${d.code}`, () => {
        throw new Error(d.message)
      }),
  }
  const registry = buildRegistry()
  const workspace = runtimeWorkspace(path, source, ports)
  const p = planOath(path, source, registry, workspace)
  // Hashes for the documents this oath spliced steps in from go in the run
  // result, so a consumer can tell a stale failure from a live one.
  const spliced = new Set(
    p.examples.flatMap((ex) => ex.steps.map((s) => s.docPath).filter((d) => d !== undefined)),
  )
  if (spliced.size > 0) {
    pendingDocuments.set(
      path,
      Object.fromEntries(
        [...spliced].map((docPath) => [docPath, workspace.docs.get(docPath)?.source ?? '']),
      ),
    )
  }
  // Drift reconciliation, split across the process boundary. Detection happens
  // HERE, against the runtime plan — the same plan every other port reconciles
  // from (RSpec at describe time, JUnit in its selector resolver). A paragraph
  // the baseline recorded as an example that now matches no step surfaces as a
  // drift diagnostic (a failing test); VARAR_UPDATE=1 accepts all drift and
  // skips the gate.
  //
  // The WRITE cannot happen here: this runs per oath, in a worker, in parallel.
  // So a clean (or accepted) run derives the new baseline and parks it for the
  // reporter, which writes varar.lock.json once, in the main process, at the end
  // of the run. An unacknowledged drift parks nothing, so the old entry stands.
  const update = process.env.VARAR_UPDATE === '1' || process.env.VARAR_UPDATE === 'true'
  const drifts = update ? [] : detectDrift(ports.baseline ?? undefined, p.doc, p)
  for (const d of driftDiagnostics(drifts)) reporter.diagnostic(d)
  if (drifts.length === 0) pendingBaselines.set(path, deriveOathBaseline(source, p.doc, p))
  const examples = examplesWithRuns(p, contextFactory(), reporter).map(({ example, run }) => ({
    name: example.name,
    lines: [
      ...new Set(
        example.steps.filter((s) => s.docPath === undefined).map((s) => s.matchSpan.startLine),
      ),
    ],
    run,
  }))
  if (ports.expectedCount !== undefined && examples.length !== ports.expectedCount) {
    test('varar:stale-oath-transform', () => {
      throw new Error(
        `expected ${ports.expectedCount} example(s) in ${path} but the runtime planned ` +
          `${examples.length} — the step definitions changed after this oath was transformed; re-run the suite`,
      )
    })
  }
  return examples
}

// Structural slice of vitest's TestContext — enough to attach vararResult (per
// test) and the derived baseline (once per file) without importing vitest types
// into the runtime.
type TaskContext = {
  readonly task: {
    readonly meta: { vararResult?: unknown }
    readonly file?: { readonly meta: Record<string, unknown> }
  }
}

// Hand the collection-time baseline to the main process on the FILE's task meta,
// where the reporter reads it as TestModule.meta(). Per file, not per test: the
// baseline lists every example, so attaching it to each test would make the
// worker→reporter payload quadratic in a header-bound table's row count.
// Deleting on attach makes this a one-shot per collection.
function attachBaseline(ctx: TaskContext, path: string): void {
  const fileMeta = ctx.task.file?.meta
  if (!fileMeta) return
  const documents = pendingDocuments.get(path)
  // One-shot, like the baseline below: in watch mode an oath whose reference
  // was removed collects again without setting an entry, and a stale map
  // left here would be attached — and its hashes written — a second time.
  pendingDocuments.delete(path)
  if (documents && Object.keys(documents).length > 0) fileMeta[VARAR_DOCUMENTS_META] = documents
  const baseline = pendingBaselines.get(path)
  if (!baseline) return
  pendingBaselines.delete(path)
  fileMeta[VARAR_BASELINE_META] = baseline
}

// A single failing cell diffs as its bare value ("JMK" vs "JFK"); several diff
// as a value list in document order (`["LGR", "JMK"]` vs `["LHR", "JFK"]`).
// The surrounding step text stays out of the pair — the editor squiggles and
// the error message already locate each cell, so the diff carries only what
// differs, which keeps VS Code's one-line inline decoration legible.
function renderCells(cells: ReadonlyArray<CellDiff>, key: 'expected' | 'actual'): string {
  return cells.length === 1
    ? (cells[0] as CellDiff)[key]
    : `[${cells.map((c) => JSON.stringify(c[key])).join(', ')}]`
}

// vitest renders a `- Expected / + Received` diff for any thrown error that
// carries `expected` and `actual` (and the VS Code vitest extension shows the
// same pair in its diff peek), so project the mismatch's structured diff onto
// that pair before the error crosses into vitest. A `format`-rendered cell
// diffs as its document-notation strings ("£2.55" vs "£2.50") — that pair IS
// the diff the author asked for by writing a format. Only an UNFORMATTED
// single object mismatch attaches the raw values instead, so vitest renders
// a structural object diff rather than two JSON strings. Presentation only —
// the pass/fail verdict stays the core's comparison.
function attachExpectedActual(error: unknown): void {
  const e = error as { expected?: unknown; actual?: unknown }
  if (isCellMismatchError(error)) {
    const bad = error.cells
      .filter((c) => !c.ok)
      .sort((a, b) => a.span.startOffset - b.span.startOffset)
    if (bad.length === 0) return
    const single = bad.length === 1 ? (bad[0] as CellDiff) : undefined
    if (
      single &&
      !single.formatted &&
      'actualValue' in single &&
      typeof single.actualValue === 'object'
    ) {
      e.expected = single.expectedValue
      e.actual = single.actualValue
      return
    }
    e.expected = renderCells(bad, 'expected')
    e.actual = renderCells(bad, 'actual')
  }
}

// The body of the single bookkeeping test a fully-consumed oath registers: it
// contributes no standalone example (every section it holds is referenced from
// another oath — ADR 0016), but it is still a discovered oath, so its drift
// baseline must be recorded like any other's. Registering one test is also what
// keeps vitest from failing the file outright, which it does for a module that
// declares no test at all.
export function vararConsumedBody(path: string): (ctx: TaskContext) => void {
  return (ctx) => {
    attachBaseline(ctx, path)
    const fileMeta = ctx.task.file?.meta
    if (fileMeta) fileMeta[VARAR_CONSUMED_META] = true
  }
}

export function vararTestBody(
  examples: ReadonlyArray<CollectedExample>,
  index: number,
  name: string,
  path: string,
): (ctx: TaskContext) => Promise<void> {
  return async (ctx) => {
    attachBaseline(ctx, path)
    const ex = examples[index]
    if (!ex || ex.name !== name) {
      throw new Error(
        `stale oath transform: expected example #${index} of ${path} to be named ` +
          `${JSON.stringify(name)}${ex ? `, found ${JSON.stringify(ex.name)}` : ', but it no longer exists'}. ` +
          'The step definitions changed after this oath was transformed — re-run the suite.',
      )
    }
    const lines = ex.lines
    try {
      await ex.run()
      ctx.task.meta.vararResult = { name, status: 'passed', lines }
    } catch (error) {
      ctx.task.meta.vararResult = {
        name,
        status: 'failed',
        lines,
        failure: toFailure(error, path, lines[0] ?? 0),
      }
      attachExpectedActual(error)
      throw error
    }
  }
}

// Rebuild the workspace the plugin saw, from what it inlined. The referencing
// oath itself is included, so a same-file reference resolves; `referenced` is
// project-wide, so this oath's own consumed sections are suppressed here
// exactly as they were in the build-time plan.
function runtimeWorkspace(path: string, source: string, ports: CollectPorts): OathWorkspace {
  const inlined = ports.workspace
  if (!inlined || inlined.referenced.length === 0) {
    return buildWorkspace([])
  }
  const docs = [
    parse(path, source),
    ...Object.entries(inlined.sources).map(([p, s]) => parse(p, s)),
  ]
  return { docs: new Map(docs.map((d) => [d.path, d])), referenced: new Set(inlined.referenced) }
}
