package example

import "github.com/varar-dev/varar-go/varar"

func registerHelloVar(s *varar.Steps) {
	varar.Stimulus1(s, "I greet {string}", func(state varar.Value, name string) (varar.Value, error) {
		m := state.CloneMap()
		m["greeting"] = varar.StrValue("Hello, " + name + "!")
		return varar.MapValue(m), nil
	})

	varar.Sensor1(s, "the greeting should be {string}",
		func(state varar.Value, expected string) (string, error) {
			greeting, _ := state.CloneMap()["greeting"].AsString()
			return greeting, nil
		})

	varar.Stimulus2(s, "expression `{int}+{int}`", func(state varar.Value, a, b int) (varar.Value, error) {
		m := state.CloneMap()
		m["result"] = varar.IntValue(int64(a + b))
		return varar.MapValue(m), nil
	})

	varar.Sensor1(s, "evaluate to `{int}`", func(state varar.Value, expected int) (int, error) {
		result, _ := state.CloneMap()["result"].AsInt()
		return int(result), nil
	})
}
