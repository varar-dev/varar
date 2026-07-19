// Go sibling of counter.steps.ts (bundle 02-context-isolation).
package fixture

import (
	"fmt"

	"github.com/varar-dev/varar-go/varar"
)

func countOf(state varar.Value) int64 {
	if m, ok := state.AsMap(); ok {
		if c, ok := m["count"]; ok {
			if n, ok := c.AsInt(); ok {
				return n
			}
		}
	}
	return 0
}

func Register(s *varar.Steps) {
	s.Stimulus("I increment", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		next := countOf(state) + 1
		return varar.Ptr(varar.MapValue(map[string]varar.Value{"count": varar.IntValue(next)})), nil
	})
	s.Sensor("The count is {int}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		count := countOf(state)
		expected, _ := args[0].AsInt()
		if count != expected {
			return nil, fmt.Errorf("expected %d but got %d", expected, count)
		}
		return nil, nil
	})
}

func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{"count": varar.IntValue(0)})
}
