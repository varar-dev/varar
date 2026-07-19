// Go sibling of echo.steps.ts (bundle 06-doc-string-mismatch).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	// Returns the WRONG string for the doc-string slot; the core compares it to
	// the doc string and fails with DocStringMismatch.
	varar.Sensor1(s, "I echo the following:", func(state varar.Value, doc string) (string, error) {
		return "goodbye", nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
