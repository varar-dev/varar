// Go sibling of numerals.steps.ts (bundle 01-roman-numerals).
//
// Full-replacement state: the {result} map is the whole state.
package fixture

import (
	"github.com/varar-dev/varar/go/varar"
)

func roman(n int64) (string, bool) {
	switch n {
	case 1:
		return "I", true
	case 4:
		return "IV", true
	case 9:
		return "IX", true
	case 40:
		return "XL", true
	}
	return "", false
}

func resultOf(state varar.Value) string {
	if m, ok := state.AsMap(); ok {
		if rv, ok := m["result"]; ok {
			if str, ok := rv.AsString(); ok {
				return str
			}
		}
	}
	return ""
}

func Register(s *varar.Steps[varar.Value]) {
	s.Stimulus("I convert {int} to roman numerals", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		n, _ := args[0].AsInt()
		m := map[string]varar.Value{}
		if r, ok := roman(n); ok {
			m["result"] = varar.StrValue(r)
		}
		return varar.Ptr(varar.MapValue(m)), nil
	})
	// The trailing "." is matched literally, so {word} captures just the numeral
	// and this sensor returns the observed value for the core to compare.
	s.Sensor("The result is {word}.", func(state varar.Value, expected string) (string, error) {
		return resultOf(state), nil
	})
}

func State() varar.Value {
	return varar.MapValue(map[string]varar.Value{})
}
