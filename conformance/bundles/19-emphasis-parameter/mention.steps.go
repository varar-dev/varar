// Go sibling of mention.steps.ts (bundle 19-emphasis-parameter).
package fixture

import "github.com/varar-dev/varar/go/varar"

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I mention {emph}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		return nil, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
