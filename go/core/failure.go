package core

import (
	"fmt"
	"strings"
)

// The step-failure model — Go's replacement for the reference's typed exception
// hierarchy (CellMismatch, DocStringMismatch, ReturnShape, UnexpectedPass,
// author failure). A tagged StepError replaces instanceof dispatch.

// StepErrorKind classifies a StepError.
type StepErrorKind int

const (
	// SECellMismatch is one or more differing cells — an inline capture, a table
	// cell, a header-bound row's cell, or a doc string (only failing cells).
	SECellMismatch StepErrorKind = iota
	// SEReturnShape is a wrong return type/shape — an author mistake.
	SEReturnShape
	// SEUnexpectedPass is an error-fenced example that ran without failing.
	SEUnexpectedPass
	// SEHandler is an author-signalled failure or a recovered panic.
	SEHandler
)

// StepError is a step failure verdict — the closed union replacing the
// exception hierarchy.
type StepError struct {
	Kind           StepErrorKind
	Cells          []CellDiff   // SECellMismatch
	ReturnShapeMsg string       // SEReturnShape
	Handler        HandlerError // SEHandler
}

// Message is the human-readable message (getMessage parity).
func (e StepError) Message() string {
	switch e.Kind {
	case SECellMismatch:
		parts := make([]string, len(e.Cells))
		for i, c := range e.Cells {
			parts[i] = fmt.Sprintf("%s: expected %s but was %s", c.Column, c.Expected, c.Actual)
		}
		return strings.Join(parts, "; ")
	case SEReturnShape:
		return e.ReturnShapeMsg
	case SEUnexpectedPass:
		return "expected the example to fail, but it passed"
	case SEHandler:
		return e.Handler.Message
	}
	return ""
}

// cellMismatchError builds a SECellMismatch StepError.
func cellMismatchError(cells []CellDiff) StepError {
	return StepError{Kind: SECellMismatch, Cells: cells}
}

func returnShapeError(msg string) StepError {
	return StepError{Kind: SEReturnShape, ReturnShapeMsg: msg}
}

func handlerStepError(he HandlerError) StepError {
	return StepError{Kind: SEHandler, Handler: he}
}

// FailureLocation is where a failure points in the .md. Line is the anchor's
// start line (all a rendered frame can show); Anchor is its full offset range,
// so a renderer can underline the failing step instead of its whole line.
type FailureLocation struct {
	Label  string
	Path   string
	Line   int
	Anchor AnchorRange
}

// StepFailure is a caught step failure plus its (optional) source location.
type StepFailure struct {
	Error    StepError
	Location *FailureLocation
}

// bareFailure is a failure with no attached location (fallback-line path).
func bareFailure(error StepError) StepFailure {
	return StepFailure{Error: error}
}

// ToFailure turns a caught step failure into the ExampleResult.failure payload
// — port of failure.ts / failure.rs. fallbackLine is used when the failure
// carries no location for oathPath, i.e. it never passed through one of that
// oath's steps.
func ToFailure(failure StepFailure, oathPath string, fallbackLine int) ExampleFailure {
	line := fallbackLine
	var anchor *AnchorRange
	if here := failure.Location; here != nil && here.Path == oathPath {
		line = here.Line
		// The executor recorded the anchor with the location, so this is the
		// failing step's span (or the first mismatched cell's) — what a renderer
		// underlines instead of the whole line.
		a := here.Anchor
		anchor = &a
	}

	var cells []CellFailure
	if failure.Error.Kind == SECellMismatch {
		for _, c := range failure.Error.Cells {
			if !c.Ok {
				cells = append(cells, CellFailure{From: c.Span.StartOffset, To: c.Span.EndOffset, Actual: c.Actual})
			}
		}
	}

	return ExampleFailure{
		Line:    line,
		Message: failure.Error.Message(),
		Stack:   renderStack(failure),
		Cells:   cells,
		Anchor:  anchor,
	}
}

// renderStack is display-only: Go has no exception stack to scrape, so the
// location is rendered from structural data the way the Rust port does.
func renderStack(failure StepFailure) string {
	msg := failure.Error.Message()
	if l := failure.Location; l != nil {
		return fmt.Sprintf("%s\n    at %s (%s:%d)", msg, l.Label, l.Path, l.Line)
	}
	return msg
}

// quote mirrors JSON.stringify's quoting of the doc-string error message closely
// enough for a human-readable message (never parsed back).
// quote renders s the way JSON.stringify does in the TypeScript port.
//
// Every port quotes doc-string mismatch messages identically because the text is
// matched by substring in an `error` fence — a port that quotes differently fails a
// oath its siblings pass. Escaping only \\, " and \n is not enough: doc strings
// routinely carry tab-indented code. encoding/json is not usable here because it
// also escapes <, > and & by default.
func quote(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 2)
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString("\\\\")
		case '"':
			b.WriteString("\\\"")
		case '\n':
			b.WriteString("\\n")
		case '\r':
			b.WriteString("\\r")
		case '\t':
			b.WriteString("\\t")
		case '\b':
			b.WriteString("\\b")
		case '\f':
			b.WriteString("\\f")
		default:
			if r < 0x20 {
				fmt.Fprintf(&b, "\\u%04x", r)
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}
