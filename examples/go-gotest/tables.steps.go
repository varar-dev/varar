package example

import (
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerTablesAndDocstrings(s *varar.Steps) {
	s.Sensor("Uppercase each one:", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		rows := args[0].MustList()
		out := []varar.Value{}
		for _, row := range rows[1:] { // skip the header row
			before := row.MustList()[0].MustString()
			out = append(out, varar.MapValue(map[string]varar.Value{
				"before": varar.StrValue(before),
				"after":  varar.StrValue(strings.ToUpper(before)),
			}))
		}
		return varar.Ptr(varar.ListOf(out)), nil
	})

	s.Sensor("Greet {word}:", func(state varar.Value, args []varar.Value) (*varar.Value, error) {
		name := args[0].MustString()
		return varar.Ptr(varar.ListValue(
			varar.StrValue(name),
			varar.StrValue("Hello, "+name+"!\n"),
		)), nil
	})
}
