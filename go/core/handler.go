package varcore

// Step handlers — Go's replacement for the reference's reflective arity-matched
// invocation. A handler is a closure over (state, args); args holds every
// expression capture plus the trailing table/doc string, in slot order. Go
// handlers are synchronous (a blocking func); there is no async variant — a
// handler that needs concurrency uses goroutines internally.

// HandlerError is an author-signalled failure (the analog of a thrown
// AssertionError / RuntimeException).
type HandlerError struct {
	Message string
}

// NewHandlerError builds a HandlerError.
func NewHandlerError(message string) *HandlerError {
	return &HandlerError{Message: message}
}

func (e *HandlerError) Error() string { return e.Message }

// HandlerReturn is a handler's resolved return. Present=false means "no
// assertion / no state change" (the reference's null/None); Present=true carries
// a value (for a stimulus, the whole next state; for a sensor, the value to
// compare). Err != nil is an author-signalled failure.
type HandlerReturn struct {
	Value   Value
	Present bool
	Err     *HandlerError
}

// Returns builds a "value present" return.
func Returns(v Value) HandlerReturn { return HandlerReturn{Value: v, Present: true} }

// NoReturn is the "no assertion / no change" return.
func NoReturn() HandlerReturn { return HandlerReturn{} }

// Fails builds a failing return.
func Fails(message string) HandlerReturn { return HandlerReturn{Err: NewHandlerError(message)} }

// HandlerFunc is the closure a Handler wraps.
type HandlerFunc func(state Value, args []Value) HandlerReturn

// Handler is a registered step handler.
type Handler struct {
	f HandlerFunc
}

// NewHandler wraps a HandlerFunc.
func NewHandler(f HandlerFunc) Handler { return Handler{f: f} }

// NoopHandler is a no-op handler — used where a handler is never invoked.
func NoopHandler() Handler {
	return Handler{f: func(Value, []Value) HandlerReturn { return NoReturn() }}
}

// call invokes the handler with state + args (captures then trailing attachment).
func (h Handler) call(state Value, args []Value) HandlerReturn {
	if h.f == nil {
		return NoReturn()
	}
	return h.f(state, args)
}
