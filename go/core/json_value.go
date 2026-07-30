package core

import (
	"bytes"
	"encoding/json"
	"strings"
)

// ParseJSONValue reads JSON into the dynamic Value model — the counterpart of
// the conformance projections, so a test can compare an artifact against a
// golden by CONTENT (ValueEqual) instead of by bytes.
//
// Integral numbers become Int, not Float: the goldens are written by
// JSON.stringify, which prints an integral number without a decimal point, and
// ValueEqual deliberately treats Int(2) and Float(2.0) as different.
func ParseJSONValue(text string) (Value, error) {
	decoder := json.NewDecoder(bytes.NewReader([]byte(text)))
	decoder.UseNumber()
	var raw any
	if err := decoder.Decode(&raw); err != nil {
		return NullValue, err
	}
	return fromAny(raw), nil
}

func fromAny(raw any) Value {
	switch v := raw.(type) {
	case nil:
		return NullValue
	case bool:
		return BoolValue(v)
	case string:
		return StrValue(v)
	case json.Number:
		if !strings.ContainsAny(v.String(), ".eE") {
			if i, err := v.Int64(); err == nil {
				return IntValue(i)
			}
		}
		f, _ := v.Float64()
		return FloatValue(f)
	case []any:
		list := make([]Value, 0, len(v))
		for _, element := range v {
			list = append(list, fromAny(element))
		}
		return ListOf(list)
	case map[string]any:
		fields := make(map[string]Value, len(v))
		for key, element := range v {
			fields[key] = fromAny(element)
		}
		return MapValue(fields)
	}
	return NullValue
}
