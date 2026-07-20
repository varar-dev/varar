package example

// Ctx is this project's step state — a plain struct, not a dynamic map. Every
// handler takes and returns it, so no dynamic value type appears in a step file.
//
// State is full-replacement: a stimulus returns the whole next Ctx rather than
// mutating, and varcore keys it per step file, so each spec starts from the
// same fresh initial value (see Context in steps.go).
type Ctx struct {
	// hello-var
	Greeting string
	Result   int

	// library
	Loans   []Loan
	Fee     Money
	Granted bool
}
