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
  }
}

// The persisted run result for one oath file. The `.varar/<oath>.json` file IS a
// serialized OathResults.
export type OathResults = {
  readonly version: 1
  readonly oathPath: string // POSIX separators, relative to cwd
  readonly sourceHash: string // hashSource(oath source) at run time
  readonly examples: ReadonlyArray<ExampleResult>
}
