package varar

import (
	"strings"
	"testing"

	"github.com/varar-dev/varar-go/core"
)

// The typed constructors' happy paths are proven by the conformance corpus
// (bundles 02/04/06/14 are authored in the typed form and reproduce their
// goldens byte-for-byte). Mismatched arity and unsupported parameter types are
// compile errors, so they cannot be tested here. What remains are the two
// runtime paths: a slot whose runtime kind does not match the declared type,
// and a slot count that only the expression knows.

func TestFromValueConvertsSupportedTypes(t *testing.T) {
	if got, err := fromValue[int](core.IntValue(7), 0); err != nil || got != 7 {
		t.Errorf("int: got %v, %v", got, err)
	}
	if got, err := fromValue[int64](core.IntValue(7), 0); err != nil || got != 7 {
		t.Errorf("int64: got %v, %v", got, err)
	}
	if got, err := fromValue[string](core.StrValue("hi"), 0); err != nil || got != "hi" {
		t.Errorf("string: got %v, %v", got, err)
	}
	if got, err := fromValue[float64](core.FloatValue(2.5), 0); err != nil || got != 2.5 {
		t.Errorf("float64: got %v, %v", got, err)
	}
	if got, err := fromValue[bool](core.BoolValue(true), 0); err != nil || !got {
		t.Errorf("bool: got %v, %v", got, err)
	}
	// Value is the escape hatch: it passes through whatever the slot holds.
	m := core.MapValue(map[string]core.Value{"a": core.IntValue(1)})
	if got, err := fromValue[Value](m, 0); err != nil || !core.ValueEqual(got, m) {
		t.Errorf("Value: got %v, %v", got, err)
	}
}

func TestFromValueRejectsAMismatchedSlot(t *testing.T) {
	_, err := fromValue[int](core.StrValue("not a number"), 1)
	if err == nil {
		t.Fatal("expected an error reading a String slot as int")
	}
	// The message names the 1-based slot and both types, so the failure points
	// at the step rather than at the conversion layer.
	for _, want := range []string{"slot 2", "String", "int"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("message %q missing %q", err.Error(), want)
		}
	}
}

func TestToValueRoundTrips(t *testing.T) {
	cases := []struct {
		got  Value
		want Value
	}{
		{toValue(7), core.IntValue(7)},
		{toValue(int64(7)), core.IntValue(7)},
		{toValue("hi"), core.StrValue("hi")},
		{toValue(2.5), core.FloatValue(2.5)},
		{toValue(true), core.BoolValue(true)},
	}
	for i, c := range cases {
		if !core.ValueEqual(c.got, c.want) {
			t.Errorf("case %d: got %v, want %v", i, c.got, c.want)
		}
	}
}

// A constructor's arity is compile-checked against the handler, but the number
// of slots is only known from the expression at match time, so a mismatch there
// must fail the step with a clear message rather than panicking on an index.
func TestArityMismatchFailsTheStep(t *testing.T) {
	s := NewSteps()
	// The expression has one slot, but the handler declares two.
	Sensor2(s, "I have {int} cukes", func(state Value, a, b int) (int, int, error) {
		return a, b, nil
	})
	plan := core.Plan(core.Parse("t.md", "I have 5 cukes."), s.Registry())
	failure := core.ExecutePlan(plan, core.ExecutePorts{})
	if failure == nil {
		t.Fatal("expected the step to fail on the slot-count mismatch")
	}
	msg := failure.Error.Message()
	if !strings.Contains(msg, "slot") || !strings.Contains(msg, "handler takes 2") {
		t.Errorf("message %q should name the slot count and the handler arity", msg)
	}
}

// A slot whose runtime kind does not match the declared type fails the step
// with the conversion message, rather than panicking.
func TestMismatchedSlotTypeFailsTheStep(t *testing.T) {
	s := NewSteps()
	// {word} captures a string, but the handler declares int.
	Sensor1(s, "the result is {word}", func(state Value, n int) (int, error) {
		return n, nil
	})
	plan := core.Plan(core.Parse("t.md", "the result is IV."), s.Registry())
	failure := core.ExecutePlan(plan, core.ExecutePorts{})
	if failure == nil {
		t.Fatal("expected the step to fail reading a String slot as int")
	}
	if msg := failure.Error.Message(); !strings.Contains(msg, "cannot be read as int") {
		t.Errorf("message %q should explain the slot type mismatch", msg)
	}
}
