package runner

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/varar-dev/varar/go/core"
)

// The cross-port wire format of .varar/<oathPath>.json (ADR 0014). Every port
// builds this same value; the parsed result must match — see
// conformance/run-results/README.md for what that pins, and why the bundle
// goldens don't cover it.

func wireResults() core.OathResults {
	return core.OathResults{
		Version:    1,
		OathPath:   "varar/library.md",
		SourceHash: "fnv1a:1622dfca",
		Examples: []core.ExampleResult{
			{
				Name:   "Maya borrowed *Emma*, due back on June 1, 2026",
				Status: core.StatusPassed,
				Lines:  []int{3, 4},
			},
			{
				Name:   "Ben borrowed *Dune* for £2.50 & kept it",
				Status: core.StatusFailed,
				Lines:  []int{13, 14},
				Failure: &core.ExampleFailure{
					Line:    14,
					Message: "expected £2.50 but was £3.00\nand the library <refused>",
					Stack:   "<stack>",
					Cells:   []core.CellFailure{{From: 71, To: 77, Actual: "£3.00"}},
					Anchor:  &core.AnchorRange{From: 60, To: 90},
				},
			},
			{
				Name:   "Noor borrowed *Kindred*",
				Status: core.StatusFailed,
				Lines:  []int{8, 9},
				Failure: &core.ExampleFailure{
					Line:    9,
					Message: "expected the library to refuse",
					Stack:   "<stack>",
				},
			},
		},
	}
}

func TestWireFormatMatchesTheCrossPortFixture(t *testing.T) {
	root := t.TempDir()
	if _, err := WriteOathResults(root, wireResults()); err != nil {
		t.Fatalf("write: %v", err)
	}
	written, err := os.ReadFile(ResultFilePath(root, "varar/library.md"))
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	expected, err := os.ReadFile(filepath.Join("..", "..", "conformance", "run-results", "expected.json"))
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	// By CONTENT: the file has to SAY the same thing in every port — field names,
	// the shapes, and an optional member absent rather than null.
	got, err := core.ParseJSONValue(string(written))
	if err != nil {
		t.Fatalf("written file is not valid JSON: %v", err)
	}
	want, err := core.ParseJSONValue(string(expected))
	if err != nil {
		t.Fatalf("fixture is not valid JSON: %v", err)
	}
	if !core.ValueEqual(got, want) {
		t.Errorf("wire format differs from the fixture\n--- got ---\n%s\n--- want ---\n%s", written, expected)
	}
}
