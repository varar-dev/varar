import {
  type BaselineStore,
  type Drift,
  type ExampleResult,
  executePlan,
  hashSource,
  type OathResults,
  parse,
  plan,
  reconcileDrift,
  type TestSink,
  toFailure,
} from '@varar/core'
import { buildRegistry, contextFactory } from '@varar/varar/registry'

export type RunOutcome = {
  readonly results: OathResults
  readonly drifts: ReadonlyArray<Drift>
}

export type RunOathOptions = {
  readonly exampleIndex?: number
  // When present, drift is reconciled against this store (in-memory in the
  // browser). Omit to skip drift entirely.
  readonly baselineStore?: BaselineStore
  // Accept all current drift: re-record the baseline instead of reporting it.
  readonly update?: boolean
}

export async function runRegisteredOath(
  varPath: string,
  varSource: string,
  options: RunOathOptions = {},
): Promise<RunOutcome> {
  const registry = buildRegistry()
  const varDoc = parse(varPath, varSource, [])
  const full = plan(varDoc, registry)
  const { exampleIndex } = options
  const examples =
    exampleIndex == null ? full.examples : full.examples.filter((_, i) => i === exampleIndex)
  const toRun = { ...full, examples }

  const out: ExampleResult[] = new Array(examples.length)
  const pending: Promise<void>[] = []
  let i = 0
  const createContext = contextFactory()
  const sink: TestSink = {
    example(name, run) {
      const idx = i++
      // biome-ignore lint/style/noNonNullAssertion: example() is invoked once per examples entry, so idx is in range
      const ex = examples[idx]!
      const lines = [...new Set(ex.steps.map((s) => s.matchSpan.startLine))]
      pending.push(
        (async () => {
          try {
            await run()
            out[idx] = { name, status: 'passed', lines }
          } catch (err) {
            out[idx] = {
              name,
              status: 'failed',
              lines,
              failure: toFailure(err, varPath, lines[0] ?? 0),
            }
          }
        })(),
      )
    },
  }

  executePlan(toRun, { sink, reporter: { diagnostic() {} }, createContext })
  await Promise.all(pending)
  const results: OathResults = {
    version: 1,
    oathPath: varPath,
    sourceHash: hashSource(varSource),
    examples: out,
  }

  // Drift is reconciled against the FULL plan (never a single-example filter),
  // so running one example can't make the others look drifted.
  const drifts =
    options.baselineStore && exampleIndex == null
      ? await reconcileDrift({
          store: options.baselineStore,
          oathPath: varPath,
          source: varSource,
          varDoc,
          plan: full,
          update: options.update,
        })
      : []

  return { results, drifts }
}
