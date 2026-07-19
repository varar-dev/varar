package varcore

// Table row/cell comparison — port of cell-diff.ts / cell_diff.rs. The compare
// functions and CellDiff live in cell_diff_compare.go (execute stage); this file
// holds RowCheck, which the planner constructs.

// RowCheck is one checked column of one header-bound row.
type RowCheck struct {
	Column string
	Value  string
	Span   Span
}

// NewRowCheck builds a RowCheck.
func NewRowCheck(column, value string, span Span) RowCheck {
	return RowCheck{Column: column, Value: value, Span: span}
}
