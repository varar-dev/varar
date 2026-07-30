package core

// Run-result records — port of result.ts / result.rs / result.py. The
// persisted .varar/<oathPath>.json file is a serialized OathResults, read by
// the language server to place run diagnostics in the editor (ADR 0014).
//
// The JSON tags are the contract: they match the TypeScript field names
// exactly, and `omitempty` keeps the optional members absent (not null) when
// they do not apply, so a reader that predates them still parses the file.

// CellFailure is one mismatched CELL as a source-offset range plus the runtime
// value. From/To are absolute UTF-16 source offsets; To is exclusive.
type CellFailure struct {
	From   int    `json:"from"`
	To     int    `json:"to"`
	Actual string `json:"actual"`
}

// AnchorRange is where a failure points in the source: an offset range, To
// exclusive. The failing step's match span, or the first mismatched cell's
// span (the anchor rule). This is what lets a renderer underline the step that
// failed rather than the whole line it sits on.
type AnchorRange struct {
	From int `json:"from"`
	To   int `json:"to"`
}

// ExampleStatus is an example's run outcome, serialized as the TypeScript
// string-literal union it mirrors.
type ExampleStatus string

const (
	StatusPassed ExampleStatus = "passed"
	StatusFailed ExampleStatus = "failed"
)

// ExampleFailure is the failure payload of a failed ExampleResult. Cells and
// Anchor are nil when they do not apply; Stack is deliberately runtime-shaped
// (no consumer parses it).
type ExampleFailure struct {
	Line    int           `json:"line"`
	Message string        `json:"message"`
	Stack   string        `json:"stack"`
	Cells   []CellFailure `json:"cells,omitempty"`
	Anchor  *AnchorRange  `json:"anchor,omitempty"`
}

// ExampleResult is the run result for one BDD example. Lines are the 1-based
// source lines of its steps (the editor's line-wash anchors).
type ExampleResult struct {
	Name    string          `json:"name"`
	Status  ExampleStatus   `json:"status"`
	Lines   []int           `json:"lines"`
	Failure *ExampleFailure `json:"failure,omitempty"`
}

// OathResults is the persisted run result for one oath file. OathPath uses
// POSIX separators and is relative to the workspace root; SourceHash is
// HashSource over the oath as it was run, so a reader can tell whether the
// offsets still apply to the buffer in front of it.
type OathResults struct {
	Version    int             `json:"version"`
	OathPath   string          `json:"oathPath"`
	SourceHash string          `json:"sourceHash"`
	Examples   []ExampleResult `json:"examples"`
}
