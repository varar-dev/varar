package core

import "testing"

// {emph} is a built-in parameter type (Markdown emphasis). It compiles without
// any author-registered custom type and its parse strips the outermost
// delimiter pair, passing the inner text to the handler.
func TestEmphBuiltinMatchesAndStrips(t *testing.T) {
	compiled, err := compileExpression("I mention {emph}", nil, nil)
	if err != nil {
		t.Fatalf("compile {emph}: %v", err)
	}

	cases := []struct {
		text string
		want string
	}{
		{"I mention *Emma*", "Emma"},
		{"I mention **Emma**", "Emma"},
	}
	for _, c := range cases {
		args := compiled.matchWhole(c.text)
		if args == nil {
			t.Fatalf("%q did not match", c.text)
		}
		if len(args) != 1 {
			t.Fatalf("%q: expected 1 arg, got %d", c.text, len(args))
		}
		if args[0].parameterTypeName != "emph" {
			t.Errorf("%q: parameterTypeName = %q, want emph", c.text, args[0].parameterTypeName)
		}
		got, ok := args[0].value.AsString()
		if !ok {
			t.Fatalf("%q: value is not a string: %+v", c.text, args[0].value)
		}
		if got != c.want {
			t.Errorf("%q: value = %q, want %q", c.text, got, c.want)
		}
	}
}

// {emph} must not be registered as a custom parameter type: CreateRegistry
// seeds only its display format, keeping it out of the registry artifact's
// parameterTypes.
func TestEmphIsNotACustomParameterType(t *testing.T) {
	reg := CreateRegistry()
	if len(reg.CustomParameterTypes) != 0 {
		t.Errorf("CreateRegistry seeded CustomParameterTypes = %+v, want none", reg.CustomParameterTypes)
	}
	format, ok := reg.Formats["emph"]
	if !ok {
		t.Fatalf("CreateRegistry did not seed an emph format")
	}
	if got, _ := format(StrValue("Emma")); got != "*Emma*" {
		t.Errorf("emph format(Emma) = %q, want *Emma*", got)
	}
}
