import { buildRegistry, contextFactory } from '@oselvar/var/registry'
import {
  executePlan,
  type Reporter,
  type ScannerPlugin,
  type TestSink,
  toFailure,
} from '@oselvar/var-core'
import { planSpec } from '@oselvar/var-runner'

export { toFailure }

export type RunPorts = {
  readonly sink: TestSink
  readonly reporter: Reporter
  // Opt-in scanner plugins (e.g. Gherkin tables, Gherkin doc strings) that
  // the var-vitest plugin forwards from var.config.json.
  readonly scannerPlugins?: ReadonlyArray<ScannerPlugin>
}

export function runVarSource(path: string, source: string, ports: RunPorts): void {
  const registry = buildRegistry()
  const p = planSpec(path, source, registry, ports.scannerPlugins)
  executePlan(p, { ...ports, createContext: contextFactory() })
}
