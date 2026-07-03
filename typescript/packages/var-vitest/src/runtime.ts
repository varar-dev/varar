import { buildRegistry, contextFactory } from '@oselvar/var/registry'
import {
  isCellMismatchError,
  isDocStringMismatchError,
  type Reporter,
  resolveScannerPlugins,
  toFailure,
} from '@oselvar/var-core'
import { examplesWithRuns, planSpec } from '@oselvar/var-runner'
import { test } from 'vitest'

export type CollectPorts = {
  // Defaults to registering one failing vitest test per diagnostic. The
  // registration lives HERE (not in the generated module) so editors doing
  // static AST test discovery on the transformed spec never see a phantom
  // `test(...)` callsite — only the real per-example ones.
  readonly reporter?: Reporter
  // Opt-in scanner-plugin NAMES (e.g. 'gherkinTables') that the var-vitest
  // plugin forwards from var.config.json. Resolved here against var-core's
  // registry: the generated virtual module resolves in the CONSUMER's
  // project, where pnpm's strict layout only sees direct dependencies — so
  // it may import @oselvar/var-vitest but never @oselvar/var-core.
  readonly scannerPlugins?: ReadonlyArray<string>
  // The number of examples the build-time static plan produced. When the
  // runtime plan disagrees (a step definition the static scanner could not
  // see appeared or vanished), a failing guard test is registered instead of
  // letting the suites silently diverge.
  readonly expectedCount?: number
}

export type CollectedExample = {
  readonly name: string
  // Unique source lines of the example's matched steps, for the reporter.
  readonly lines: ReadonlyArray<number>
  readonly run: () => void | Promise<void>
}

// Build the registry from the step modules the virtual module imported, plan
// the spec, and hand back one lazily-executed closure per example. The
// virtual module registers one STATIC `test("literal name", ...)` per example
// — so editors can discover names and locations without running anything —
// and looks each body up here by index via `varTestBody`.
export function collectVarExamples(
  path: string,
  source: string,
  ports: CollectPorts,
): ReadonlyArray<CollectedExample> {
  const reporter: Reporter = ports.reporter ?? {
    diagnostic: (d) =>
      test(`var:diagnostic:${d.code}`, () => {
        throw new Error(d.message)
      }),
  }
  const registry = buildRegistry()
  const p = planSpec(
    path,
    source,
    registry,
    ports.scannerPlugins && resolveScannerPlugins(ports.scannerPlugins),
  )
  const examples = examplesWithRuns(p, contextFactory(), reporter).map(({ example, run }) => ({
    name: example.name,
    lines: [...new Set(example.steps.map((s) => s.matchSpan.startLine))],
    run,
  }))
  if (ports.expectedCount !== undefined && examples.length !== ports.expectedCount) {
    test('var:stale-spec-transform', () => {
      throw new Error(
        `expected ${ports.expectedCount} example(s) in ${path} but the runtime planned ` +
          `${examples.length} — the step definitions changed after this spec was transformed; re-run the suite`,
      )
    })
  }
  return examples
}

// Structural slice of vitest's TestContext — enough to attach varResult
// without importing vitest types into the runtime.
type TaskContext = { readonly task: { readonly meta: { varResult?: unknown } } }

// vitest renders a `- Expected / + Received` diff for any thrown error that
// carries `expected` and `actual` (and the VS Code vitest extension shows the
// same pair in its diff peek), so project the mismatch's structured diff onto
// those two strings before the error crosses into vitest. Presentation only —
// the pass/fail verdict stays the core's exact string comparison.
function attachExpectedActual(error: unknown): void {
  const e = error as { expected?: string; actual?: string }
  if (isCellMismatchError(error)) {
    const cells = error.cells.filter((c) => !c.ok)
    const first = cells[0]
    if (!first) return
    if (cells.length === 1) {
      e.expected = first.expected
      e.actual = first.actual
    } else {
      e.expected = cells.map((c) => `${c.column}: ${c.expected}`).join('\n')
      e.actual = cells.map((c) => `${c.column}: ${c.actual}`).join('\n')
    }
  } else if (isDocStringMismatchError(error)) {
    e.expected = error.diff.expected
    e.actual = error.diff.actual
  }
}

export function varTestBody(
  examples: ReadonlyArray<CollectedExample>,
  index: number,
  name: string,
  path: string,
): (ctx: TaskContext) => Promise<void> {
  return async (ctx) => {
    const ex = examples[index]
    if (!ex || ex.name !== name) {
      throw new Error(
        `stale spec transform: expected example #${index} of ${path} to be named ` +
          `${JSON.stringify(name)}${ex ? `, found ${JSON.stringify(ex.name)}` : ', but it no longer exists'}. ` +
          'The step definitions changed after this spec was transformed — re-run the suite.',
      )
    }
    const lines = ex.lines
    try {
      await ex.run()
      ctx.task.meta.varResult = { name, status: 'passed', lines }
    } catch (error) {
      ctx.task.meta.varResult = {
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
