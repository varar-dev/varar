// Go sibling of cukes.steps.ts (bundle 05-ambiguous-match).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	// Both expressions match "I have 5 cukes" → ambiguous-match diagnostic.
	s.Stimulus("I have {int} cukes", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.NoReturn()
	})
	s.Stimulus("I have 5 cukes", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.NoReturn()
	})
}

func State() varar.Value {
	return varar.NullValue
}
