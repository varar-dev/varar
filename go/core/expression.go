package core

import (
	"regexp"
	"strconv"
	"strings"

	ce "github.com/cucumber/cucumber-expressions-go"
)

// Cucumber-expression matching — the owned layer over the official
// cucumber-expressions-go library. We use the library to compile expressions,
// generate the anchored regexp, and extract the per-parameter capture group
// tree (values + byte offsets); we own the small, corpus-pinned rest: applying
// our own value transforms, argument extraction, and parameterTypeNames.
//
// Rationale (recorded in ADR 0010): the official Go library is stale at
// v6.2.0 rather than the 20.0.0 line every other port pins, but its built-in
// {int}/{word}/{string} regexps are byte-identical to the reference's, so it
// reproduces the goldens once we apply the reference's own transforms (a bare
// `Group.Value()` for the built-ins, the inner capture groups for a custom
// type). Only {int}, {word}, {string} and author-defined custom types are
// exercised by the corpus.

// ParseFn is a parameter-type transform. It receives the type's regexp capture
// groups in order (a group that did not participate arrives as ""); a regexp
// with no groups of its own receives the whole matched text as the single
// element. Mirrors the reference CaptureGroupTransformer.
type ParseFn func(groups []string) Value

// argument is one captured argument of a whole-string match.
type argument struct {
	value             Value
	parameterTypeName string
	// groupStart/groupEnd are the captured group's byte offsets within the
	// matched text; hasGroup is false when the group did not participate.
	hasGroup   bool
	groupStart int
	groupEnd   int
}

type transformKind int

const (
	tInt transformKind = iota
	tWord
	tQuotedString
	tCustom
)

// builtinKind returns the transform kind of a built-in parameter type, or
// (tCustom, false) if name is not a built-in.
func builtinKind(name string) (transformKind, bool) {
	switch name {
	case "int":
		return tInt, true
	case "word":
		return tWord, true
	case "string":
		return tQuotedString, true
	}
	return tCustom, false
}

// paramRef is a compiled expression's reference to one parameter's transform.
type paramRef struct {
	typeName string
	kind     transformKind
	custom   ParseFn
}

// compiledExpression is a compiled cucumber expression.
type compiledExpression struct {
	source       string
	regexpSource string // anchored ^...$
	libExpr      *ce.CucumberExpression
	params       []paramRef
}

// compileExpression compiles source against the registry's custom parameter
// types. Errors on an undefined parameter type or an un-compilable pattern.
func compileExpression(source string, customTypes []CustomParameterType, customParse map[string]ParseFn) (*compiledExpression, error) {
	libReg := ce.NewParameterTypeRegistry()
	for _, ct := range customTypes {
		re, err := regexp.Compile(ct.Regexp)
		if err != nil {
			return nil, &RegistryError{Kind: ErrExpression, Message: "failed to compile parameter type regexp: " + err.Error()}
		}
		pt, err := ce.NewParameterType(ct.Name, []*regexp.Regexp{re}, "", func(...*string) interface{} { return nil }, false, false)
		if err != nil {
			return nil, &RegistryError{Kind: ErrExpression, Message: err.Error()}
		}
		libReg.DefineParameterType(pt)
	}
	libExpr, err := ce.NewCucumberExpression(source, libReg)
	if err != nil {
		return nil, &RegistryError{Kind: ErrExpression, Message: err.Error()}
	}

	names := ParameterTypeNames(source)
	params := make([]paramRef, len(names))
	for i, name := range names {
		if kind, ok := builtinKind(name); ok {
			params[i] = paramRef{typeName: name, kind: kind}
		} else {
			params[i] = paramRef{typeName: name, kind: tCustom, custom: customParse[name]}
		}
	}

	return &compiledExpression{
		source:       source,
		regexpSource: libExpr.Regexp().String(),
		libExpr:      libExpr,
		params:       params,
	}, nil
}

// matchWhole matches the entire text, returning the typed arguments. nil when
// text is not a whole match.
func (c *compiledExpression) matchWhole(text string) []argument {
	args, err := c.libExpr.Match(text)
	if err != nil || args == nil {
		return nil
	}
	out := make([]argument, len(args))
	for i, a := range args {
		p := c.params[i]
		g := a.Group()
		if g == nil || g.Value() == nil {
			out[i] = argument{value: NullValue, parameterTypeName: p.typeName, hasGroup: false}
			continue
		}
		var val Value
		switch p.kind {
		case tInt:
			val = parseIntValue(*g.Value())
		case tWord:
			val = StrValue(*g.Value())
		case tQuotedString:
			val = StrValue(dequote(*g.Value()))
		case tCustom:
			groups := groupValues(g)
			if p.custom != nil {
				val = p.custom(groups)
			} else {
				val = NullValue
			}
		}
		out[i] = argument{
			value:             val,
			parameterTypeName: p.typeName,
			hasGroup:          true,
			groupStart:        g.Start(),
			groupEnd:          g.End(),
		}
	}
	return out
}

// groupValues returns a group's capture values (its children, or the whole
// match as a single element when there are no child groups), with a
// non-participating group rendered as "".
func groupValues(g *ce.Group) []string {
	vals := g.Values()
	out := make([]string, len(vals))
	for i, v := range vals {
		if v == nil {
			out[i] = ""
		} else {
			out[i] = *v
		}
	}
	return out
}

func parseIntValue(text string) Value {
	n, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return NullValue
	}
	return IntValue(n)
}

// dequote strips a {string} token's surrounding quotes and unescapes \X → X.
func dequote(s string) string {
	chars := []rune(s)
	if len(chars) < 2 {
		return s
	}
	inner := chars[1 : len(chars)-1]
	var out strings.Builder
	i := 0
	for i < len(inner) {
		if inner[i] == '\\' && i+1 < len(inner) {
			out.WriteRune(inner[i+1])
			i += 2
		} else {
			out.WriteRune(inner[i])
			i++
		}
	}
	return out.String()
}

// ParameterTypeNames returns the parameter-type names in source order, reading
// the `{name}` tokens directly from source (escaped braces `\{...\}` are
// literal text, not parameters).
func ParameterTypeNames(source string) []string {
	var names []string
	runes := []rune(source)
	i := 0
	for i < len(runes) {
		c := runes[i]
		if c == '\\' {
			i += 2 // skip the escaped char
			continue
		}
		if c == '{' {
			j := i + 1
			var name strings.Builder
			for j < len(runes) && runes[j] != '}' {
				if runes[j] == '\\' && j+1 < len(runes) {
					name.WriteRune(runes[j+1])
					j += 2
					continue
				}
				name.WriteRune(runes[j])
				j++
			}
			if j < len(runes) { // found closing brace
				names = append(names, name.String())
				i = j + 1
				continue
			}
		}
		i++
	}
	return names
}

// stripAnchors strips a compiled expression's ^...$ anchors so an unanchored
// scan can find it anywhere in a sentence.
func stripAnchors(source string) string {
	s := strings.TrimPrefix(source, "^")
	s = strings.TrimSuffix(s, "$")
	return s
}
