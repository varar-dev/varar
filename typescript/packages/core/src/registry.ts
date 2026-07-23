import {
  CucumberExpression,
  ParameterType,
  ParameterTypeRegistry,
} from '@cucumber/cucumber-expressions'
import type { StepKind } from './step-role.ts'

export type StepHandler = (
  state: unknown,
  ...args: ReadonlyArray<unknown>
) => unknown | Promise<unknown>

export type StepRegistration = {
  readonly expression: string
  readonly expressionSourceFile: string
  readonly expressionSourceLine: number
  readonly handler: StepHandler
  readonly compiled: CucumberExpression
  readonly kind?: StepKind
}

// A parameter type's display formatter: value → the document's notation.
// Presentation only — never part of matching or comparison verdicts.
export type ParameterFormat = (value: unknown) => string

export type Registry = {
  readonly steps: ReadonlyArray<StepRegistration>
  readonly parameterTypes: ParameterTypeRegistry
  // Per parameter-type display formatters, keyed by type name. Kept beside
  // the cucumber-expressions registry because ParameterType can't carry one.
  readonly formats: ReadonlyMap<string, ParameterFormat>
}

// Markdown emphasis, as a built-in {emph} parameter type. Matches the uniform
// emphasis notations (bold-italic, bold, italic; `*` and `_` delimiters),
// ordered longest-delimiter-first so `**x**` isn't half-eaten by the `*`
// branch. Each branch captures the inner text in its own group, so only the
// outermost delimiter pair is stripped (`**_x_**` → `_x_`) and editors
// highlight the value, not the markers.
export const EMPH_REGEXP =
  /\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/

// Seed Varar's own built-in parameter types (beyond cucumber-expressions'
// int/float/string/word). Shared by every port so specs match identically.
function seedBuiltins(registry: Registry): Registry {
  return defineParameterType(registry, {
    name: 'emph',
    regexp: EMPH_REGEXP,
    // Exactly one alternation branch matches, so exactly one group is defined.
    parse: (...groups: ReadonlyArray<string | undefined>) =>
      groups.find((g) => g !== undefined) ?? '',
    // Emphasis is distinctive notation; don't auto-suggest it in snippets.
    useForSnippets: false,
    // Mismatch display renders the value back in single-asterisk emphasis.
    format: (value) => `*${String(value)}*`,
  })
}

export function createRegistry(): Registry {
  return seedBuiltins({
    steps: [],
    parameterTypes: new ParameterTypeRegistry(),
    formats: new Map(),
  })
}

export type StepInput = Omit<StepRegistration, 'compiled'>

export function addStep(registry: Registry, input: StepInput): Registry {
  const duplicate = registry.steps.find((s) => s.expression === input.expression)
  if (duplicate) {
    throw new Error(
      `duplicate step definition for "${input.expression}" at ${duplicate.expressionSourceFile}:${duplicate.expressionSourceLine} and ${input.expressionSourceFile}:${input.expressionSourceLine}`,
    )
  }
  const compiled = new CucumberExpression(input.expression, registry.parameterTypes)
  const next: StepRegistration = { ...input, compiled }
  return { ...registry, steps: [...registry.steps, next] }
}

export type ParameterTypeInput<T = unknown> = {
  readonly name: string
  readonly regexp: RegExp | string | ReadonlyArray<RegExp | string>
  // Identity by default — turns the matched substring into the handler's
  // argument. Override to coerce (e.g. number, Date, domain object).
  readonly parse?: (...groups: string[]) => T
  // Whether this type can be auto-suggested when generating a snippet from
  // arbitrary text. Defaults to true.
  readonly useForSnippets?: boolean
  // Take priority over built-in {string}/{int}/etc. when generating a regex
  // for an existing string match. Rarely needed.
  readonly preferForRegexpMatch?: boolean
  // Inverse of `parse`: render a value in the document's notation.
  // Used only to display the actual side of a parameter mismatch.
  readonly format?: (value: T) => string
}

export function defineParameterType<T = unknown>(
  registry: Registry,
  input: ParameterTypeInput<T>,
): Registry {
  // ParameterTypeRegistry.defineParameterType mutates in place; the registry
  // object reference is intentionally shared across all step compilations.
  const pt = new ParameterType<T>(
    input.name,
    input.regexp as RegExp | string | RegExp[] | string[],
    null,
    input.parse ?? ((raw: string) => raw as unknown as T),
    input.useForSnippets ?? true,
    input.preferForRegexpMatch ?? false,
    false,
  )
  registry.parameterTypes.defineParameterType(pt)
  if (!input.format) return registry
  const formats = new Map(registry.formats)
  formats.set(input.name, input.format as ParameterFormat)
  return { ...registry, formats }
}
