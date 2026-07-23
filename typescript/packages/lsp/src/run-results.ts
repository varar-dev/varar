import { type OathResults, runResultDiagnostics, spanFromOffsets } from '@varar/core'

export type LspPosition = { readonly line: number; readonly character: number }
export type LspDiagnostic = {
  readonly severity: number
  readonly source: string
  readonly message: string
  readonly range: { readonly start: LspPosition; readonly end: LspPosition }
  readonly code?: string // preserved from parse diagnostics; run diagnostics omit it
}

// Pure: OathResults + current source → LSP diagnostics (0-based positions).
// Reuses the core projection; converts each offset range via spanFromOffsets
// (1-based span → 0-based LSP), matching the existing parse-diagnostic mapping.
export function runLspDiagnostics(results: OathResults, source: string): LspDiagnostic[] {
  return runResultDiagnostics(results, source).map((d) => {
    const span = spanFromOffsets(source, d.from, d.to)
    return {
      severity: 1, // Error
      source: 'var',
      message: d.message,
      range: {
        start: { line: span.startLine - 1, character: span.startCol - 1 },
        end: { line: span.endLine - 1, character: span.endCol - 1 },
      },
    }
  })
}

function isOathResults(v: unknown): v is OathResults {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    o.version === 1 &&
    typeof o.oathPath === 'string' &&
    typeof o.sourceHash === 'string' &&
    Array.isArray(o.examples)
  )
}

export type RunResultsStore = {
  // Parse a .var/<oath>.json and key it by its oath's file:// URI. Returns that
  // URI, or null if the content is unparseable / the wrong version.
  ingest(varJsonPath: string, content: string): string | null
  // Forget a .var json (on delete). Returns the oath URI it had mapped, or null.
  remove(varJsonPath: string): string | null
  get(oathUri: string): OathResults | undefined
  oathUris(): ReadonlyArray<string>
}

export function createRunResultsStore(rootUri: string): RunResultsStore {
  const root = rootUri.replace(/\/$/, '')
  const byUri = new Map<string, OathResults>()
  const uriByPath = new Map<string, string>() // varJsonPath → oathUri, so deletes resolve
  return {
    ingest(varJsonPath, content) {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        return null
      }
      if (!isOathResults(parsed)) return null
      const oathUri = `${root}/${parsed.oathPath}`
      byUri.set(oathUri, parsed)
      uriByPath.set(varJsonPath, oathUri)
      return oathUri
    },
    remove(varJsonPath) {
      const oathUri = uriByPath.get(varJsonPath)
      if (oathUri === undefined) return null
      byUri.delete(oathUri)
      uriByPath.delete(varJsonPath)
      return oathUri
    },
    get: (oathUri) => byUri.get(oathUri),
    oathUris: () => [...byUri.keys()],
  }
}
