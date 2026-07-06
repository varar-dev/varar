import { type Diagnostic, linter } from '@codemirror/lint'
import { type Extension, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { type Drift, runResultDiagnostics, type SpecResults } from '@oselvar/var-core'

// Effect carrying the latest run results (null clears them).
export const setRunResults = StateEffect.define<SpecResults | null>()

// Effect carrying the latest drifts for this spec (empty clears them).
export const setDrift = StateEffect.define<ReadonlyArray<Drift>>()

// Latest drifts; cleared on edit (offsets go stale until the next run).
const driftField = StateField.define<ReadonlyArray<Drift>>({
  create: () => [],
  update(value, tr) {
    if (tr.docChanged) return []
    for (const e of tr.effects) if (e.is(setDrift)) return e.value
    return value
  },
})

// Amber line-background wash on each drifted paragraph — distinct from the
// pass/fail wash because a drifted paragraph isn't an example that ran, it's
// one that stopped being an example.
const driftDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let drifts: ReadonlyArray<Drift> | undefined
    for (const e of tr.effects) if (e.is(setDrift)) drifts = e.value
    if (drifts === undefined) return deco.map(tr.changes)
    const builder = new RangeSetBuilder<Decoration>()
    for (const ln of [...new Set(drifts.map((d) => d.line))].sort((a, b) => a - b)) {
      if (ln >= 1 && ln <= tr.state.doc.lines) {
        const at = tr.state.doc.line(ln).from
        builder.add(at, at, Decoration.line({ class: 'cm-run-drift' }))
      }
    }
    return builder.finish()
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Pure projection used by the linter and unit-tested directly. Drift shows as a
// warning (amber) squiggle over the paragraph, distinct from a red failure.
export function driftDiagnostics(drifts: ReadonlyArray<Drift>): Diagnostic[] {
  return drifts.map((d) => ({
    from: d.span.startOffset,
    to: d.span.endOffset,
    severity: 'warning',
    message:
      `This paragraph was an example and no longer matches any step: "${d.name}".\n` +
      'Fix the step so it matches again, or accept it as prose.',
  }))
}

const driftLinter = linter((view) => driftDiagnostics(view.state.field(driftField)), {
  needsRefresh: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setDrift))),
})

const resultsField = StateField.define<SpecResults | null>({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged) return null // results go stale on edit
    for (const e of tr.effects) if (e.is(setRunResults)) return e.value
    return value
  },
})

// Line-background decorations derived from the results.
const decoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    // Between an edit and its (debounced) re-run there are no fresh results —
    // keep the previous wash, remapped through the edit, instead of blanking
    // it and repainting a few hundred ms later (a visible green→white→green
    // flicker). Only a setRunResults effect rebuilds (or clears) the wash.
    let results: SpecResults | null | undefined
    for (const e of tr.effects) if (e.is(setRunResults)) results = e.value
    if (results === undefined) return deco.map(tr.changes)
    if (results === null) return Decoration.none
    const builder = new RangeSetBuilder<Decoration>()
    const cls = (s: 'passed' | 'failed') => (s === 'passed' ? 'cm-run-pass' : 'cm-run-fail')
    const lines = results.examples
      .flatMap((ex) => ex.lines.map((ln) => ({ ln, status: ex.status })))
      .sort((a, b) => a.ln - b.ln)
    for (const { ln, status } of lines) {
      if (ln >= 1 && ln <= tr.state.doc.lines) {
        builder.add(
          tr.state.doc.line(ln).from,
          tr.state.doc.line(ln).from,
          Decoration.line({ class: cls(status) }),
        )
      }
    }
    return builder.finish()
  },
  provide: (f) => EditorView.decorations.from(f),
})

// Pure projection used by the linter and unit-tested directly.
export function varDiagnostics(results: SpecResults | null, docText: string): Diagnostic[] {
  if (!results) return []
  return runResultDiagnostics(results, docText).map((d) => ({
    from: d.from,
    to: d.to,
    severity: 'error',
    message: d.message,
  }))
}

const runLinter = linter(
  (view) => varDiagnostics(view.state.field(resultsField), view.state.doc.toString()),
  // Results arrive via the setRunResults effect, not a doc change — re-lint then.
  { needsRefresh: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setRunResults))) },
)

const runTheme = EditorView.baseTheme({
  // `.cm-line` prefix raises specificity above `.cm-activeLine` so the run
  // wash always wins on the cursor's active line (both are line decorations on
  // the same element). The active-line highlight itself is neutralised in
  // cm-var-theme (background: transparent).
  '.cm-line.cm-run-pass': { background: 'var(--ed-pass-bg)' },
  '.cm-line.cm-run-fail': { background: 'var(--ed-fail-bg)' },
  '.cm-line.cm-run-drift': { background: 'var(--ed-drift-bg, rgba(217, 119, 6, 0.16))' },
})

// Renders run results (line backgrounds + inline lint diagnostics). Runs are
// triggered by the host (debounced on every edit) — no buttons. No lint gutter:
// failures show as the line-background wash plus the inline diagnostic on hover,
// so the gutter column (and its marker) is unnecessary.
export function varRunExtension(): Extension {
  return [resultsField, decoField, runLinter, driftField, driftDecoField, driftLinter, runTheme]
}
