import { isCellMismatchError } from './cell-diff.ts'
import type { Span } from './span.ts'

// Where a failure POINTS in the .md: a mismatch anchors at its first failing
// span (a table cell, an inline capture, or a doc string's fence body), anything
// else at the fallback —
// the step's match start. This rule is the single source of truth for failure
// locations: the executor's stack augmentation renders it per-runtime, and the
// conformance trace pins it as `failure.anchor`, so every language port must
// reproduce it byte-for-byte.
export function failureAnchor(error: unknown, fallback: Span): Span {
  if (isCellMismatchError(error)) return error.cells.find((c) => !c.ok)?.span ?? fallback
  return fallback
}

// The anchor travels with the thrown error, from the executor (which knows the
// step) to whoever builds the ExampleResult.failure payload (which only sees
// the error). A global symbol, not a module-level WeakMap, so it survives two
// copies of @varar/core in one process; non-enumerable, so it stays out of
// JSON.stringify and console output of the error itself.
const ANCHOR = Symbol.for('varar.failureAnchor')

export function attachFailureAnchor(error: unknown, anchor: Span): void {
  if (typeof error !== 'object' || error === null) return
  Object.defineProperty(error, ANCHOR, { value: anchor, enumerable: false, configurable: true })
}

export function readFailureAnchor(error: unknown): Span | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  return (error as Record<symbol, Span | undefined>)[ANCHOR]
}
