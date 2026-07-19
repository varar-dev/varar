// Go sibling of report.steps.ts (bundle 07-row-check-mismatch).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	// Header-bound row step: returns its computed columns; the core diffs them
	// against the row cells (rowChecks). score 99 ≠ 10 → CellMismatch.
	s.Sensor("I report the score and grade", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.Returns(varar.MapValue(map[string]varar.Value{
			"score": varar.StrValue("99"),
			"grade": varar.StrValue("A"),
		}))
	})
}

func State() varar.Value {
	return varar.NullValue
}
