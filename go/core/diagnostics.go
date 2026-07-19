package varcore

// Diagnostics produced by the planner — port of the subset of diagnostics.ts
// that Plan needs / diagnostics.rs.

// Severity is a diagnostic severity.
type Severity int

const (
	SeverityError Severity = iota
	SeverityWarning
	SeverityInfo
)

// DiagnosticCode is the closed set of diagnostic codes the planner produces.
// The declaration order matches the reference enum's ordinal (sort semantics).
type DiagnosticCode int

const (
	CodeAmbiguousMatch DiagnosticCode = iota
	CodeErrorFenceWithoutStep
	CodeDrift
)

// Diagnostic is one diagnostic: its code, severity, and the source span it
// points at.
type Diagnostic struct {
	Code     DiagnosticCode
	Severity Severity
	Span     Span
}

// ambiguousMatch builds an ambiguous-match diagnostic pointing at span.
func ambiguousMatch(span Span) Diagnostic {
	return Diagnostic{Code: CodeAmbiguousMatch, Severity: SeverityError, Span: span}
}

// errorFenceWithoutStep builds an error-fence-without-step diagnostic.
func errorFenceWithoutStep(span Span) Diagnostic {
	return Diagnostic{Code: CodeErrorFenceWithoutStep, Severity: SeverityError, Span: span}
}
