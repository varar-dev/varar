import {
  collectExamples,
  type Diagnostic,
  type ExecutionPlan,
  type OathWorkspace,
  type PlannedExample,
  parse,
  plan,
  type QueuedExample,
  type Registry,
  type Reporter,
} from '@varar/core'

export function examplesWithRuns(
  executionPlan: ExecutionPlan,
  createContext: (stepFile: string) => unknown | Promise<unknown>,
  reporter: Reporter,
): ReadonlyArray<{ readonly example: PlannedExample; readonly run: () => void | Promise<void> }> {
  const queued = collectExamples(executionPlan, { reporter, createContext })
  return executionPlan.examples.map((example, i) => ({
    example,
    run: (queued[i] as QueuedExample).run,
  }))
}

// Plan one oath. `workspace` carries every other oath in the project plus the
// sections a reference block consumes (ADR 0016) — it is required because an
// adapter that omitted it would run consumed sections as standalone examples,
// which is green and wrong. An adapter with no reference support yet passes
// emptyWorkspace(); one that discovers the project passes buildWorkspace(docs).
export function planOath(
  path: string,
  source: string,
  registry: Registry,
  workspace: OathWorkspace,
): ExecutionPlan {
  return plan(parse(path, source), registry, workspace)
}

export class RecordingReporter implements Reporter {
  readonly diagnostics: Diagnostic[] = []
  diagnostic(d: Diagnostic): void {
    this.diagnostics.push(d)
  }
}
