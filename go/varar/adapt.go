package varar

import (
	"fmt"
	"reflect"

	"github.com/varar-dev/varar-go/core"
)

// Handler adaptation — how `s.Sensor(expr, handler)` accepts a handler whose
// parameters are plain Go values.
//
// The slot contract is the same in every port: a step's slots are its
// expression captures in order, then the trailing table/doc string if any. A
// sensor returns one value per slot (TypeScript spells the two-slot case as the
// tuple `[n, n * n]`; Go spells it as two return values), and a stimulus returns
// the whole next state.
//
//	s.Sensor("The square of {int} is {int}.",
//	    func(state varar.Value, n, square int) (int, int, error) { return n, n * n, nil })
//
//	s.Stimulus("I greet {string}",
//	    func(state varar.Value, name string) (varar.Value, error) { … })
//
// Go has no variadic generics, so this is done with reflection rather than a
// family of numbered constructors. The signature is validated **eagerly, at
// registration**, so a malformed handler panics when the suite wires up rather
// than when that step happens to run.
//
// The raw form is still accepted under the same name and passed through
// untouched — the escape hatch for slots with no plain Go spelling (a whole
// table, a custom parameter type that parses to a map) and for header-bound
// rows, which compare by column rather than positionally by slot:
//
//	s.Sensor("…", func(state varar.Value, args []varar.Value) (*varar.Value, error) { … })

var (
	valueType    = reflect.TypeOf(Value{})
	valueSlice   = reflect.TypeOf([]Value{})
	valuePointer = reflect.TypeOf(&Value{})
	errorType    = reflect.TypeOf((*error)(nil)).Elem()
)

// supportedSlotTypes are the Go types a step parameter (and a sensor's matching
// return) may take. Value is the escape hatch for anything else.
var supportedSlotTypes = []reflect.Type{
	reflect.TypeOf(int(0)),
	reflect.TypeOf(int64(0)),
	reflect.TypeOf(float64(0)),
	reflect.TypeOf(""),
	reflect.TypeOf(false),
	valueType,
}

func isSupportedSlotType(t reflect.Type) bool {
	for _, s := range supportedSlotTypes {
		if t == s {
			return true
		}
	}
	return false
}

func supportedNames() string {
	names := make([]string, len(supportedSlotTypes))
	for i, t := range supportedSlotTypes {
		names[i] = t.String()
	}
	return fmt.Sprintf("%v", names)
}

// isRawHandler reports whether fn is the pass-through form
// func(Value, []Value) (*Value, error).
func isRawHandler(t reflect.Type) bool {
	return t.NumIn() == 2 && t.In(0) == valueType && t.In(1) == valueSlice &&
		t.NumOut() == 2 && t.Out(0) == valuePointer && t.Out(1) == errorType
}

