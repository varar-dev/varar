package example

import (
	"errors"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func dateValue(d Date) varar.Value {
	return varar.MapValue(map[string]varar.Value{
		"year":  varar.IntValue(d.Year),
		"month": varar.IntValue(d.Month),
		"day":   varar.IntValue(d.Day),
	})
}

func valueDate(v varar.Value) Date {
	m := v.CloneMap()
	return Date{Year: m["year"].MustInt(), Month: m["month"].MustInt(), Day: m["day"].MustInt()}
}

func loanDue(loan varar.Value) Date {
	return valueDate(loan.CloneMap()["due"])
}

func loansOf(state varar.Value) []varar.Value {
	if l, ok := state.CloneMap()["loans"]; ok {
		if list, ok := l.AsList(); ok {
			return list
		}
	}
	return nil
}

func registerLibrary(s *varar.Steps) {
	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`,
		func(g []string) varar.Value { return dateValue(ParseDate(g[0])) },
		func(v varar.Value) (string, bool) { return FormatDate(valueDate(v)), true })

	s.Param("money", `£\d+(?:\.\d+)?|\d+p`,
		func(g []string) varar.Value { return varar.IntValue(ParseMoney(g[0])) },
		func(v varar.Value) (string, bool) {
			if p, ok := v.AsInt(); ok {
				return FormatMoney(p), true
			}
			return "", false
		})

	s.Param("title", `\*[^*]+\*`,
		func(g []string) varar.Value {
			inner := strings.TrimSuffix(strings.TrimPrefix(g[0], "*"), "*")
			return varar.StrValue(inner)
		},
		func(v varar.Value) (string, bool) {
			if t, ok := v.AsString(); ok {
				return "*" + t + "*", true
			}
			return "", false
		})

	s.Stimulus("borrowed {title}, due back on {date}",
		func(state varar.Value, title string, due varar.Value) (varar.Value, error) {
			m := state.CloneMap()
			loans := append(loansOf(state), varar.MapValue(map[string]varar.Value{"title": varar.StrValue(title), "due": due}))
			m["loans"] = varar.ListOf(loans)
			return varar.MapValue(m), nil
		})

	s.Stimulus("returns it on {date}", func(state varar.Value, on varar.Value) (varar.Value, error) {
		returned := valueDate(on)
		var fee int64
		for _, loan := range loansOf(state) {
			fee += LateFee(loanDue(loan), returned)
		}
		m := state.CloneMap()
		m["fee"] = varar.IntValue(fee)
		return varar.MapValue(m), nil
	})

	// {money} parses to pennies, so the slot has a primitive spelling: the
	// observed fee goes back out as an int and the core compares it.
	s.Sensor("owes a {money} late fee", func(state varar.Value, expected int) (int, error) {
		fee, _ := state.CloneMap()["fee"].AsInt()
		return int(fee), nil
	})

	s.Sensor("{money} for each day overdue", func(state varar.Value, expected int) (int, error) {
		return int(FeePerDay), nil
	})

	s.Stimulus("asks to borrow {title} on {date}",
		func(state varar.Value, title string, on varar.Value) (varar.Value, error) {
			var dues []Date
			for _, loan := range loansOf(state) {
				dues = append(dues, loanDue(loan))
			}
			m := state.CloneMap()
			m["granted"] = varar.BoolValue(MayBorrow(dues, valueDate(on)))
			return varar.MapValue(m), nil
		})

	s.Sensor("the library refuses", func(state varar.Value) error {
		if g, ok := state.CloneMap()["granted"]; ok {
			if b, _ := g.AsBool(); b {
				return errors.New("expected the library to refuse")
			}
		}
		return nil
	})

	s.Sensor("the library agrees", func(state varar.Value) error {
		g, ok := state.CloneMap()["granted"]
		granted := false
		if ok {
			granted, _ = g.AsBool()
		}
		if !granted {
			return errors.New("expected the library to agree")
		}
		return nil
	})
}
