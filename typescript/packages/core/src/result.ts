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
  }
}

// The persisted run result for one oath file. The `.var/<oath>.json` file IS a
// serialized OathResults.
export type OathResults = {
  readonly version: 1
  readonly oathPath: string // POSIX separators, relative to cwd
  readonly sourceHash: string // hashSource(oath source) at run time
  readonly examples: ReadonlyArray<ExampleResult>
}
