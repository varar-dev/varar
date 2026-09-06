import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { findFiles, loadConfig } from '@varar/config'
import {
  type Diagnostic,
  driftDiagnostics,
  type ExampleResult,
  hashSource,
  type OathResults,
  pruneBaselines,
  reconcileDrift,
  toFailure,
} from '@varar/core'
import { createFileBaselineStore, examplesWithRuns, loadSteps, planOath } from '@varar/runner'

export type RunOptions = {
  readonly cwd: string
  readonly writeStdout: (s: string) => void
  readonly writeStderr: (s: string) => void
  readonly globs?: ReadonlyArray<string> | undefined
  // Accept all current drift and re-record the baseline (snapshot-update
  // semantics). Also enabled by the VARAR_UPDATE environment variable.
  readonly update?: boolean
  // Print the run as JSON on stdout instead of the ✓/✗ report: one OathResults
  // per oath, the same payload the adapters persist to .varar/<oath>.json
  // (ADR 0014). Diagnostics stay on stderr, so stdout is always parseable.
  readonly json?: boolean
}

export type RunResult = { readonly exitCode: number }

export async function runRun(opts: RunOptions): Promise<RunResult> {
  const cfg = await loadConfig(opts.cwd)
  // A CLI `--globs` override is include-only; excludes live in varar.config.json.
  const globs =
    opts.globs && opts.globs.length > 0 ? { include: opts.globs, exclude: [] } : cfg.docs
  const oathFiles = findFiles(opts.cwd, globs.include, globs.exclude)

  const { registry, createContext } = await loadSteps(cfg.steps, opts.cwd)
  const baselineStore = createFileBaselineStore(opts.cwd)
  const update =
    opts.update === true || process.env.VARAR_UPDATE === '1' || process.env.VARAR_UPDATE === 'true'

  let passed = 0
  let failed = 0
  let errorDiagnostics = 0
  // Human-readable output only: in --json mode stdout carries the payload and
  // nothing else, or a consumer cannot parse it.
  const report = (s: string) => {
    if (opts.json !== true) opts.writeStdout(s)
  }
  const results: OathResults[] = []

  for (const path of oathFiles) {
    const source = readFileSync(path, 'utf8')
    const execution = planOath(path, source, registry)

    const reporter = {
      diagnostic: (d: Diagnostic) => {
        if (d.severity === 'error') errorDiagnostics++
        const where = `${path}:${d.span.startLine}:${d.span.startCol}`
        opts.writeStderr(`${d.severity}: ${d.code} at ${where}\n${indent(d.message, '  ')}\n`)
      },
    }

    const items = examplesWithRuns(execution, createContext, reporter)

    const rel = relative(opts.cwd, path) || path
    report(`${rel}\n`)
    const examples: ExampleResult[] = []
    for (const { example, run } of items) {
      const start = Date.now()
      // The same shape the vitest runtime records, built from the same plan —
      // one producer's worth of code, so a CLI run and a vitest run describe an
      // identical outcome identically.
      const lines = [...new Set(example.steps.map((s) => s.matchSpan.startLine))]
      try {
        await run()
        report(`  ✓ ${example.name} (${Date.now() - start}ms)\n`)
        examples.push({ name: example.name, status: 'passed', lines })
        passed++
      } catch (err) {
        report(`  ✗ ${example.name} (${Date.now() - start}ms)\n`)
        report(`${indent(formatError(err), '      ')}\n`)
        examples.push({
          name: example.name,
          status: 'failed',
          lines,
          failure: toFailure(err, path, lines[0] ?? 0),
        })
        failed++
      }
    }
    results.push({
      version: 1,
      oathPath: (relative(opts.cwd, path) || path).split(sep).join('/'),
      sourceHash: hashSource(source),
      examples,
    })

    // Reconcile drift against the committed baseline. On a clean run this
    // records/updates varar.lock.json; an unacknowledged drift is reported as an
    // error diagnostic (non-zero exit) and leaves the baseline untouched.
    const oathPath = rel.split(sep).join('/')
    const drifts = await reconcileDrift({
      store: baselineStore,
      oathPath,
      source,
      doc: execution.doc,
      plan: execution,
      update,
    })
    for (const d of driftDiagnostics(drifts)) reporter.diagnostic(d)
  }

  // Drop baselines for oaths the config no longer discovers — reconciliation is
  // per-oath and cannot see a path that has gone (#70). Keyed off cfg.docs, NOT
  // oathFiles: a `--globs` run is a filtered view, and pruning against it would
  // delete live baselines. Only `--update` writes; a plain run just reports.
  const configured = findFiles(opts.cwd, cfg.docs.include, cfg.docs.exclude).map((p) =>
    (relative(opts.cwd, p) || p).split(sep).join('/'),
  )
  const pruned = await pruneBaselines({ store: baselineStore, keepPaths: configured, update })
  for (const path of pruned) {
    opts.writeStderr(
      update
        ? `varar: pruned ${path} from varar.lock.json (no longer matched by docs globs)\n`
        : `varar: varar.lock.json still lists ${path}, which the docs globs no longer match — re-run with --update to prune it\n`,
    )
  }

  if (opts.json === true) {
    // One document rather than a line-per-oath stream: a run is bounded, the
    // records are small, and `JSON.parse(stdout)` (or a bare `jq`) beats making
    // every consumer reassemble NDJSON. Order follows the oaths as discovered.
    opts.writeStdout(`${JSON.stringify(results, null, 2)}\n`)
  }

  const total = passed + failed
  report(`\n${total} example${total === 1 ? '' : 's'}, ${passed} passed, ${failed} failed`)
  if (errorDiagnostics > 0) {
    report(`, ${errorDiagnostics} diagnostic${errorDiagnostics === 1 ? '' : 's'}`)
  }
  report('\n')

  return { exitCode: failed > 0 || errorDiagnostics > 0 ? 1 : 0 }
}

function indent(s: string, pad: string): string {
  return s
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n')
}

function formatError(err: unknown): string {
  if (err instanceof Error && typeof err.stack === 'string') return err.stack
  if (err instanceof Error) return err.message
  return String(err)
}
