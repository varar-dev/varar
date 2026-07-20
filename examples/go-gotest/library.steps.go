package example

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/varar-dev/varar-go/varar"
)

// dateLayout is the document's date notation — "June 1, 2026" — in Go's
// reference-time spelling.
const dateLayout = "January 2, 2006"

// Date carries a time.Time across the slot boundary. The domain speaks plain
// time.Time (see library.go); a step slot has to survive a round trip through
// the core's Value, and time.Time has no exported fields, so this thin wrapper
// says how to encode and decode itself — the only reason it exists.
type Date struct {
	time.Time
}

// EncodeVarValue renders the date in the document's notation.
func (d Date) EncodeVarValue() varar.Value {
	return varar.StrValue(d.Format(dateLayout))
}

// DecodeVarValue reads a date back out of the document's notation.
func (d *Date) DecodeVarValue(v varar.Value) error {
	raw, ok := v.AsString()
	if !ok {
		return fmt.Errorf("not a date: %s", v.TypeName())
	}
	t, err := time.Parse(dateLayout, raw)
	if err != nil {
		return err
	}
	d.Time = t
	return nil
}

func registerLibrary(s *varar.Steps[Ctx]) {
	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`,
		func(g []string) Date {
			t, err := time.Parse(dateLayout, g[0])
			if err != nil {
				panic(err)
			}
			return Date{Time: t}
		},
		func(d Date) (string, bool) { return d.Format(dateLayout), true })

	s.Param("money", `£\d+(?:\.\d+)?|\d+p`,
		func(g []string) Money {
			raw := g[0]
			if pence, ok := strings.CutSuffix(raw, "p"); ok {
				return GBP(mustFloat(pence) / 100)
			}
			return GBP(mustFloat(strings.TrimPrefix(raw, "£")))
		},
		func(m Money) (string, bool) {
			if m.Value < 1 {
				return fmt.Sprintf("%dp", int64(math.Round(m.Value*100))), true
			}
			return fmt.Sprintf("£%.2f", m.Value), true
		})

	s.Param("title", `\*[^*]+\*`,
		func(g []string) string { return strings.TrimSuffix(strings.TrimPrefix(g[0], "*"), "*") },
		func(t string) (string, bool) { return "*" + t + "*", true })

	s.Stimulus("borrowed {title}, due back on {date}", func(ctx Ctx, title string, due Date) (Ctx, error) {
		ctx.Loans = append(append([]Loan{}, ctx.Loans...), Loan{Title: title, Due: due.Time})
		return ctx, nil
	})

	s.Stimulus("returns it on {date}", func(ctx Ctx, returned Date) (Ctx, error) {
		fee := GBP(0)
		for _, loan := range ctx.Loans {
			sum, err := AddMoney(fee, LateFee(loan, returned.Time))
			if err != nil {
				return ctx, err
			}
			fee = sum
		}
		ctx.Fee = fee
		return ctx, nil
	})

	s.Sensor("owes a {money} late fee", func(ctx Ctx, expected Money) (Money, error) {
		return ctx.Fee, nil
	})

	s.Sensor("{money} for each day overdue", func(ctx Ctx, expected Money) (Money, error) {
		return FeePerDay, nil
	})

	s.Stimulus("asks to borrow {title} on {date}", func(ctx Ctx, title string, on Date) (Ctx, error) {
		ctx.Granted = MayBorrow(ctx.Loans, on.Time)
		return ctx, nil
	})

	s.Sensor("the library refuses", func(ctx Ctx) error {
		if ctx.Granted {
			return errors.New("expected the library to refuse")
		}
		return nil
	})

	s.Sensor("the library agrees", func(ctx Ctx) error {
		if !ctx.Granted {
			return errors.New("expected the library to agree")
		}
		return nil
	})
}

func mustFloat(s string) float64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		panic("not a number: " + s)
	}
	return f
}
