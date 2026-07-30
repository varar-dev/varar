package core

import (
	"reflect"
	"testing"
)

// Port of the structurer.test.ts delimiter test (ADR 0012).

func TestPrecededByDelimiterMarksCandidatesAfterHeadingOrThematicBreak(t *testing.T) {
	source := "First para.\n\nSecond para.\n\n---\n\nThird para.\n\n## H\n\nFourth para."
	doc := structure("d.md", source, scan(source))
	got := make([]bool, len(doc.Examples))
	for i, e := range doc.Examples {
		got[i] = e.PrecededByDelimiter
	}
	want := []bool{
		true,  // first candidate in the file
		false, // adjacent paragraph, no delimiter between
		true,  // after `---`
		true,  // after a heading
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}
