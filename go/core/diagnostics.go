package core

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
	// Reference blocks (ADR 0016): a link that resolves to no oath, to a
	// section with no steps, to a chain that reaches itself, or to an anchor
	// that more than one heading in the target slugifies to.
	CodeReferenceNotFound
	CodeReferenceEmpty
	CodeReferenceCycle
	CodeAmbiguousAnchor
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

// referenceNotFound: a reference block points at an oath the workspace does not
// hold. Never prose — a link-only block that resolves to nothing has no other
// reading, so it fails the run rather than degrading silently (ADR 0016).
func referenceNotFound(text, path string, span Span) Diagnostic {
	return Diagnostic{Code: CodeReferenceNotFound, Severity: SeverityError, Span: span}
}

// referenceEmpty: the referenced document exists but the section contributes no
// steps — a mistyped anchor, or a section that is pure prose.
func referenceEmpty(text, path, slug string, span Span) Diagnostic {
	return Diagnostic{Code: CodeReferenceEmpty, Severity: SeverityError, Span: span}
}

// referenceCycle: references nest to any depth, so a chain that reaches a
// section already on it is reported rather than recursed into.
func referenceCycle(chain []string, span Span) Diagnostic {
	return Diagnostic{Code: CodeReferenceCycle, Severity: SeverityError, Span: span}
}

// ambiguousAnchor: the referenced document has more than one heading whose
// anchor is the slug, so the link could mean either section. Reported rather
// than guessed (GitHub would suffix the second `-1`; a reference never does).
// headingLines are the 1-based source lines of the colliding headings.
func ambiguousAnchor(text, path, slug string, headingLines []int, span Span) Diagnostic {
	return Diagnostic{Code: CodeAmbiguousAnchor, Severity: SeverityError, Span: span}
}
