import { isCellMismatchError } from './cell-diff.js'
import { isDocStringMismatchError } from './doc-string-diff.js'
import type { Span } from './span.js'

// Where a failure POINTS in the .md: a mismatch anchors at its first failing
// span (the cell, the doc string fence body), anything else at the fallback —
// the step's match start. This rule is the single source of truth for failure
// locations: the executor's stack augmentation renders it per-runtime, and the
// conformance trace pins it as `failure.anchor`, so every language port must
// reproduce it byte-for-byte.
export function failureAnchor(error: unknown, fallback: Span): Span {
  if (isCellMismatchError(error)) return error.cells.find((c) => !c.ok)?.span ?? fallback
  if (isDocStringMismatchError(error)) return error.diff.span
  return fallback
}
