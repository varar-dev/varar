import type { ExecutionPlan } from './plan.js'
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
  for (const ex of plan.examples) {
    ports.sink.example(ex.name, async () => {
      const ctx = await createContext()
      for (const step of ex.steps) {
        await step.stepDef.handler(ctx, ...step.args)
      }
    })
  }
}
