import {
  addStep,
  createRegistry,
  defineParameterType as defineParameterTypeCore,
  type Registry,
  type StepHandler,
  type StepKind,
} from '@oselvar/var'

type Entry = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
  readonly handler: StepHandler
  readonly kind: StepKind
}

type CustomTypeDef = {
  readonly name: string
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly transformer: (...captures: string[]) => unknown
}

let steps: Entry[] = []
// One context factory per stepfile. Each .steps.ts that calls
// defineState() owns its own slice of state; steps from different
// stepfiles never see each other's context.
const contextFactoriesByFile = new Map<string, () => unknown | Promise<unknown>>()
let customTypes: CustomTypeDef[] = []

function registerStep(expression: string, handler: StepHandler, kind: StepKind): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler, kind })
}

// A context/action handler runs for its side effects only. `Args` is inferred
// from the handler's own parameter list, so authors annotate the captured
// arguments (`(ctx, name: string) => …`) without a cast and without TS2345.
export type RoleFn<C = unknown> = <Args extends readonly unknown[]>(
  expression: string,
  handler: (ctx: C, ...args: Args) => void | Promise<void>,
) => void

// A sensor may RETURN a value for the pure core to compare against the Markdown.
// That return shape is independent of the captured args — it can be a by-index
// column tuple, a header-bound row object, a whole reproduced table, or a
// doc-string tuple — so `R` is inferred freely from the handler body and is
// deliberately NOT constrained to `Args`.
export type SensorFn<C = unknown> = <Args extends readonly unknown[], R>(
  expression: string,
  handler: (ctx: C, ...args: Args) => R | Promise<R>,
) => void

export const context: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'context')
export const action: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'action')
export const sensor: SensorFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'sensor')

export function defineState<C>(factory: () => C | Promise<C>): {
  readonly context: RoleFn<C>
  readonly action: RoleFn<C>
  readonly sensor: SensorFn<C>
} {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`defineState() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, factory as () => unknown)
  return {
    context: (expression, handler) => registerStep(expression, handler as StepHandler, 'context'),
    action: (expression, handler) => registerStep(expression, handler as StepHandler, 'action'),
    sensor: (expression, handler) => registerStep(expression, handler as StepHandler, 'sensor'),
  }
}

export function defineParameterType<T>(opts: {
  name: string
  regexp: RegExp | ReadonlyArray<RegExp>
  transformer: (...captures: string[]) => T
}): void {
  customTypes.push(opts as CustomTypeDef)
}

export function contextFactory(): (stepFile: string) => unknown | Promise<unknown> {
  return (stepFile: string) => {
    const f = contextFactoriesByFile.get(stepFile)
    return f ? f() : {}
  }
}

export function buildRegistry(): Registry {
  let r = createRegistry()
  for (const t of customTypes) {
    r = defineParameterTypeCore(r, {
      name: t.name,
      regexp: t.regexp as RegExp | ReadonlyArray<RegExp>,
      transformer: t.transformer,
    })
  }
  for (const e of steps) {
    r = addStep(r, {
      expression: e.expression,
      expressionSourceFile: e.sourceFile,
      expressionSourceLine: e.sourceLine,
      handler: e.handler,
      kind: e.kind,
    })
  }
  return r
}

export function _resetBuilder(): void {
  steps = []
  contextFactoriesByFile.clear()
  customTypes = []
}

function callerLocation(): { sourceFile: string; sourceLine: number } {
  const stack = new Error('locate').stack ?? ''
  const lines = stack.split('\n').slice(1)
  // Find the first frame that's NOT in this module's source/dist.
  let callerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (
      line.includes('/var-runtime/src/index') ||
      line.includes('/var-runtime/dist/index') ||
      line.includes('/api.ts') ||
      line.includes('/api.js')
    ) {
      continue
    }
    callerIdx = i
    break
  }
  const caller = lines[callerIdx] ?? lines[1] ?? ''
  const m = /([^\s(]+):(\d+):\d+\)?$/.exec(caller)
  if (!m) return { sourceFile: '<unknown>', sourceLine: 0 }
  return { sourceFile: m[1] ?? '<unknown>', sourceLine: Number(m[2] ?? 0) }
}
