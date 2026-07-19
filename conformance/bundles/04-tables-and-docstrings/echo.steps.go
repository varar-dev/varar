// Go sibling of echo.steps.ts (bundle 04-tables-and-docstrings).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	// The doc string is this sensor's only slot, so it is returned bare; the
	// core compares it against the input (compareDocString); equal passes.
	s.Sensor("I echo the following:", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return varar.Ptr(args[0]), nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
