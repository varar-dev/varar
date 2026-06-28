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
  readonly kind?: StepKind
}

type CustomTypeDef = {
  readonly name: string
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly transformer: (...captures: string[]) => unknown
}

let steps: Entry[] = []
// One context factory per stepfile. Each .steps.ts that calls
// defineContext() owns its own slice of state; steps from different
// stepfiles never see each other's context.
const contextFactoriesByFile = new Map<string, () => unknown | Promise<unknown>>()
let customTypes: CustomTypeDef[] = []

// A `step` function bound to a context type `C`. Typed step instances flow `C`
// into the handler's first arg so users don't have to cast.
export type Step<C = unknown> = <Args extends ReadonlyArray<unknown>>(
  expression: string,
  handler: (ctx: C, ...args: Args) => void | Promise<void>,
) => void

function registerStep(expression: string, handler: StepHandler, kind?: StepKind): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler, ...(kind !== undefined && { kind }) })
}

// Generic `step` import: ctx is unknown. Use `defineContext(...).step` for typed ctx.
export const step: Step<unknown> = (expression, handler) => {
  registerStep(expression, handler as StepHandler)
}

export type RoleFn<C = unknown> = (
  expression: string,
  handler: (ctx: C, ...args: readonly unknown[]) => void | Promise<void>,
) => void

export type SensorFn<C = unknown> = <Args extends readonly unknown[]>(
  expression: string,
  handler: (
    ctx: C,
    ...args: Args
  ) => NoInfer<Args> | Promise<NoInfer<Args>> | void | Promise<void>,
) => void

export const context: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'context')
export const action: RoleFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'action')
export const sensor: SensorFn = (expression, handler) =>
  registerStep(expression, handler as StepHandler, 'sensor')

// Register the per-stepfile context factory AND return a `step` typed against
// `C` so handler bodies can use `ctx.foo` without casts. The factory itself
// is wired into the runtime by adapters — every example gets one fresh
// context per stepfile that contributes a step to it.
export function defineContext<C>(factory: () => C | Promise<C>): { readonly step: Step<C> } {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`defineContext() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, factory as () => unknown)
  const typedStep: Step<C> = (expression, handler) => {
    registerStep(expression, handler as StepHandler)
  }
  return { step: typedStep }
}

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
    context: (expression, handler) =>
      registerStep(expression, handler as StepHandler, 'context'),
    action: (expression, handler) =>
      registerStep(expression, handler as StepHandler, 'action'),
    sensor: (expression, handler) =>
      registerStep(expression, handler as StepHandler, 'sensor'),
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
      ...(e.kind !== undefined && { kind: e.kind }),
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
