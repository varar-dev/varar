// Go sibling of greet.steps.ts (bundle 08-string-capture).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	s.Stimulus("I greet {string}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.NoReturn()
	})
}

func State() varar.Value {
	return varar.NullValue
}
