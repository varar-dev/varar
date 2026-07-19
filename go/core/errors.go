package varcore

// Registration-time (author-wiring) errors — never step failures. The step
// failure model (StepError / StepFailure) lives in failure.go (execute stage).

// RegistryErrorKind classifies a RegistryError.
type RegistryErrorKind int

const (
	// ErrDuplicateStep is a duplicate step expression; the message lists both
	// source positions.
	ErrDuplicateStep RegistryErrorKind = iota
	// ErrExpression is a cucumber expression that failed to compile (e.g. an
	// undefined parameter type).
	ErrExpression
)

// RegistryError is a registration-time error.
type RegistryError struct {
	Kind    RegistryErrorKind
	Message string
}

func (e *RegistryError) Error() string { return e.Message }
