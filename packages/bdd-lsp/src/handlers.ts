import { fileURLToPath } from 'node:url'
import type { MatchRef } from '@oselvar/bdd-language'
import type { Store } from './store.js'

type Position = { readonly line: number; readonly character: number }

type HoverParams = { readonly uri: string; readonly position: Position }
type HoverResult = { readonly contents: string } | null

type DefinitionParams = HoverParams
type DefinitionResult = {
  readonly uri: string
  readonly range: { readonly start: Position; readonly end: Position }
} | null

type Diagnostic = {
  readonly code: string
  readonly severity: 'error' | 'warning'
  readonly message: string
  readonly range: { readonly start: Position; readonly end: Position }
}

type Handlers = {
  hover(params: HoverParams): HoverResult
  definition(params: DefinitionParams): DefinitionResult
  diagnosticsFor(uri: string): ReadonlyArray<Diagnostic>
}

export function buildHandlers(store: Store): Handlers {
  return {
    hover({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return null
      const contents = `Matched by \`step('${m.stepDef.expression}')\` at ${relative(m.stepDef.file, store.workspaceRoot())}:${m.stepDef.expressionRange.start.line}`
      return { contents }
    },
    definition({ uri, position }) {
      const m = findMatchAt(store, uri, position)
      if (!m) return null
      return {
        uri: `file://${m.stepDef.file}`,
        range: {
          start: {
            line: m.stepDef.expressionRange.start.line - 1,
            character: m.stepDef.expressionRange.start.character - 1,
          },
          end: {
            line: m.stepDef.expressionRange.end.line - 1,
            character: m.stepDef.expressionRange.end.character - 1,
          },
        },
      }
    },
    diagnosticsFor(uri) {
      const path = uriToPath(uri)
      return store
        .index()
        .diagnostics.filter((d) => d.bddPath === path)
        .map((d) => ({
          code: d.code,
          severity: d.severity,
          message: d.message,
          range: d.range,
        }))
    },
  }
}

function findMatchAt(store: Store, uri: string, position: Position): MatchRef | undefined {
  const path = uriToPath(uri)
  return store.index().matches.find((m) => {
    if (m.bddPath !== path) return false
    return contains(m.range, position)
  })
}

function contains(range: { start: Position; end: Position }, position: Position): boolean {
  if (position.line < range.start.line || position.line > range.end.line) return false
  if (position.line === range.start.line && position.character < range.start.character) return false
  if (position.line === range.end.line && position.character > range.end.character) return false
  return true
}

function uriToPath(uri: string): string {
  return uri.startsWith('file://') ? fileURLToPath(uri) : uri
}

function relative(file: string, root: string): string {
  return file.startsWith(root) ? file.slice(root.length).replace(/^\//, '') : file
}
