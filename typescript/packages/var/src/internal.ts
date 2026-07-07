import {
  addStep,
  createRegistry,
  defineParameterType as defineParameterTypeCore,
  type Registry,
  type StepHandler,
  type StepKind,
} from '@oselvar/var-core'

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
  readonly parse?: (...captures: string[]) => unknown
  readonly format?: (value: unknown) => string
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

// ─── Argument-type inference from the cucumber expression ───
// var's own port of cucumber-expressions' parameter grammar: map an expression
// literal's `{name}` placeholders to the types their parse functions produce.
// (Deliberately kept here rather than upstreamed — the parameter-extraction
// grammar is small and stable, and var's needs are narrow.) The one
// var-specific choice is the `AnyArg` fallback for a name with no known type:
// `any`, not `unknown`, so authors can still annotate a slot the inference can't
// reach — a custom type not declared via `defineState`, or the trailing
// data-table / doc-string arg the runtime appends.

// `any`, not `unknown`: an annotated fallback param (`code: string`) must stay
// assignable to its slot, which `unknown` would reject under parameter
// contravariance — the exact TS2345 that typed handlers used to hit.
// biome-ignore lint/suspicious/noExplicitAny: intentional flexible fallback slot
type AnyArg = any

// Built-in cucumber parameter-type name → the type its parse function produces.
interface BuiltInParameterTypes {
  int: number
  float: number
  double: number
  byte: number
  short: number
  long: number
  biginteger: bigint
  bigdecimal: string
  word: string
  string: string
  '': string
}

// Parameter-type names in the expression, in source order. Escape-aware:
// a brace escaped with a backslash (`\{`) is literal text, not a parameter.
type ParameterNames<
  S extends string,
  InParameter extends boolean = false,
  Current extends string = '',
  Names extends string[] = [],
> = S extends `\\${infer _Escaped}${infer Rest}`
  ? ParameterNames<Rest, InParameter, Current, Names>
  : S extends `{${infer Rest}`
    ? ParameterNames<Rest, true, '', Names>
    : S extends `}${infer Rest}`
      ? InParameter extends true
        ? ParameterNames<Rest, false, '', [...Names, Current]>
        : ParameterNames<Rest, false, '', Names>
      : S extends `${infer Char}${infer Rest}`
        ? InParameter extends true
          ? ParameterNames<Rest, true, `${Current}${Char}`, Names>
          : ParameterNames<Rest, false, Current, Names>
        : Names

// Resolve one parameter name to a type: a custom registry entry wins, then a
// built-in, then the `any` fallback.
type ResolveArg<Name extends string, Custom> = Name extends keyof Custom
  ? Custom[Name]
  : Name extends keyof BuiltInParameterTypes
    ? BuiltInParameterTypes[Name]
    : AnyArg

type MapArgs<Names extends readonly string[], Custom> = {
  [Index in keyof Names]: ResolveArg<Names[Index] & string, Custom>
}

// Parsed placeholders mapped to types, then any trailing arg (table/doc string)
// the runtime appends — that tail is `AnyArg` because the expression can't
// describe it.
type HandlerArgs<E extends string, Custom> = [...MapArgs<ParameterNames<E>, Custom>, ...AnyArg[]]

// Deeply-readonly view of the state handed to every step: each nested property
// is `readonly`, so a handler can read state but never mutate it (mutation is a
// type error and — because the runtime deep-freezes — a runtime throw too).
// Functions pass through; arrays and objects recurse.
type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

// A stimulus handler receives the immutable `state` (deeply readonly) plus
// the args inferred from the expression `E` (built-in parameter types, plus any
// `Custom` types declared via `defineState`), so `(state, name) => …` types
// `name` without an annotation and without TS2345. It EVOLVES state by RETURNING
// a partial state object (shallow-merged by the runtime) — or nothing, for no
// change. It never mutates `state`.
type StimulusFn<C = unknown, Custom = Record<never, never>> = <E extends string>(
  expression: E,
  handler: (
    state: DeepReadonly<C>,
    ...args: HandlerArgs<E, Custom>
    // biome-ignore lint/suspicious/noConfusingVoidType: mirrors the outer void; async handlers that return nothing satisfy Promise<void>, which is assignable here
  ) => Partial<C> | void | Promise<Partial<C> | void>,
) => void

// A sensor is a pure OBSERVER: it reads the immutable `state` (deeply readonly)
// and may RETURN a value for the pure core to compare against the Markdown. That
// return shape is independent of the captured args — a by-index column tuple, a
// header-bound row object, a whole reproduced table, or a doc-string tuple — so
// `R` is inferred freely from the handler body. A sensor never changes state.
type SensorFn<C = unknown, Custom = Record<never, never>> = <E extends string, R>(
  expression: E,
  handler: (state: DeepReadonly<C>, ...args: HandlerArgs<E, Custom>) => R | Promise<R>,
) => void

// A custom parameter type, declared inline in `defineState` so its parse
// function's return type can be captured for inference (and registered for
// matching). `parse` is optional — omitted, the parameter is the matched
// text. `format` is the inverse: value → the document's notation, used only
// to display the actual side of a parameter mismatch.
//
// `format` is contravariant in its value, so a plain `ParamTypeDef<unknown>`
// bound would reject `(m: Money) => string`. The constraint is therefore
// SELF-REFERENTIAL (`P extends { [K in keyof P]: ParamTypeDefOf<P[K]> }`):
// each def's `format` parameter is tied to that same def's `parse` return,
// which both checks the pairing and contextually types an unannotated
// `format: (m) => …`.
type ParamTypeDefOf<D> = {
  readonly regexp: RegExp | ReadonlyArray<RegExp>
  readonly parse?: (...captures: string[]) => unknown
  readonly format?: (
    value: D extends { parse: (...captures: string[]) => infer T } ? T : string,
  ) => string
}

