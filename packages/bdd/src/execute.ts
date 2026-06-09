import type { ExecutionPlan, PlannedStep } from './plan.js'
import type { Reporter, TestSink } from './ports.js'

export type ExecutePorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  // Per-example context factory. Called once per example before any step runs.
  // Defaults to `() => ({})` when omitted.
  readonly createContext?: () => unknown | Promise<unknown>
}

export function executePlan(plan: ExecutionPlan, ports: ExecutePorts): void {
  for (const d of plan.diagnostics) ports.reporter.diagnostic(d)
  const createContext = ports.createContext ?? (() => ({}))
  const path = plan.bdd.path
  const source = plan.bdd.source
  for (const ex of plan.examples) {
    ports.sink.example(ex.name, async () => {
      const ctx = await createContext()
      for (const step of ex.steps) {
        try {
          await step.stepDef.handler(ctx, ...step.args)
        } catch (err) {
          throw augmentError(err, step, path, source)
        }
      }
    })
  }
}

// When a step handler throws, attach two pieces of context to the error:
//   1. A markdown snippet appended to the message — shown above the stack
//      trace in vitest's output, so the user sees BOTH the failing line in
//      the .bdd.md AND the failing line in the .ts. Vitest only auto-renders
//      a snippet for the topmost stack frame (the .ts handler), so we render
//      the markdown snippet ourselves.
//   2. A synthetic stack frame pointing at the matched step text's location in
//      the source .bdd.md. Inserted BELOW the handler's `.ts` frame because
//      conceptually the markdown calls into the handler — the handler is the
//      callee (top of stack), the markdown is the caller (one level out).
function augmentError(
  err: unknown,
  step: PlannedStep,
  bddPath: string,
  bddSource: string,
): unknown {
  if (!(err instanceof Error)) return err
  const { startLine, startCol } = step.matchSpan

  if (!err.message.includes(bddPath)) {
    // Format the markdown snippet WITHOUT a leading-whitespace `at file:line:col`
    // pattern — vitest's stack parser eagerly treats those as additional frames
    // and pushes the real handler frame off the topmost-snippet slot.
    const snippet = renderMarkdownSnippet(bddSource, startLine, startCol)
    err.message = `${err.message}\n\n→ ${bddPath}:${startLine}:${startCol}\n${snippet}`
  }

  if (typeof err.stack === 'string') {
    const label = step.text.length > 60 ? `${step.text.slice(0, 60)}…` : step.text
    const frame = `    at ${label} (${bddPath}:${startLine}:${startCol})`
    const lines = err.stack.split('\n')
    let insertAt = 1
    for (let i = 1; i < lines.length; i++) {
      if (/^\s+at\s/.test(lines[i] ?? '')) {
        insertAt = i + 1
        break
      }
    }
    lines.splice(insertAt, 0, frame)
    err.stack = lines.join('\n')
  }

  return err
}

// Render a vitest-style code snippet of the markdown source around `line`,
// with a caret under `col`. Vitest's auto-rendered snippet uses the same
// `N| <content>` shape, so this looks consistent with the .ts snippet shown
// below it.
function renderMarkdownSnippet(source: string, line: number, col: number): string {
  const sourceLines = source.split('\n')
  const start = Math.max(1, line - 1)
  const end = Math.min(sourceLines.length, line + 1)
  const gutter = String(end).length
  const out: string[] = []
  for (let n = start; n <= end; n++) {
    const lineText = sourceLines[n - 1] ?? ''
    out.push(`    ${String(n).padStart(gutter)}| ${lineText}`)
    if (n === line) {
      out.push(`    ${' '.repeat(gutter)}| ${' '.repeat(Math.max(0, col - 1))}^`)
    }
  }
  return out.join('\n')
}