// adapt validates handler against kind and returns it as a core HandlerFunc.
// It panics on a malformed signature — an author wiring error, like a duplicate
// step expression, surfaced at registration.
func adapt(handler any, kind core.StepKind, expression string) HandlerFunc {
	if handler == nil {
		panic(fmt.Sprintf("var: %q: handler must not be nil", expression))
	}
	if h, ok := handler.(HandlerFunc); ok {
		return h
	}
	if h, ok := handler.(func(Value, []Value) (*Value, error)); ok {
		return h
	}

	fn := reflect.ValueOf(handler)
	t := fn.Type()
	if t.Kind() != reflect.Func {
		panic(fmt.Sprintf("var: %q: handler must be a func, got %s", expression, t))
	}
	if isRawHandler(t) {
		return func(state Value, args []Value) (*Value, error) {
			out := fn.Call([]reflect.Value{reflect.ValueOf(state), reflect.ValueOf(args)})
			return outValuePointer(out[0]), outError(out[1])
		}
	}
	if t.NumIn() < 1 || t.In(0) != valueType {
		panic(fmt.Sprintf("var: %q: handler's first parameter must be the state (varar.Value), got %s",
			expression, t))
	}

	slots := t.NumIn() - 1
	for i := 1; i < t.NumIn(); i++ {
		if !isSupportedSlotType(t.In(i)) {
			panic(fmt.Sprintf("var: %q: parameter %d is %s, which is not a supported slot type %s",
				expression, i, t.In(i), supportedNames()))
		}
	}
	if t.NumOut() == 0 || t.Out(t.NumOut()-1) != errorType {
		panic(fmt.Sprintf("var: %q: handler's last result must be error, got %s", expression, t))
	}

	if kind == core.Stimulus {
		// A stimulus returns the whole next state, whatever its arity.
		if t.NumOut() != 2 || t.Out(0) != valueType {
			panic(fmt.Sprintf(
				"var: %q: a stimulus must return (varar.Value, error) — the whole next state — got %s",
				expression, t))
		}
		return func(state Value, args []Value) (*Value, error) {
			in, err := coerceArgs(fn, t, slots, state, args, expression)
			if err != nil {
				return nil, err
			}
			out := fn.Call(in)
			if err := outError(out[1]); err != nil {
				return nil, err
			}
			next := out[0].Interface().(Value)
			return core.Ptr(next), nil
		}
	}

	// A sensor returns one value per slot, each the same type as that slot's
	// parameter — the core compares the two, so a different type could never be
	// equal.
	if t.NumOut() != slots+1 {
		panic(fmt.Sprintf(
			"var: %q: a sensor takes %d slot(s), so it must return %d value(s) plus error, got %s",
			expression, slots, slots, t))
	}
	for i := 0; i < slots; i++ {
		if t.Out(i) != t.In(i+1) {
			panic(fmt.Sprintf(
				"var: %q: sensor result %d is %s but slot %d is %s — a sensor returns each slot's own type",
				expression, i+1, t.Out(i), i+1, t.In(i+1)))
		}
	}
	return func(state Value, args []Value) (*Value, error) {
		in, err := coerceArgs(fn, t, slots, state, args, expression)
		if err != nil {
			return nil, err
		}
		out := fn.Call(in)
		if err := outError(out[slots]); err != nil {
			return nil, err
		}
		if slots == 0 {
			return nil, nil // nothing to compare
		}
		vs := make([]Value, slots)
		for i := 0; i < slots; i++ {
			vs[i] = fromGo(out[i])
		}
		if slots == 1 {
			return core.Ptr(vs[0]), nil // the return IS the single slot's value
		}
		return core.Ptr(ListOf(vs)), nil
	}
}

// coerceArgs builds the reflect call arguments, checking the slot count the
// expression actually produced against the handler's arity.
func coerceArgs(fn reflect.Value, t reflect.Type, slots int, state Value, args []Value, expression string) ([]reflect.Value, error) {
	if len(args) != slots {
		return nil, fmt.Errorf("var: %q has %d slot(s), but the handler takes %d",
			expression, len(args), slots)
	}
	in := make([]reflect.Value, slots+1)
	in[0] = reflect.ValueOf(state)
	for i, arg := range args {
		v, err := toGo(arg, t.In(i+1), i)
		if err != nil {
			return nil, err
		}
		in[i+1] = v
	}
	return in, nil
}

// toGo converts a captured Value to the handler's declared parameter type.
func toGo(v Value, t reflect.Type, slot int) (reflect.Value, error) {
	fail := func(want string) (reflect.Value, error) {
		return reflect.Value{}, fmt.Errorf("var: slot %d is a %s, cannot be read as %s",
			slot+1, v.TypeName(), want)
	}
	switch t {
	case valueType:
		return reflect.ValueOf(v), nil
	case reflect.TypeOf(int(0)):
		n, ok := v.AsInt()
		if !ok {
			return fail("int")
		}
		return reflect.ValueOf(int(n)), nil
	case reflect.TypeOf(int64(0)):
		n, ok := v.AsInt()
		if !ok {
			return fail("int64")
		}
		return reflect.ValueOf(n), nil
	case reflect.TypeOf(float64(0)):
		f, ok := v.AsFloat()
		if !ok {
			return fail("float64")
		}
		return reflect.ValueOf(f), nil
	case reflect.TypeOf(""):
		s, ok := v.AsString()
		if !ok {
			return fail("string")
		}
		return reflect.ValueOf(s), nil
	case reflect.TypeOf(false):
		b, ok := v.AsBool()
		if !ok {
			return fail("bool")
		}
		return reflect.ValueOf(b), nil
	}
	return reflect.Value{}, fmt.Errorf("var: unsupported slot type %s", t)
}

// fromGo converts a handler's returned value back to a Value for comparison.
func fromGo(rv reflect.Value) Value {
	switch v := rv.Interface().(type) {
	case Value:
		return v
	case int:
		return IntValue(int64(v))
	case int64:
		return IntValue(v)
	case float64:
		return FloatValue(v)
	case string:
		return StrValue(v)
	case bool:
		return BoolValue(v)
	}
	return NullValue
}

func outError(rv reflect.Value) error {
	if rv.IsNil() {
		return nil
	}
	return rv.Interface().(error)
}

func outValuePointer(rv reflect.Value) *Value {
	if rv.IsNil() {
		return nil
	}
	return rv.Interface().(*Value)
}
