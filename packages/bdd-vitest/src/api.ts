import { ParameterType } from '@cucumber/cucumber-expressions'
import { type Registry, type StepHandler, addStep, createRegistry } from '@oselvar/bdd'

type Entry = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
  readonly handler: StepHandler
}

type CustomTypeDef = {
  readonly name: string
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly transformer: (...captures: string[]) => unknown
}

let steps: Entry[] = []
let context: (() => unknown) | undefined
let customTypes: CustomTypeDef[] = []

// A `step` function bound to a context type `C`. Typed step instances flow `C`
// into the handler's first arg so users don't have to cast.
export type Step<C = unknown> = <Args extends ReadonlyArray<unknown>>(
  expression: string,
  handler: (ctx: C, ...args: Args) => void | Promise<void>,
) => void

function registerStep(expression: string, handler: StepHandler): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler })
}

// Generic `step` import: ctx is unknown. Use `defineContext(...).step` for typed ctx.
export const step: Step<unknown> = (expression, handler) => {
  registerStep(expression, handler as StepHandler)
}

// Register the per-example context factory AND return a `step` typed against `C`
// so handler bodies can use `ctx.foo` without casts. The factory itself is wired
// into the runtime by runBddSource — every example gets its own fresh context.
export function defineContext<C>(factory: () => C | Promise<C>): { readonly step: Step<C> } {
  if (context) {
    throw new Error('defineContext() called more than once')
  }
  context = factory as () => unknown
  const typedStep: Step<C> = (expression, handler) => {
    registerStep(expression, handler as StepHandler)
  }
  return { step: typedStep }
}

export function defineParameterType<T>(opts: {
  name: string
  regexp: RegExp | ReadonlyArray<RegExp>
  transformer: (...captures: string[]) => T
}): void {
  customTypes.push(opts as CustomTypeDef)
}

export function contextFactory(): () => unknown {
  return context ?? (() => ({}))
}

export function buildRegistry(): Registry {
  let r = createRegistry()
  for (const t of customTypes) {
    const regexps = Array.isArray(t.regexp) ? (t.regexp as RegExp[]) : [t.regexp as RegExp]
    r.parameterTypes.defineParameterType(
      new ParameterType(t.name, regexps, String, t.transformer, true, true),
    )
  }
  for (const e of steps) {
    r = addStep(r, {
      expression: e.expression,
      expressionSourceFile: e.sourceFile,
      expressionSourceLine: e.sourceLine,
      handler: e.handler,
    })
  }
  return r
}

export function _resetBuilder(): void {
  steps = []
  context = undefined
  customTypes = []
}

function callerLocation(): { sourceFile: string; sourceLine: number } {
  const stack = new Error('locate').stack ?? ''
  const lines = stack.split('\n').slice(1)
  // Find the first frame that's NOT in api.ts/api.js
  let callerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.includes('/api.ts') || line.includes('/api.js')) continue
    callerIdx = i
    break
  }
  const caller = lines[callerIdx] ?? lines[1] ?? ''
  const m = /([^\s(]+):(\d+):\d+\)?$/.exec(caller)
  if (!m) return { sourceFile: '<unknown>', sourceLine: 0 }
  return { sourceFile: m[1] ?? '<unknown>', sourceLine: Number(m[2] ?? 0) }
}
