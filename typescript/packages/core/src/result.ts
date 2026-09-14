// One mismatched CELL as a source-offset range plus the runtime value.
// `from`/`to` are absolute source offsets (== CodeMirror positions); `to` is
// exclusive.
export type CellFailure = {
  readonly from: number
  readonly to: number
  readonly actual: string
}

export type ExampleResult = {
  readonly name: string
  readonly status: 'passed' | 'failed'
  // 1-based source lines of this example's steps (the line-wash anchors).
  readonly lines: ReadonlyArray<number>
  readonly failure?: {
    readonly line: number
    readonly message: string
    readonly stack: string
    // every mismatched cell: table, header-bound row, inline capture or doc string
    readonly cells?: ReadonlyArray<CellFailure>
    // Where the failure points in the source (the failureAnchor rule): the
    // failing step's match span, or the first mismatched cell's span. This is
    // what lets a renderer underline the step that failed rather than the whole
    // line it sits on. Offsets, `to` exclusive, like CellFailure. Optional for
    // the same reason `cells` is: a result written by a port (or a release) that
    // doesn't record it still reads, and falls back to `line`.
    readonly anchor?: { readonly from: number; readonly to: number }
    // The document `line`, `cells` and `anchor` are offsets INTO. Absent — the
    // overwhelming majority — means the oath itself. Present only when the
    // failing step was spliced in from another oath by a reference block (ADR
    // 0016): its spans belong to that document, and a renderer that placed them
    // in this one would underline whatever text happened to sit at those
    // offsets. Its current hash is in `documents`.
    readonly docPath?: string
  }
}

// The persisted run result for one oath file. The `.varar/<oath>.json` file IS a
// serialized OathResults.
export type OathResults = {
  readonly version: 2
  readonly oathPath: string // POSIX separators, relative to cwd
  readonly sourceHash: string // hashSource(oath source) at run time
  // Every OTHER document this run's steps came from — the oaths a reference
  // block pulled steps in from (ADR 0016), with their hashes as run. A consumer
  // drops a failure whose document has moved on, exactly as it does for the
  // oath's own `sourceHash`. Absent when no step was spliced in, which is the
  // common case.
  readonly documents?: ReadonlyArray<{ readonly path: string; readonly sourceHash: string }>
  readonly examples: ReadonlyArray<ExampleResult>
}
