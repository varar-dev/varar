import {
  DEFAULT_SNIPPET_TEMPLATE,
  JAVA_SNIPPET_TEMPLATE,
  KOTLIN_SNIPPET_TEMPLATE,
  PYTHON_SNIPPET_TEMPLATE,
} from './snippet-template.ts'

// Owns every language-shaped construct of generated step-definition source:
// the type-name mapping, the 'name: Type' vs 'Type name' param shape, the
// state/ctx first argument (absent in Kotlin — state is the lambda receiver),
// and the language's default snippet template. generateSnippet and the LSP's
// rename handler-signature sync both delegate here, which is what makes
// non-TypeScript sync safe (sub-project D lifted the C-era TS-only guard).
export interface SnippetEmitter {
  readonly language: string
  readonly defaultTemplate: string
  readonly stateInParams: boolean
  typeNameFor(parameterType: { readonly type: unknown }): string
  renderParam(name: string, typeName: string): string
  renderStateParam(): string
}

const colonParam = (name: string, typeName: string): string =>
  typeName ? `${name}: ${typeName}` : name

export function createTypeScriptSnippetEmitter(): SnippetEmitter {
  return {
    language: 'typescript',
    defaultTemplate: DEFAULT_SNIPPET_TEMPLATE,
    stateInParams: true,
    typeNameFor: (pt) => (pt.type === Number ? 'number' : 'string'),
    renderParam: colonParam,
    renderStateParam: () => 'state',
  }
}

export function createPythonSnippetEmitter(): SnippetEmitter {
  return {
    language: 'python',
    defaultTemplate: PYTHON_SNIPPET_TEMPLATE,
    stateInParams: true,
    typeNameFor: (pt) => (pt.type === Number ? 'int' : 'str'),
    renderParam: colonParam,
    renderStateParam: () => 'state',
  }
}

export function createJavaSnippetEmitter(): SnippetEmitter {
  return {
    language: 'java',
    defaultTemplate: JAVA_SNIPPET_TEMPLATE,
    stateInParams: true,
    typeNameFor: (pt) => (pt.type === Number ? 'Integer' : 'String'),
    renderParam: (name, typeName) => (typeName ? `${typeName} ${name}` : name),
    // 'Ctx' is the repo-wide fixture convention for the state record; the
    // author renames it to their real state type after pasting.
    renderStateParam: () => 'Ctx ctx',
  }
}

export function createKotlinSnippetEmitter(): SnippetEmitter {
  return {
    language: 'kotlin',
    defaultTemplate: KOTLIN_SNIPPET_TEMPLATE,
    stateInParams: false,
    typeNameFor: (pt) => (pt.type === Number ? 'Int' : 'String'),
    renderParam: colonParam,
    renderStateParam: () => '',
  }
}

const EMITTERS: Readonly<Record<string, () => SnippetEmitter>> = {
  typescript: createTypeScriptSnippetEmitter,
  'typescript-tsx': createTypeScriptSnippetEmitter,
  python: createPythonSnippetEmitter,
  java: createJavaSnippetEmitter,
  kotlin: createKotlinSnippetEmitter,
}

// tsx normalizes to typescript; unknown/undefined default to typescript so
// every existing TS-only caller keeps its behavior.
export function emitterForLanguage(languageId: string | undefined): SnippetEmitter {
  const factory =
    languageId !== undefined && Object.hasOwn(EMITTERS, languageId)
      ? EMITTERS[languageId]
      : undefined
  return (factory ?? createTypeScriptSnippetEmitter)()
}
