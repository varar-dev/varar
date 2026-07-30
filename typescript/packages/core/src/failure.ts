import { isCellMismatchError } from './cell-diff.ts'
import { readFailureAnchor } from './failure-anchor.ts'
import type { CellFailure, ExampleResult } from './result.ts'

// Recover the 1-based failing line from the `<oathPath>:line:col` frame
// executePlan injects (see execute.ts augmentStack). Internal — not exported
// from the package index.
function failingLine(stack: string, oathPath: string): number | undefined {
  const escaped = oathPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`${escaped}:(\\d+):\\d+`).exec(stack)
  return m ? Number(m[1]) : undefined
}

// A thrown step error → the ExampleResult.failure payload. Shared by every
// producer (the vitest worker wrapper and the browser runner) so failures are
// byte-identical. Called only on the failure path, so it always returns a
// payload.
export function toFailure(
  error: unknown,
  oathPath: string,
  fallbackLine: number,
): NonNullable<ExampleResult['failure']> {
  const e = error as { message?: unknown; stack?: unknown }
  const stack = typeof e?.stack === 'string' ? e.stack : String(error)
  const message = e?.message != null ? String(e.message) : String(error)

  const cells: ReadonlyArray<CellFailure> | undefined = isCellMismatchError(error)
    ? error.cells
        .filter((c) => !c.ok)
        .map((c) => ({ from: c.span.startOffset, to: c.span.endOffset, actual: c.actual }))
    : undefined

  // executePlan attached the anchor when it caught the error, so this is the
  // failing step's span (or the first mismatched cell's). Absent only when the
  // error never passed through a step — then `line` is all a renderer gets.
  const anchor = readFailureAnchor(error)

  return {
    line: failingLine(stack, oathPath) ?? fallbackLine,
    message,
    stack,
    ...(cells && cells.length > 0 ? { cells } : {}),
    ...(anchor ? { anchor: { from: anchor.startOffset, to: anchor.endOffset } } : {}),
  }
}
