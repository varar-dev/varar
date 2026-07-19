// Go sibling of greet.steps.ts (bundle 12-combining-marks).
package fixture

import "github.com/varar-dev/varar-go/varar"

func Register(s *varar.Steps) {
	s.Sensor("I greet {string}", func(state varar.Value, args []varar.Value) varar.HandlerReturn {
		return varar.NoReturn()
	})
}

func State() varar.Value {
	return varar.NullValue
}