// Record of parameter-type definitions → `{ name: producedType }`, the custom
// registry that drives `{name}` → type inference for this stepfile's steps.
// No parse function means the parameter stays the matched text: string.
type CustomRegistry<P> = {
  [K in keyof P]: P[K] extends { parse: (...captures: string[]) => infer T } ? T : string
}

// The factory is OPTIONAL: a step file whose steps are pure (nothing to
// arrange, nothing to evolve) calls `defineState()` bare and its handlers
// receive an empty state. `C` then defaults to `Record<string, never>`, so a
// stimulus can only return `{}`/nothing and a sensor can't read phantom fields.
export function defineState<
  C = Record<string, never>,
  P extends { [K in keyof P]: ParamTypeDefOf<P[K]> } = Record<never, never>,
>(
  factory?: () => C | Promise<C>,
  paramTypes?: P,
): {
  readonly stimulus: StimulusFn<C, CustomRegistry<P>>
  readonly sensor: SensorFn<C, CustomRegistry<P>>
} {
  const { sourceFile } = callerLocation()
  if (contextFactoriesByFile.has(sourceFile)) {
    throw new Error(`defineState() called more than once in ${sourceFile}`)
  }
  contextFactoriesByFile.set(sourceFile, (factory ?? (() => ({}))) as () => unknown)
  if (paramTypes) {
    // The self-referential bound on P (see ParamTypeDefOf) has no string
    // index, so Object.entries types values as unknown — reassert the
    // runtime shape, which every P member satisfies by construction.
    const defs = paramTypes as Record<string, Omit<CustomTypeDef, 'name'>>
    for (const [name, def] of Object.entries(defs)) {
      customTypes.push({
        name,
        regexp: def.regexp,
        ...(def.parse ? { parse: def.parse } : {}),
        ...(def.format ? { format: def.format } : {}),
      })
    }
  }
  return {
    stimulus: (expression, handler) => registerStep(expression, handler as StepHandler, 'stimulus'),
    sensor: (expression, handler) => registerStep(expression, handler as StepHandler, 'sensor'),
  }
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
      ...(t.parse ? { parse: t.parse } : {}),
      ...(t.format ? { format: t.format } : {}),
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

// Conformance-harness accessor: the custom parameter types accumulated by
// defineState since the last _resetBuilder, projected to the {name, regexp}
// wire shape toRegistryArtifact serializes. regexp is the bare pattern
// source (RegExp.source — no flags/delimiters), the cross-port convention
// every language's registry golden uses. Internal-only: exported via
// @oselvar/var/registry beside _resetBuilder, never from the package root.
export function _customParameterTypes(): ReadonlyArray<{
  readonly name: string
  readonly regexp: string
}> {
  return customTypes.map((t) => {
    if (Array.isArray(t.regexp)) {
      throw new Error(
        `parameter type "${t.name}": regexp arrays are not supported by the conformance projection yet`,
      )
    }
    return { name: t.name, regexp: (t.regexp as RegExp).source }
  })
}

export function _resetBuilder(): void {
  steps = []
  contextFactoriesByFile.clear()
  customTypes = []
}

// Parse one stack frame into its file path and line, stripping the engine's
// framing: V8's `at fn (path:line:col)` / `at path:line:col`, and Firefox/JSC's
// `fn@url:line:col` / `@url:line:col`. The file class excludes `@`, `(` and
// whitespace so the function-name prefix never leaks into the path — the paths
// must compare equal across frames of the same module (see below).
function parseFrame(line: string): { file: string; line: number } | undefined {
  const m = /(?:@|\(|\s)?([^\s@(]+):(\d+):\d+\)?\s*$/.exec(line)
  return m ? { file: m[1] ?? '', line: Number(m[2] ?? 0) } : undefined
}

function callerLocation(): { sourceFile: string; sourceLine: number } {
  return _callerLocationFromStack(new Error('locate').stack ?? '')
}

// Split out from callerLocation so it can be unit-tested against real V8,
// SpiderMonkey and JSC stack strings without a browser.
//
// The deepest parseable frame is callerLocation's own — its file identifies
// *this* module: a real source path when loaded from disk (`.../var/src/…` or
// `.../var/dist/…`), or a bundled chunk when a runner bundles the package (the
// website's Web Worker). Every internal frame — callerLocation, defineState,
// registerStep, the stimulus/sensor closures — shares that file, so the first
// frame with a *different* file is the step author's. Keying on file identity
// instead of a hardcoded `/var/src/internal` substring is what makes this work
// once bundled: the old substring never appears in a minified chunk, and on
// engines whose stack omits the `Error:` header (Firefox/JSC) defineState and
// registerStep would otherwise resolve to different internal frames, keying the
// context factory under mismatched paths — the exact cause of a lost state
// factory (`state.<field> is undefined`) in the bundled worker.
export function _callerLocationFromStack(stack: string): {
  sourceFile: string
  sourceLine: number
} {
  let selfFile: string | undefined
  for (const line of stack.split('\n')) {
    const frame = parseFrame(line)
    if (!frame) continue
    if (selfFile === undefined) {
      selfFile = frame.file
      continue
    }
    if (frame.file !== selfFile) return { sourceFile: frame.file, sourceLine: frame.line }
  }
  return { sourceFile: '<unknown>', sourceLine: 0 }
}
