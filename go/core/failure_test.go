package core

import (
	"strings"
	"testing"
)

// Port of failure.test.ts / failure_test.rs — plus the step-span case from
// failure-step-span.test.ts, which here needs no executor: Go carries the
// anchor structurally on the location, so ToFailure's contract can be stated
// directly.

const (
	failureSource = "# L\n\nHe asks on June 10, and the library agrees.\n"
	failureStep   = "the library agrees"
)

// The sensor's own span — mid-line, after a stimulus that passed, which is the
// whole point: underlining the line would blame the stimulus too.
var (
	stepFrom = strings.Index(failureSource, failureStep)
	stepTo   = stepFrom + len(failureStep)
)

func located(err StepError) StepFailure {
	return StepFailure{
		Error: err,
		Location: &FailureLocation{
			Label:  "the library agrees",
			Path:   "l.md",
			Line:   3,
			Anchor: AnchorRange{From: stepFrom, To: stepTo},
		},
	}
}

func TestToFailureRecordsTheAnchorOfTheStepThatFailed(t *testing.T) {
	f := ToFailure(located(handlerStepError(HandlerError{Message: "expected the library to refuse"})), "l.md", 99)
	if f.Anchor == nil {
		t.Fatal("a located failure records an anchor")
	}
	if got := utf16Slice(failureSource, f.Anchor.From, f.Anchor.To); got != failureStep {
		t.Errorf("anchor covers %q, want %q", got, failureStep)
	}
	if f.Line != 3 {
		t.Errorf("line %d, want 3", f.Line)
	}
	if f.Message != "expected the library to refuse" {
		t.Errorf("message %q", f.Message)
	}
}

func TestToFailureFallsBackWhenTheLocationIsForAnotherOath(t *testing.T) {
	f := ToFailure(located(returnShapeError("bad")), "other.md", 99)
	if f.Anchor != nil {
		t.Errorf("anchor %v, want none for a different oath", *f.Anchor)
	}
	if f.Line != 99 {
		t.Errorf("line %d, want the fallback 99", f.Line)
	}
}

func TestToFailureHasNoAnchorWithoutALocation(t *testing.T) {
	f := ToFailure(bareFailure(returnShapeError("nope")), "l.md", 7)
	if f.Anchor != nil || f.Cells != nil {
		t.Errorf("bare failure carries anchor=%v cells=%v, want neither", f.Anchor, f.Cells)
	}
	if f.Line != 7 {
		t.Errorf("line %d, want the fallback 7", f.Line)
	}
}

func TestToFailureExtractsOnlyTheFailingCells(t *testing.T) {
	source := "a | 5 |"
	err := cellMismatchError([]CellDiff{
		{Column: "n", Span: spanFromOffsets(source, 4, 5), Expected: "5", Actual: "4", Ok: false},
		{Column: "ok", Span: spanFromOffsets(source, 0, 1), Expected: "a", Actual: "a", Ok: true},
	})
	f := ToFailure(located(err), "l.md", 3)
	if len(f.Cells) != 1 {
		t.Fatalf("got %d cells, want 1", len(f.Cells))
	}
	if f.Cells[0] != (CellFailure{From: 4, To: 5, Actual: "4"}) {
		t.Errorf("cell %+v", f.Cells[0])
	}
}
