package varar

import (
	"fmt"
	"runtime"

	"github.com/varar-dev/varar-go/core"
)

// Typed step constructors — the ergonomic form, where each expression capture
// (and any trailing doc string) arrives as a plain Go value instead of a Value,
// and a sensor returns one value per slot.
//
// This mirrors the cross-port slot contract exactly. TypeScript writes
//
//	sensor('The square of {int} is {int}.', (_state, n: number) => [n, n * n])
//
// — two slots in, a two-element tuple out, compared positionally. Go's multiple
// return values are the same tuple, and here the *compiler* enforces the slot
// count and the per-slot types, which the TS array return cannot.
//
//	varar.Sensor2(s, "The square of {int} is {int}.",
//	    func(state varar.Value, n, square int) (int, int, error) { return n, n * n, nil })
//
// A sensor's return type per slot is the same as that slot's parameter type,
// because the core compares the returned value against the captured one — a
// different type could never be equal, so the signature makes that a compile
// error rather than a runtime mismatch.
//
// These are package-level functions, not methods, because Go does not allow
// type parameters on methods. Arity lives in the name (Sensor1/Sensor2/…),
// matching the fixed-arity conveniences in the other statically typed ports.
//
// Not every step fits: whole-table slots and header-bound rows compare by a
// different rule (cell-by-cell / by column name, not positionally by slot), and
// custom parameter types that parse to a map have no primitive Go spelling.
// Those keep using the explicit s.Sensor / s.Stimulus form with []Value, which
// stays the primitive this sugar is built on.

// Arg is the set of Go types a typed step parameter (and sensor return) may
// take. Value is the escape hatch for a slot with no primitive spelling — a
// whole table, or a custom parameter type that parses to a map or list.
type Arg interface {
	int | int64 | float64 | string | bool | Value
}

// fromValue converts a captured Value to the author's declared parameter type.
func fromValue[T Arg](v Value, slot int) (T, error) {
	var zero T
	var out any
	switch any(zero).(type) {
	case int:
		i, ok := v.AsInt()
		if !ok {
			return zero, slotTypeError(slot, "int", v)
		}
		out = int(i)
	case int64:
		i, ok := v.AsInt()
		if !ok {
			return zero, slotTypeError(slot, "int64", v)
		}
		out = i
	case float64:
		f, ok := v.AsFloat()
		if !ok {
			return zero, slotTypeError(slot, "float64", v)
		}
		out = f
	case string:
		s, ok := v.AsString()
		if !ok {
			return zero, slotTypeError(slot, "string", v)
		}
		out = s
	case bool:
		b, ok := v.AsBool()
		if !ok {
			return zero, slotTypeError(slot, "bool", v)
		}
		out = b
	case Value:
		out = v
	default:
		return zero, fmt.Errorf("var: unsupported step parameter type for slot %d", slot)
	}
	return out.(T), nil
}

// toValue converts an author's returned value back to a Value for comparison.
func toValue[T Arg](t T) Value {
	switch x := any(t).(type) {
	case int:
		return IntValue(int64(x))
	case int64:
		return IntValue(x)
	case float64:
		return FloatValue(x)
	case string:
		return StrValue(x)
	case bool:
		return BoolValue(x)
	case Value:
		return x
	}
	return NullValue
}

func slotTypeError(slot int, want string, got Value) error {
	return fmt.Errorf("var: slot %d is a %s, cannot be read as %s", slot+1, got.TypeName(), want)
}

func arityError(want, got int) error {
	return fmt.Errorf("var: this step has %d slot(s), but the handler takes %d", got, want)
}

// returned builds the handler's return value from the per-slot values: bare for
// a single slot, a positional list for two or more (the shared slot contract).
func returned(vs ...Value) *core.Value {
	if len(vs) == 1 {
		return core.Ptr(vs[0])
	}
	return core.Ptr(ListOf(vs))
}

// --- sensors ----------------------------------------------------------------

