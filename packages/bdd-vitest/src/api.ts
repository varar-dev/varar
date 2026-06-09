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

export function step(expression: string, handler: StepHandler): void {
  const { sourceFile, sourceLine } = callerLocation()
  steps.push({ expression, sourceFile, sourceLine, handler })
}

export function defineContext<C>(factory: () => C | Promise<C>): void {
  if (context) {
    throw new Error('defineContext() called more than once')
  }
  context = factory as () => unknown
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
