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

// Insert a synthetic V8 stack frame that points at the failing step's location
// inside the .bdd.md file. Terminals (vitest's reporter, iTerm, VSCode terminal)
// pattern-match `file:line:col` and make it cmd-clickable.
function augmentStack(err: unknown, step: PlannedStep, bddPath: string): unknown {
  if (!(err instanceof Error) || typeof err.stack !== 'string') return err
  const label = step.text.length > 60 ? `${step.text.slice(0, 60)}…` : step.text
  const frame = `    at ${label} (${bddPath}:${step.matchSpan.startLine}:${step.matchSpan.startCol})`
  const lines = err.stack.split('\n')
  // The first line is `Error: message`. Inject our frame as the topmost stack
  // entry so the .bdd.md location surfaces above the handler's `.ts` frame.
  lines.splice(1, 0, frame)
  err.stack = lines.join('\n')
  return err
}
