import { hashSource } from './hash.ts'
import type { OathResults } from './result.ts'

// One renderable failure: a source-offset range plus a human message. Offsets
// are absolute source positions (== CodeMirror positions); `to` is exclusive.
// Renderer-agnostic — the LSP converts to line/character, the web editor uses
// the offsets directly.
export type RunDiagnostic = {
  readonly from: number
  readonly to: number
  readonly message: string
}

// [from, to) of 1-based `line` in `source`, where `to` excludes the trailing newline.
function lineRange(source: string, line: number): { from: number; to: number } {
  let from = 0
  let current = 1
  for (let i = 0; i < source.length && current < line; i++) {
    if (source.charCodeAt(i) === 0x0a) {
      current++
      from = i + 1
    }
  }
  const nl = source.indexOf('\n', from)
  return { from, to: nl === -1 ? source.length : nl }
}

// Project an OathResults onto offset-based diagnostics against the CURRENT
// source. If the source changed since the run (hash mismatch) the offsets no
// longer apply, so emit nothing.
export function runResultDiagnostics(
  results: OathResults,
  source: string,
  // Which document `source` is. Omitted (the usual case) means the oath itself:
  // only failures whose offsets are in the oath are projected. Pass a path from
  // `results.documents` to project the failures of steps a reference block
  // spliced in from THAT oath instead — their offsets are in its source, not
  // this one's (ADR 0016).
  forDocument?: string,
): ReadonlyArray<RunDiagnostic> {
  const expectedHash =
    forDocument === undefined
      ? results.sourceHash
      : results.documents?.find((d) => d.path === forDocument)?.sourceHash
  if (expectedHash === undefined || hashSource(source) !== expectedHash) return []
  const out: RunDiagnostic[] = []
  for (const ex of results.examples) {
    if (ex.status !== 'failed' || !ex.failure) continue
    const f = ex.failure
    // A failure belongs to exactly one document: the oath, or the one a
    // reference block spliced its failing step in from.
    if (f.docPath !== forDocument) continue
    if (f.cells && f.cells.length > 0) {
      for (const c of f.cells) {
        out.push({
          from: c.from,
          to: c.to,
          message: `expected ${source.slice(c.from, c.to)} but was ${c.actual}`,
        })
      }
    } else if (f.anchor && f.anchor.to > f.anchor.from && f.anchor.to <= source.length) {
      // A thrown step: underline the step itself, not the line it shares with
      // its neighbours. The bounds check keeps a stale anchor (a result written
      // against a source the hash check somehow let through) from pointing past
      // the end of the document.
      out.push({ from: f.anchor.from, to: f.anchor.to, message: f.message })
    } else {
      // No anchor recorded (an older result, or a port that doesn't emit one):
      // the failing line is the most precise range available.
      const { from, to } = lineRange(source, f.line)
      out.push({ from, to, message: f.message })
    }
  }
  return out
}
