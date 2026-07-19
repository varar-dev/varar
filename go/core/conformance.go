package varcore

// Projects pipeline output into the plain Value wire artifacts the conformance
// goldens pin — port of conformance.ts / conformance.rs. This file holds the
// var-doc projection; registry/plan/trace projections are added in later stages.

func obj(pairs ...[2]any) Value {
	m := make(map[string]Value, len(pairs))
	for _, p := range pairs {
		m[p[0].(string)] = p[1].(Value)
	}
	return Value{Kind: KindMap, Map: m}
}

func kv(k string, v Value) [2]any { return [2]any{k, v} }

func vint(n int) Value { return IntValue(int64(n)) }

// ToVarDocArtifact projects a parsed VarDoc to the var-doc wire artifact.
func ToVarDocArtifact(doc VarDoc) Value {
	examples := make([]Value, len(doc.Examples))
	for i := range doc.Examples {
		examples[i] = exampleValue(doc.Examples[i])
	}
	orphans := make([]Value, len(doc.OrphanAttachments))
	for i, o := range doc.OrphanAttachments {
		orphans[i] = tableOrFenceValue(o)
	}
	return obj(
		kv("path", StrValue(doc.Path)),
		kv("examples", ListOf(examples)),
		kv("orphanAttachments", ListOf(orphans)),
	)
}

func spanValue(s Span) Value {
	return obj(
		kv("startOffset", vint(s.StartOffset)),
		kv("endOffset", vint(s.EndOffset)),
		kv("startLine", vint(s.StartLine)),
		kv("startCol", vint(s.StartCol)),
		kv("endLine", vint(s.EndLine)),
		kv("endCol", vint(s.EndCol)),
	)
}

func segmentOffsetValue(o SegmentOffset) Value {
	return obj(
		kv("textOffset", vint(o.TextOffset)),
		kv("sourceOffset", vint(o.SourceOffset)),
	)
}

func segmentMapValue(m []SegmentOffset) Value {
	out := make([]Value, len(m))
	for i, o := range m {
		out[i] = segmentOffsetValue(o)
	}
	return ListOf(out)
}

func rowValue(r Row) Value {
	cells := make([]Value, len(r.Cells))
	for i, c := range r.Cells {
		cells[i] = StrValue(c)
	}
	spans := make([]Value, len(r.CellSpans))
	for i, s := range r.CellSpans {
		spans[i] = spanValue(s)
	}
	return obj(
		kv("cells", ListOf(cells)),
		kv("cellSpans", ListOf(spans)),
		kv("span", spanValue(r.Span)),
	)
}

func tableValue(t Table) Value {
	rows := make([]Value, len(t.Rows))
	for i := range t.Rows {
		rows[i] = rowValue(t.Rows[i])
	}
	return obj(
		kv("kind", StrValue("table")),
		kv("span", spanValue(t.Span)),
		kv("header", rowValue(t.Header)),
		kv("rows", ListOf(rows)),
	)
}

func fenceValue(f Fence) Value {
	return obj(
		kv("kind", StrValue("fence")),
		kv("span", spanValue(f.Span)),
		kv("info", StrValue(f.Info)),
		kv("body", StrValue(f.Body)),
		kv("bodySpan", spanValue(f.BodySpan)),
	)
}

func headingValue(h Heading) Value {
	return obj(
		kv("kind", StrValue("heading")),
		kv("level", vint(h.Level)),
		kv("text", StrValue(h.Text)),
		kv("span", spanValue(h.Span)),
	)
}

func paragraphValue(p Paragraph) Value {
	return obj(
		kv("kind", StrValue("paragraph")),
		kv("text", StrValue(p.Text)),
		kv("span", spanValue(p.Span)),
		kv("segmentMap", segmentMapValue(p.SegmentMap)),
	)
}

func listItemValue(l ListItem) Value {
	return obj(
		kv("kind", StrValue("list_item")),
		kv("text", StrValue(l.Text)),
		kv("span", spanValue(l.Span)),
		kv("segmentMap", segmentMapValue(l.SegmentMap)),
		kv("ordered", BoolValue(l.Ordered)),
		kv("markerSpan", spanValue(l.MarkerSpan)),
	)
}

func blockquoteValue(b Blockquote) Value {
	return obj(
		kv("kind", StrValue("blockquote")),
		kv("text", StrValue(b.Text)),
		kv("span", spanValue(b.Span)),
		kv("segmentMap", segmentMapValue(b.SegmentMap)),
	)
}

func thematicBreakValue(t ThematicBreak) Value {
	return obj(
		kv("kind", StrValue("thematic_break")),
		kv("span", spanValue(t.Span)),
	)
}

func blockValue(b Block) Value {
	switch v := b.(type) {
	case Heading:
		return headingValue(v)
	case Paragraph:
		return paragraphValue(v)
	case ListItem:
		return listItemValue(v)
	case Blockquote:
		return blockquoteValue(v)
	case Table:
		return tableValue(v)
	case Fence:
		return fenceValue(v)
	case ThematicBreak:
		return thematicBreakValue(v)
	}
	panic("unknown block type")
}

func tableOrFenceValue(b Block) Value {
	switch v := b.(type) {
	case Table:
		return tableValue(v)
	case Fence:
		return fenceValue(v)
	}
	panic("orphan attachment must be table or fence")
}