// Sensor0 registers a sensor for an expression with no slots: there is nothing
// to compare, so it only reports failure.
func Sensor0(s *Steps, expression string, h func(state Value) error) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 0 {
			return nil, arityError(0, len(args))
		}
		return nil, h(state)
	}, core.Sensor, file, line)
}

// Sensor1 registers a single-slot sensor. The returned value is compared
// against that slot.
func Sensor1[A Arg](s *Steps, expression string, h func(state Value, a A) (A, error)) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 1 {
			return nil, arityError(1, len(args))
		}
		a, err := fromValue[A](args[0], 0)
		if err != nil {
			return nil, err
		}
		got, err := h(state, a)
		if err != nil {
			return nil, err
		}
		return returned(toValue(got)), nil
	}, core.Sensor, file, line)
}

// Sensor2 registers a two-slot sensor. The two returned values are compared
// positionally against the two slots.
func Sensor2[A, B Arg](s *Steps, expression string, h func(state Value, a A, b B) (A, B, error)) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 2 {
			return nil, arityError(2, len(args))
		}
		a, err := fromValue[A](args[0], 0)
		if err != nil {
			return nil, err
		}
		b, err := fromValue[B](args[1], 1)
		if err != nil {
			return nil, err
		}
		ga, gb, err := h(state, a, b)
		if err != nil {
			return nil, err
		}
		return returned(toValue(ga), toValue(gb)), nil
	}, core.Sensor, file, line)
}

// Sensor3 registers a three-slot sensor.
func Sensor3[A, B, C Arg](s *Steps, expression string, h func(state Value, a A, b B, c C) (A, B, C, error)) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 3 {
			return nil, arityError(3, len(args))
		}
		a, err := fromValue[A](args[0], 0)
		if err != nil {
			return nil, err
		}
		b, err := fromValue[B](args[1], 1)
		if err != nil {
			return nil, err
		}
		c, err := fromValue[C](args[2], 2)
		if err != nil {
			return nil, err
		}
		ga, gb, gc, err := h(state, a, b, c)
		if err != nil {
			return nil, err
		}
		return returned(toValue(ga), toValue(gb), toValue(gc)), nil
	}, core.Sensor, file, line)
}

// --- stimuli ----------------------------------------------------------------
//
// A stimulus returns the whole next state, not per-slot values, so its return
// type is (Value, error) regardless of arity — the asymmetry that distinguishes
// the two roles.

// Stimulus0 registers a stimulus for an expression with no slots.
func Stimulus0(s *Steps, expression string, h func(state Value) (Value, error)) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 0 {
			return nil, arityError(0, len(args))
		}
		next, err := h(state)
		if err != nil {
			return nil, err
		}
		return core.Ptr(next), nil
	}, core.Stimulus, file, line)
}

// Stimulus1 registers a single-slot stimulus.
func Stimulus1[A Arg](s *Steps, expression string, h func(state Value, a A) (Value, error)) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 1 {
			return nil, arityError(1, len(args))
		}
		a, err := fromValue[A](args[0], 0)
		if err != nil {
			return nil, err
		}
		next, err := h(state, a)
		if err != nil {
			return nil, err
		}
		return core.Ptr(next), nil
	}, core.Stimulus, file, line)
}

// Stimulus2 registers a two-slot stimulus.
func Stimulus2[A, B Arg](s *Steps, expression string, h func(state Value, a A, b B) (Value, error)) *Steps {
	_, file, line, _ := runtime.Caller(1)
	return s.addAt(expression, func(state Value, args []Value) (*Value, error) {
		if len(args) != 2 {
			return nil, arityError(2, len(args))
		}
		a, err := fromValue[A](args[0], 0)
		if err != nil {
			return nil, err
		}
		b, err := fromValue[B](args[1], 1)
		if err != nil {
			return nil, err
		}
		next, err := h(state, a, b)
		if err != nil {
			return nil, err
		}
		return core.Ptr(next), nil
	}, core.Stimulus, file, line)
}
