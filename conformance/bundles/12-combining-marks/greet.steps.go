// Go sibling of greet.steps.ts (bundle 12-combining-marks).
package fixture

import "github.com/varar-dev/varar/go/varar"

func Register(s *varar.Steps[varar.Value]) {
	// One slot: echoing the capture back makes the core compare it against the
	// document, which is what exercises the combining-mark span offsets.
	s.Sensor("I greet {string}", func(state varar.Value, name string) (string, error) {
		return name, nil
	})
}

func State() varar.Value {
	return varar.NullValue
}
