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
export function runLspDiagnostics(
  results: OathResults,
  source: string,
  forDocument?: string,
): LspDiagnostic[] {
  return runResultDiagnostics(results, source, forDocument).map((d) => {
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
    (o.version === 1 || o.version === 2) &&
    typeof o.oathPath === 'string' &&
    typeof o.sourceHash === 'string' &&
    Array.isArray(o.examples)
  )
}

export type RunResultsStore = {
  // Parse a .varar/<oath>.json and key it by its oath's file:// URI. Returns
  // every URI whose diagnostics the record changes — the oath's own, plus each
  // document the new record names and each the record it replaces named (ADR
  // 0016: a failure inside a shared section lights that file up, and a clean
  // rerun must clear it) — or [] if the content is unparseable / the wrong
  // version. The oath's own URI is always first.
  ingest(varJsonPath: string, content: string): ReadonlyArray<string>
  // Forget a .varar json (on delete). Returns the URIs it had a say about —
  // the oath's own first, then the documents it named — or [] if unknown.
  remove(varJsonPath: string): ReadonlyArray<string>
  get(oathUri: string): OathResults | undefined
  // Every result that has something to say about this URI: the oath's own
  // result, plus — for a shared oath whose sections other oaths reference (ADR
  // 0016) — each referencing oath's result, tagged with the document path to
  // project. A shared oath is not the subject of any result file of its own, so
  // without this its failures would never reach the editor.
  resultsFor(uri: string): ReadonlyArray<{
    readonly results: OathResults
    readonly forDocument?: string
  }>
  oathUris(): ReadonlyArray<string>
}

export function createRunResultsStore(rootUri: string): RunResultsStore {
  const root = rootUri.replace(/\/$/, '')
  const byUri = new Map<string, OathResults>()
  const uriByPath = new Map<string, string>() // varJsonPath → oathUri, so deletes resolve
  const uriFor = (oathPath: string) => `${root}/${oathPath}`
  const documentUris = (results: OathResults | undefined): ReadonlyArray<string> =>
    (results?.documents ?? []).map((d) => uriFor(d.path))
  return {
    ingest(varJsonPath, content) {
      let parsed: unknown
      try {
        parsed = JSON.parse(content)
      } catch {
        return []
      }
      if (!isOathResults(parsed)) return []
      const oathUri = uriFor(parsed.oathPath)
      const previous = byUri.get(oathUri)
      byUri.set(oathUri, parsed)
      uriByPath.set(varJsonPath, oathUri)
      return [...new Set([oathUri, ...documentUris(previous), ...documentUris(parsed)])]
    },
    remove(varJsonPath) {
      const oathUri = uriByPath.get(varJsonPath)
      if (oathUri === undefined) return []
      const removed = byUri.get(oathUri)
      byUri.delete(oathUri)
      uriByPath.delete(varJsonPath)
      return [...new Set([oathUri, ...documentUris(removed)])]
    },
    get: (oathUri) => byUri.get(oathUri),
    resultsFor(uri) {
      const out: Array<{ results: OathResults; forDocument?: string }> = []
      const own = byUri.get(uri)
      if (own) out.push({ results: own })
      for (const results of byUri.values()) {
        for (const doc of results.documents ?? []) {
          if (uriFor(doc.path) === uri) out.push({ results, forDocument: doc.path })
        }
      }
      return out
    },
    // Referenced documents too: a run that failed inside a shared section must
    // light that file up, and a later clean run must clear it.
    oathUris: () => [
      ...new Set([
        ...byUri.keys(),
        ...[...byUri.values()].flatMap((r) => (r.documents ?? []).map((d) => uriFor(d.path))),
      ]),
    ],
  }
}
