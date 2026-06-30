import {
  type Diagnostic,
  type ExecutionPlan,
  parse,
  plan,
  type Registry,
  type Reporter,
  type ScannerPlugin,
} from '@oselvar/var-core'

export function planSpec(
  path: string,
  source: string,
  registry: Registry,
  scannerPlugins?: ReadonlyArray<ScannerPlugin>,
): ExecutionPlan {
  return plan(parse(path, source, scannerPlugins ?? []), registry)
}

export class RecordingReporter implements Reporter {
  readonly diagnostics: Diagnostic[] = []
  diagnostic(d: Diagnostic): void {
    this.diagnostics.push(d)
  }
}
