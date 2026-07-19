// Go sibling of boom.steps.ts (bundle 09-expected-message-mismatch).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	// Fails with a message that does NOT contain the expected substring
	// "expected message", so the expected-failure is NOT satisfied → the
	// example fails.
	s.Stimulus("I always boom", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.Fails("actual different error")
	})
}

func State() varar.Value {
	return varar.NullValue
}
