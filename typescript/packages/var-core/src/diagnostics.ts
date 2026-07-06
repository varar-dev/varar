import type { Span } from './span.ts'

export type Severity = 'error' | 'warning'

export type Diagnostic = {
  readonly severity: Severity
  readonly code: DiagnosticCode
  readonly message: string
  readonly span: Span
}

export type DiagnosticCode = 'ambiguous-match' | 'error-fence-without-step' | 'drift'

export type Candidate = {
  readonly expression: string
  readonly sourceFile: string
  readonly sourceLine: number
}

export type AmbiguousInput = {
  readonly text: string
  readonly span: Span
  readonly candidates: ReadonlyArray<Candidate>
}

export function ambiguousMatch(input: AmbiguousInput): Diagnostic {
  const lines = input.candidates
    .map((c) => `  '${c.expression}'    at ${c.sourceFile}:${c.sourceLine}`)
    .join('\n')
  return {
    severity: 'error',
    code: 'ambiguous-match',
    message: `Ambiguous step: "${input.text}"\nMatched by:\n${lines}`,
    span: input.span,
  }
}

// A paragraph the baseline recorded as an example no longer matches any step:
// drift. Rides the shared Diagnostic rail so every surface reports it the same
// way — a non-zero CLI exit, a failing vitest/pytest test, an LSP squiggle.
// `span` points at the drifted paragraph. Cleared by accepting (update mode).
export function driftDetected(input: { readonly name: string; readonly span: Span }): Diagnostic {
  return {
    severity: 'error',
    code: 'drift',
    message:
      `This paragraph was an example and no longer matches any step (drift): "${input.name}".\n` +
      'Fix the step so it matches again, or accept it as prose (run in update mode).',
    span: input.span,
  }
}

// An `error` fence declares its example expected-to-fail, but the example has
// no runnable step to produce that failure (nothing matched, or the match was
// ambiguous). `span` points at the orphaned fence.
export function errorFenceWithoutStep(input: { readonly span: Span }): Diagnostic {
  return {
    severity: 'error',
    code: 'error-fence-without-step',
    message:
      'This `error` fence marks the example as expected-to-fail, but the example has no step to run.',
    span: input.span,
  }
}
