package example

import (
	"fmt"
	"time"
)

// Money is an amount in a currency. Domain code never parses or renders it —
// the document's notation ("50p", "£2.50") lives in library.steps.go.
type Money struct {
	Currency string
	Value    float64
}

// GBP is an amount in pounds sterling.
func GBP(value float64) Money {
	return Money{Currency: "GBP", Value: value}
}

// FeePerDay is the overdue fee per day: 50p.
var FeePerDay = GBP(0.5)

// AddMoney adds two amounts, rejecting a currency mismatch.
func AddMoney(a, b Money) (Money, error) {
	if a.Currency != b.Currency {
		return Money{}, fmt.Errorf("cannot add %s to %s", b.Currency, a.Currency)
	}
	return Money{Currency: a.Currency, Value: a.Value + b.Value}, nil
}

// Loan is one borrowed title and the day it is due back.
type Loan struct {
	Title string
	Due   time.Time
}

const hoursPerDay = 24

// LateFee is the fee owed for returning a loan on returnedOn — nothing if it is
// back on or before its due date.
func LateFee(loan Loan, returnedOn time.Time) Money {
	daysLate := returnedOn.Sub(loan.Due).Hours() / hoursPerDay
	if daysLate < 0 {
		daysLate = 0
	}
	return GBP(daysLate * FeePerDay.Value)
}

// MayBorrow reports whether a new loan may be taken out on `on` — an overdue
// book blocks it.
func MayBorrow(loans []Loan, on time.Time) bool {
	for _, loan := range loans {
		if loan.Due.Before(on) {
			return false
		}
	}
	return true
}
