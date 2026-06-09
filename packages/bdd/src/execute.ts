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
  for (const ex of plan.examples) {
    ports.sink.example(ex.name, async () => {
      const ctx = await createContext()
      for (const step of ex.steps) {
        try {
          await step.stepDef.handler(ctx, ...step.args)
        } catch (err) {
          throw augmentStack(err, step, path)
        }
      }
    })
  }
}

// Inject a synthetic V8 stack frame pointing at the matched step text's
// location in the source .bdd.md. Terminals (vitest, iTerm, VSCode) recognize
// the `file:line:col` pattern and make it cmd-clickable. The frame sits
// directly BELOW the handler's `.ts` frame — conceptually the markdown calls
// into the handler, so the handler is the callee (top) and the markdown is
// the caller (one level out). Vitest's reporter auto-renders the code snippet
// for the topmost frame, so the `.ts` source stays as the main error location
// and the .bdd.md becomes a clickable link directly under it.
function augmentStack(err: unknown, step: PlannedStep, bddPath: string): unknown {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return err
  const label = step.text.length > 60 ? `${step.text.slice(0, 60)}…` : step.text
  const frame = `    at ${label} (${bddPath}:${step.matchSpan.startLine}:${step.matchSpan.startCol})`
  const lines = err.stack.split('\n')
  // Find the first existing stack frame (the handler's `.ts` line) and insert
  // immediately after it. If the error has no frames, fall back to position 1.
  let insertAt = 1
  for (let i = 1; i < lines.length; i++) {
    if (/^\s+at\s/.test(lines[i] ?? '')) {
      insertAt = i + 1
      break
    }
  }
  lines.splice(insertAt, 0, frame)
  err.stack = lines.join('\n')
  return err
}
