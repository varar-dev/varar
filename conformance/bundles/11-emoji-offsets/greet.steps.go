// Go sibling of greet.steps.ts (bundle 11-emoji-offsets).
package fixture

import "github.com/varar-dev/varar/go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// The list item is followed by a table, appended as a trailing slot, so this
	// sensor has two slots: {string} and the table. Both are echoed back so the
	// core compares them — the table's data rows only, since the header row is
	// labels and is never compared.
	s.Sensor("I greet {string}", func(state varar.Value, name string, table [][]string) (string, [][]string, error) {
		return name, table[1:], nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
