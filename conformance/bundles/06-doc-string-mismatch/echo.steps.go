// Go sibling of echo.steps.ts (bundle 06-doc-string-mismatch).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	// Returns the WRONG string (bare — the doc string is the only slot); the
	// core compares it to the doc string and fails with DocStringMismatch.
	s.Sensor("I echo the following:", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.Returns(varar.StrValue("goodbye"))
	})
}

func State() varar.Value {
	return varar.NullValue
}
