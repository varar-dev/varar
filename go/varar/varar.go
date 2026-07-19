// Package varar is the author facade over the core pipeline.
//
// Go uses the injected-builder author model (like Rust/Java/C#): a step file
// exposes a Register(*Steps) that adds its steps explicitly against a builder,
// rather than a module-scope accumulator. State evolution is full-replacement: a
// stimulus returns the whole next state. Source file/line are captured from the
// call site via runtime.Caller — the Go analogue of TS/Python reading them from
// the imported module — so authors never pass them.
package varar

import (
	"runtime"

	"github.com/varar-dev/varar-go/core"
)

// Re-exported core types and constructors, so authors import only this package.
type (
	Value       = core.Value
	HandlerFunc = core.HandlerFunc
	Registry    = core.Registry
	ParseFn     = core.ParseFn
	FormatFn    = core.FormatFn
	StepKind    = core.StepKind
)

// NullValue is the null value.
var NullValue = core.NullValue

// Value constructors.
var (
	BoolValue  = core.BoolValue
	IntValue   = core.IntValue
	FloatValue = core.FloatValue
	StrValue   = core.StrValue
	ListValue  = core.ListValue
	ListOf     = core.ListOf
	MapValue   = core.MapValue
)

// Ptr returns a pointer to v — how a handler returns its value, in the
// (*Value, error) shape: `return varar.Ptr(varar.IntValue(42)), nil`.
var Ptr = core.Ptr

// Step kinds.
const (
	StimulusKind = core.Stimulus
	SensorKind   = core.Sensor
)

// Steps is the ergonomic author API: a builder over core's registry, so step
// definitions read as s.Stimulus(expr, …) / s.Sensor(expr, …) — the call name
// IS the kind, matching every other port (and what the LSP/tree-sitter dialect
// extracts).
type Steps struct {
	registry core.Registry
}

// NewSteps is a builder over a fresh registry.
func NewSteps() *Steps {
	return &Steps{registry: core.CreateRegistry()}
}

// FromRegistry is a builder that continues folding into an existing registry.
func FromRegistry(registry core.Registry) *Steps {
	return &Steps{registry: registry}
}

func (s *Steps) add(expression string, handler HandlerFunc, kind core.StepKind) *Steps {
	_, file, line, _ := runtime.Caller(2)
	k := kind
	next, err := core.AddStep(s.registry, expression, file, line, core.NewHandler(handler), &k)
	if err != nil {
		panic(err)
	}
	s.registry = next
	return s
}

// Stimulus registers a stimulus (drives the software; returns the whole next
// state). The source file and line are captured from the call site.
func (s *Steps) Stimulus(expression string, handler HandlerFunc) *Steps {
	return s.add(expression, handler, core.Stimulus)
}

// Sensor registers a sensor (the read-only assertion; its return is compared).
// The source file and line are captured from the call site.
func (s *Steps) Sensor(expression string, handler HandlerFunc) *Steps {
	return s.add(expression, handler, core.Sensor)
}

// Param declares a custom parameter type. Pass a non-nil format to also render
// values for diffs, or nil for none — the single param shape every port shares.
func (s *Steps) Param(name, regexp string, parse ParseFn, format FormatFn) *Steps {
	if format != nil {
		s.registry = core.DefineParameterTypeWithFormat(s.registry, name, regexp, parse, format)
	} else {
		s.registry = core.DefineParameterType(s.registry, name, regexp, parse)
	}
	return s
}

// Registry yields the accumulated registry.
func (s *Steps) Registry() core.Registry {
	return s.registry
}
