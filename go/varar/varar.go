// Package varar is the author facade over the varcore pipeline.
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

	vc "github.com/varar-dev/varar-go/core"
)

// Re-exported core types and constructors, so authors import only this package.
type (
	Value         = vc.Value
	HandlerReturn = vc.HandlerReturn
	HandlerFunc   = vc.HandlerFunc
	Registry      = vc.Registry
	ParseFn       = vc.ParseFn
	FormatFn      = vc.FormatFn
	StepKind      = vc.StepKind
)

// NullValue is the null value.
var NullValue = vc.NullValue

// Value constructors.
var (
	BoolValue  = vc.BoolValue
	IntValue   = vc.IntValue
	FloatValue = vc.FloatValue
	StrValue   = vc.StrValue
	ListValue  = vc.ListValue
	ListOf     = vc.ListOf
	MapValue   = vc.MapValue
)

// Handler-return constructors.
var (
	Returns  = vc.Returns
	NoReturn = vc.NoReturn
	Fails    = vc.Fails
)

// Step kinds.
const (
	StimulusKind = vc.Stimulus
	SensorKind   = vc.Sensor
)

// Steps is the ergonomic author API: a builder over varcore's registry, so step
// definitions read as s.Stimulus(expr, …) / s.Sensor(expr, …) — the call name
// IS the kind, matching every other port (and what the LSP/tree-sitter dialect
// extracts).
type Steps struct {
	registry vc.Registry
}

// NewSteps is a builder over a fresh registry.
func NewSteps() *Steps {
	return &Steps{registry: vc.CreateRegistry()}
}

// FromRegistry is a builder that continues folding into an existing registry.
func FromRegistry(registry vc.Registry) *Steps {
	return &Steps{registry: registry}
}

func (s *Steps) add(expression string, handler HandlerFunc, kind vc.StepKind) *Steps {
	_, file, line, _ := runtime.Caller(2)
	k := kind
	next, err := vc.AddStep(s.registry, expression, file, line, vc.NewHandler(handler), &k)
	if err != nil {
		panic(err)
	}
	s.registry = next
	return s
}

// Stimulus registers a stimulus (drives the software; returns the whole next
// state). The source file and line are captured from the call site.
func (s *Steps) Stimulus(expression string, handler HandlerFunc) *Steps {
	return s.add(expression, handler, vc.Stimulus)
}

// Sensor registers a sensor (the read-only assertion; its return is compared).
// The source file and line are captured from the call site.
func (s *Steps) Sensor(expression string, handler HandlerFunc) *Steps {
	return s.add(expression, handler, vc.Sensor)
}

// Param declares a custom parameter type. Pass a non-nil format to also render
// values for diffs, or nil for none — the single param shape every port shares.
func (s *Steps) Param(name, regexp string, parse ParseFn, format FormatFn) *Steps {
	if format != nil {
		s.registry = vc.DefineParameterTypeWithFormat(s.registry, name, regexp, parse, format)
	} else {
		s.registry = vc.DefineParameterType(s.registry, name, regexp, parse)
	}
	return s
}

// Registry yields the accumulated registry.
func (s *Steps) Registry() vc.Registry {
	return s.registry
}
