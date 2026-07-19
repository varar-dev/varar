// Go sibling of division.steps.ts (bundle 03-expected-failure).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	s.Stimulus("I divide {int} by {int}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		b, _ := args[1].AsInt()
		if b == 0 {
			return varar.Fails("division by zero")
		}
		return varar.Returns(state)
	})
}

func State() varar.Value {
	return varar.NullValue
}
