package example

import (
	"errors"
	"strings"

	"github.com/varar-dev/varar-go/varar"
)

func registerLibrary(s *varar.Steps[Ctx]) {
	s.Param("date", `[A-Z][a-z]+ \d{1,2}, \d{4}`,
		func(g []string) Date { return ParseDate(g[0]) },
		func(d Date) (string, bool) { return FormatDate(d), true })

	s.Param("money", `£\d+(?:\.\d+)?|\d+p`,
		func(g []string) int { return int(ParseMoney(g[0])) },
		func(pennies int) (string, bool) { return FormatMoney(int64(pennies)), true })

	s.Param("title", `\*[^*]+\*`,
		func(g []string) string { return strings.TrimSuffix(strings.TrimPrefix(g[0], "*"), "*") },
		func(t string) (string, bool) { return "*" + t + "*", true })

	s.Stimulus("borrowed {title}, due back on {date}", func(ctx Ctx, title string, due Date) (Ctx, error) {
		ctx.Loans = append(append([]Loan{}, ctx.Loans...), Loan{Title: title, Due: due})
		return ctx, nil
	})

	s.Stimulus("returns it on {date}", func(ctx Ctx, returned Date) (Ctx, error) {
		fee := 0
		for _, loan := range ctx.Loans {
			fee += int(LateFee(loan.Due, returned))
		}
		ctx.Fee = fee
		return ctx, nil
	})

	s.Sensor("owes a {money} late fee", func(ctx Ctx, expected int) (int, error) {
		return ctx.Fee, nil
	})

	s.Sensor("{money} for each day overdue", func(ctx Ctx, expected int) (int, error) {
		return int(FeePerDay), nil
	})

	s.Stimulus("asks to borrow {title} on {date}", func(ctx Ctx, title string, on Date) (Ctx, error) {
		dues := make([]Date, len(ctx.Loans))
		for i, loan := range ctx.Loans {
			dues[i] = loan.Due
		}
		ctx.Granted = MayBorrow(dues, on)
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
