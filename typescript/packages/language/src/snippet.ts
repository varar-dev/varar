import { CucumberExpressionGenerator } from '@cucumber/cucumber-expressions'
import type { Registry, StepKind } from '@varar/core'
import { createTypeScriptSnippetEmitter, type SnippetEmitter } from './snippet-emitter.ts'
import { renderTemplate } from './template.ts'

export type Snippet = {
  readonly expression: string
  readonly handlerSignature: string
  readonly fullCode: string
}

// Friendlier variable names for the built-in parameter types. Custom types
// keep their declared name as the variable name, e.g. `{airport} → airport`.
const FRIENDLY_NAMES: Record<string, string> = {
  int: 'count',
  float: 'price',
  string: 'user',
}

export function generateSnippet(
  rawText: string,
  registry: Registry,
  options: {
    readonly template?: string
    readonly role?: StepKind
    readonly snippetEmitter?: SnippetEmitter
  } = {},
): Snippet {
  const emitter = options.snippetEmitter ?? createTypeScriptSnippetEmitter()
  // The expression is the selection verbatim — no Given/When/Then stripping
  // and no other narration heuristics. The user owns what they selected.
  const originalText = rawText.trim()
  const text = originalText

  // Defer to the cucumber-expressions generator: it knows how to rank
  // candidate parameter types (including custom ones registered on the
  // registry), and it returns the most-preferred expression at index 0.
  const generator = new CucumberExpressionGenerator(() => registry.parameterTypes.parameterTypes)
  const generated = generator.generateExpressions(text)[0]
  const expression = generated?.source ?? text

  const usedNames = new Map<string, number>()
  const handlerArgs = (generated?.parameterTypes ?? []).map((pt) => {
    const baseName = FRIENDLY_NAMES[pt.name ?? ''] ?? pt.name ?? 'arg'
    const count = (usedNames.get(baseName) ?? 0) + 1
    usedNames.set(baseName, count)
    const argName = count === 1 ? baseName : `${baseName}${count}`
    return emitter.renderParam(argName, emitter.typeNameFor(pt))
  })

  const stateParam = emitter.renderStateParam()
  const argsList = stateParam ? [stateParam, ...handlerArgs] : handlerArgs
  const args = argsList.join(', ')
  // Kotlin-style trailing-lambda header: params + arrow, or empty when the
  // step captures nothing (a bare '{' block). Other templates ignore it.
  const lambdaParams = handlerArgs.length > 0 ? `${handlerArgs.join(', ')} ->` : ''
  const handlerSignature = `(${args}) => {`
  const role: StepKind = options.role ?? 'stimulus'
  const alt: StepKind = role === 'stimulus' ? 'sensor' : 'stimulus'
  const fullCode = renderTemplate(options.template ?? emitter.defaultTemplate, {
    role,
    alt,
    expression,
    args,
    lambdaParams,
    originalText,
  })

  return { expression, handlerSignature, fullCode }
}