// ToRegistryArtifact projects a Registry to the registry wire artifact.
func ToRegistryArtifact(registry Registry) Value {
	steps := make([]Value, len(registry.Steps))
	for i, s := range registry.Steps {
		names := ParameterTypeNames(s.Expression)
		nameVals := make([]Value, len(names))
		for j, n := range names {
			nameVals[j] = StrValue(n)
		}
		steps[i] = obj(
			kv("expression", StrValue(s.Expression)),
			kv("parameterTypeNames", ListOf(nameVals)),
		)
	}
	pts := make([]Value, len(registry.CustomParameterTypes))
	for i, p := range registry.CustomParameterTypes {
		pts[i] = obj(
			kv("name", StrValue(p.Name)),
			kv("regexp", StrValue(p.Regexp)),
		)
	}
	return obj(
		kv("steps", ListOf(steps)),
		kv("parameterTypes", ListOf(pts)),
	)
}

// ToPlanArtifact projects an ExecutionPlan to the plan wire artifact.
func ToPlanArtifact(plan ExecutionPlan) Value {
	source := plan.VarDoc.Source
	examples := make([]Value, len(plan.Examples))
	for i := range plan.Examples {
		examples[i] = plannedExampleValue(source, plan.Examples[i])
	}
	diags := make([]Value, len(plan.Diagnostics))
	for i, d := range plan.Diagnostics {
		diags[i] = diagnosticValue(d)
	}
	return obj(
		kv("examples", ListOf(examples)),
		kv("diagnostics", ListOf(diags)),
	)
}

func plannedExampleValue(source string, ex PlannedExample) Value {
	scope := make([]Value, len(ex.ScopeStack))
	for i, s := range ex.ScopeStack {
		scope[i] = StrValue(s)
	}
	outcome := "pass"
	if ex.ExpectedOutcome != nil {
		outcome = *ex.ExpectedOutcome
	}
	m := map[string]Value{
		"name":            StrValue(ex.Name),
		"scopeStack":      ListOf(scope),
		"span":            spanValue(ex.Span),
		"expectedOutcome": StrValue(outcome),
	}
	if ex.ExpectedErrorMessage != nil {
		m["expectedErrorMessage"] = StrValue(*ex.ExpectedErrorMessage)
	}
	steps := make([]Value, len(ex.Steps))
	for i := range ex.Steps {
		steps[i] = plannedStepValue(source, ex.Steps[i])
	}
	m["steps"] = ListOf(steps)
	return Value{Kind: KindMap, Map: m}
}

func plannedStepValue(source string, step PlannedStep) Value {
	paramNames := ParameterTypeNames(step.StepDef.Expression)
	args := make([]Value, len(step.ParamSpans))
	for i, ps := range step.ParamSpans {
		var paramType Value
		if i < len(paramNames) {
			paramType = StrValue(paramNames[i])
		} else {
			paramType = NullValue
		}
		args[i] = obj(
			kv("value", StrValue(utf16Slice(source, ps.StartOffset, ps.EndOffset))),
			kv("parameterType", paramType),
		)
	}
	spans := make([]Value, len(step.ParamSpans))
	for i, s := range step.ParamSpans {
		spans[i] = spanValue(s)
	}
	m := map[string]Value{
		"text":              StrValue(step.Text),
		"matchSpan":         spanValue(step.MatchSpan),
		"paramSpans":        ListOf(spans),
		"matchedExpression": StrValue(step.StepDef.Expression),
		"args":              ListOf(args),
	}
	if step.DataTable != nil {
		m["dataTable"] = tableValue(*step.DataTable)
	}
	if step.DocString != nil {
		m["docString"] = docStringValue(*step.DocString)
	}
	return Value{Kind: KindMap, Map: m}
}

func docStringValue(f Fence) Value {
	return obj(
		kv("content", StrValue(f.Body)),
		kv("contentType", StrValue(f.Info)),
		kv("span", spanValue(f.BodySpan)),
	)
}

func diagnosticValue(d Diagnostic) Value {
	return obj(
		kv("code", StrValue(diagnosticCodeString(d.Code))),
		kv("severity", StrValue(severityString(d.Severity))),
		kv("span", spanValue(d.Span)),
	)
}

func diagnosticCodeString(code DiagnosticCode) string {
	switch code {
	case CodeAmbiguousMatch:
		return "ambiguous-match"
	case CodeErrorFenceWithoutStep:
		return "error-fence-without-step"
	case CodeDrift:
		return "drift"
	}
	return ""
}

func severityString(s Severity) string {
	switch s {
	case SeverityError:
		return "error"
	case SeverityWarning:
		return "warning"
	case SeverityInfo:
		return "info"
	}
	return ""
}

func exampleValue(e Example) Value {
	scope := make([]Value, len(e.ScopeStack))
	for i, s := range e.ScopeStack {
		scope[i] = StrValue(s)
	}
	body := make([]Value, len(e.Body))
	for i, blk := range e.Body {
		body[i] = blockValue(blk)
	}
	return obj(
		kv("scopeStack", ListOf(scope)),
		kv("span", spanValue(e.Span)),
		kv("body", ListOf(body)),
	)
}
