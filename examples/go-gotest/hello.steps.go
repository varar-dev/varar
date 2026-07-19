package example

import "github.com/varar-dev/varar-go/varar"

func registerHelloVar(s *varar.Steps) {
	s.Stimulus("I greet {string}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		m := state.CloneMap()
		m["greeting"] = varar.StrValue("Hello, " + args[0].MustString() + "!")
		return varar.Ptr(varar.MapValue(m)), nil
	})

	s.Sensor("the greeting should be {string}", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		if g, ok := state.CloneMap()["greeting"]; ok {
			return varar.Ptr(g), nil
		}
		return nil, nil
	})

	s.Stimulus("expression `{int}+{int}`", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		m := state.CloneMap()
		m["result"] = varar.IntValue(args[0].MustInt() + args[1].MustInt())
		return varar.Ptr(varar.MapValue(m)), nil
	})

	s.Sensor("evaluate to `{int}`", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		if r, ok := state.CloneMap()["result"]; ok {
			return varar.Ptr(r), nil
		}
		return nil, nil
	})
}
