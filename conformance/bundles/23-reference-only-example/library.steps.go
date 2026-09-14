// Go sibling of library.steps.ts (bundle 23-reference-only-example).
package fixture

import "github.com/varar-dev/varar/go/varar"

func shelfOf(state varar.Value) int {
	if m, ok := state.AsMap(); ok {
		if c, ok := m["shelf"]; ok {
			if n, ok := c.AsInt(); ok {
				return int(n)
			}
		}
	}
	return 0
}

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I shelve {int} books", func(state varar.Value, n int) (varar.Value, error) {
		return varar.MapValue(map[string]varar.Value{"shelf": varar.IntValue(int64(shelfOf(state) + n))}), nil
	})
	s.Stimulus("I borrow a book", func(state varar.Value) (varar.Value, error) {
		return varar.MapValue(map[string]varar.Value{"shelf": varar.IntValue(int64(shelfOf(state) - 1))}), nil
	})
	s.Sensor("The shelf holds {int} books", func(state varar.Value, expected int) (int, error) {
		return shelfOf(state), nil
	})
}

func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{"shelf": varar.IntValue(0)})
}
