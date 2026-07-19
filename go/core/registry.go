package core

import "fmt"

// Step registry — port of registry.ts / registry.rs. Persistent-value
// semantics: AddStep / DefineParameterType return a new Registry; the argument
// is unchanged.

// FormatFn is a parameter-type display formatter (the inverse of parse): it
// renders a value back in the document's notation. ok=false → fall through to
// the generic rendering chain.
type FormatFn func(v Value) (string, bool)

// CustomParameterType is a custom parameter type as registered by an author —
// name plus bare pattern source (the string the registry artifact serializes).
type CustomParameterType struct {
	Name   string
	Regexp string
}

// StepRegistration is one registered step: source expression, source location,
// handler, compiled expression, and role (Kind may be nil — the kindless path).
type StepRegistration struct {
	Expression           string
	ExpressionSourceFile string
	ExpressionSourceLine int
	Handler              Handler
	Kind                 *StepKind
	compiled             *compiledExpression
}

// Registry is the step registry.
type Registry struct {
	Steps                []*StepRegistration
	CustomParameterTypes []CustomParameterType
	customParse          map[string]ParseFn
	Formats              map[string]FormatFn
}

// CreateRegistry returns an empty registry.
func CreateRegistry() Registry {
	return Registry{
		Steps:                nil,
		CustomParameterTypes: nil,
		customParse:          map[string]ParseFn{},
		Formats:              map[string]FormatFn{},
	}
}

func (r Registry) cloneCustomParse() map[string]ParseFn {
	m := make(map[string]ParseFn, len(r.customParse))
	for k, v := range r.customParse {
		m[k] = v
	}
	return m
}

func (r Registry) cloneFormats() map[string]FormatFn {
	m := make(map[string]FormatFn, len(r.Formats))
	for k, v := range r.Formats {
		m[k] = v
	}
	return m
}

// AddStep compiles expression against registry's parameter types and appends it,
// returning a new Registry. Errors on a duplicate expression or an
// un-compilable one.
func AddStep(registry Registry, expression, sourceFile string, sourceLine int, handler Handler, kind *StepKind) (Registry, error) {
	for _, existing := range registry.Steps {
		if existing.Expression == expression {
			return registry, &RegistryError{
				Kind: ErrDuplicateStep,
				Message: fmt.Sprintf(
					"duplicate step definition for %q at %s:%d and %s:%d",
					expression,
					existing.ExpressionSourceFile, existing.ExpressionSourceLine,
					sourceFile, sourceLine,
				),
			}
		}
	}
	compiled, err := compileExpression(expression, registry.CustomParameterTypes, registry.customParse)
	if err != nil {
		return registry, err
	}
	steps := make([]*StepRegistration, len(registry.Steps), len(registry.Steps)+1)
	copy(steps, registry.Steps)
	steps = append(steps, &StepRegistration{
		Expression:           expression,
		ExpressionSourceFile: sourceFile,
		ExpressionSourceLine: sourceLine,
		Handler:              handler,
		Kind:                 kind,
		compiled:             compiled,
	})
	return Registry{
		Steps:                steps,
		CustomParameterTypes: registry.CustomParameterTypes,
		customParse:          registry.customParse,
		Formats:              registry.Formats,
	}, nil
}

// DefineParameterType registers a custom parameter type and returns a new
// Registry recording it.
func DefineParameterType(registry Registry, name, regexp string, parse ParseFn) Registry {
	customTypes := make([]CustomParameterType, len(registry.CustomParameterTypes), len(registry.CustomParameterTypes)+1)
	copy(customTypes, registry.CustomParameterTypes)
	customTypes = append(customTypes, CustomParameterType{Name: name, Regexp: regexp})

	parseMap := registry.cloneCustomParse()
	parseMap[name] = parse

	return Registry{
		Steps:                registry.Steps,
		CustomParameterTypes: customTypes,
		customParse:          parseMap,
		Formats:              registry.Formats,
	}
}

// DefineParameterTypeWithFormat is DefineParameterType additionally retaining a
// display format.
func DefineParameterTypeWithFormat(registry Registry, name, regexp string, parse ParseFn, format FormatFn) Registry {
	next := DefineParameterType(registry, name, regexp, parse)
	formats := next.cloneFormats()
	formats[name] = format
	next.Formats = formats
	return next
}
