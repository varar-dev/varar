import type { Span } from './span.ts'

export type Severity = 'error' | 'warning'

export type Diagnostic = {
  readonly severity: Severity
  readonly code: DiagnosticCode
  readonly message: string
  readonly span: Span
}

export type DiagnosticCode =
  | 'ambiguous-match'
  | 'error-fence-without-step'
  | 'drift'
  | 'reference-not-found'
  | 'reference-empty'
  | 'reference-cycle'

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

// A reference block (ADR 0016) points at an oath the workspace does not hold.
// Never prose: a link-only block that resolves to nothing has no other reading,
// so it fails the run rather than degrading silently.
export function referenceNotFound(input: {
  readonly text: string
  readonly path: string
  readonly span: Span
}): Diagnostic {
  return {
    severity: 'error',
    code: 'reference-not-found',
    message:
      `Reference to "${input.text}" points at "${input.path}", which is not an oath in this ` +
      'workspace.\nCheck the path, and that the file is matched by the `docs` globs in ' +
      'varar.config.json.',
    span: input.span,
  }
}

// The referenced document exists but the section contributes no steps — a
// mistyped anchor, or a section that is pure prose.
export function referenceEmpty(input: {
  readonly text: string
  readonly path: string
  readonly slug: string
  readonly span: Span
}): Diagnostic {
  const where = input.slug === '' ? input.path : `${input.path}#${input.slug}`
  return {
    severity: 'error',
    code: 'reference-empty',
    message:
      `Reference to "${input.text}" resolves to "${where}", which contributes no steps.\n` +
      'Check the heading the anchor names, and that its section contains a matching paragraph.',
    span: input.span,
  }
}

// References may nest to any depth (depth is a style question, not a rule), so
// a chain that reaches a section already on it must be reported rather than
// recursed into.
export function referenceCycle(input: {
  readonly chain: ReadonlyArray<string>
  readonly span: Span
}): Diagnostic {
  return {
    severity: 'error',
    code: 'reference-cycle',
    message: `Reference cycle: ${input.chain.join(' → ')}.`,
    span: input.span,
  }
}
