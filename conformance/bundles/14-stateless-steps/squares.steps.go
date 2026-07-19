// Go sibling of squares.steps.ts (bundle 14-stateless-steps).
//
// Pure steps — nothing to arrange or evolve — so State() is the bare null every
// handler ignores.
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	s.Stimulus("I warm up my mental math", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
	// Two slots ({int}, {int}); the handler uses only the first and returns
	// both computed columns [n, n*n] for positional comparison.
	s.Sensor("The square of {int} is {int}.", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		n, _ := args[0].AsInt()
		return varar.Ptr(varar.ListValue(varar.IntValue(n), varar.IntValue(n*n))), nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
