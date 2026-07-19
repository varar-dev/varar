using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>
/// Projects pipeline output to the shared conformance wire shapes (serialized by
/// <see cref="CanonicalJson"/>). Port of the projections in <c>conformance.ts</c>. This file grows
/// one projection per artifact as the pipeline lands; T3 covers <c>var-doc.json</c>.
/// </summary>
public static class Conformance
{
    /// <summary>
    /// Projects a <see cref="Registry"/> to the <c>registry.json</c> shape: each step's expression
    /// plus its parameter-type names (in source order, from the compiled expression), and the
    /// custom parameter types as <c>{name, regexp}</c>. Port of <c>toRegistryArtifact</c>.
    /// </summary>
    public static Value ToRegistryArtifact(Registry registry) => Map(
        ("steps", Value.List(registry.Steps.Select(step => Map(
            ("expression", Value.Of(step.Expression)),
            ("parameterTypeNames", Value.List(step.Compiled.ParameterTypes.Select(p => Value.Of(p.Name)))))))),
        ("parameterTypes", Value.List(registry.CustomParameterTypes.Select(custom => Map(
            ("name", Value.Of(custom.Name)),
            ("regexp", Value.Of(custom.Regexp)))))));

    /// <summary>
    /// Projects an <see cref="ExecutionPlan"/> to the <c>plan.json</c> shape: per example the name,
    /// scope, span, expected outcome, and steps; each step's text/spans/expression, its args as the
    /// raw source slice of each param span plus its type name, and any attached table/doc string.
    /// Port of <c>toPlanArtifact</c>.
    /// </summary>
    public static Value ToPlanArtifact(ExecutionPlan plan) => Map(
        ("examples", Value.List(plan.Examples.Select(ex => PlannedExampleValue(ex, plan.VarDoc.Source)))),
        ("diagnostics", Value.List(plan.Diagnostics.Select(d => Map(
            ("code", Value.Of(d.Code.ToWire())),
            ("severity", Value.Of(d.Severity.ToWire())),
            ("span", SpanValue(d.Span)))))));

    private static Value PlannedExampleValue(PlannedExample ex, string source)
    {
        var entries = new List<KeyValuePair<string, Value>>
        {
            new("name", Value.Of(ex.Name)),
            new("scopeStack", Value.List(ex.ScopeStack.Select(Value.Of))),
            new("span", SpanValue(ex.Span)),
            new("expectedOutcome", Value.Of(ex.ExpectedFail ? "fail" : "pass")),
        };
        if (ex.ExpectedErrorMessage is not null)
        {
            entries.Add(new("expectedErrorMessage", Value.Of(ex.ExpectedErrorMessage)));
        }

        entries.Add(new("steps", Value.List(ex.Steps.Select(step => PlannedStepValue(step, source)))));
        return Value.Map(entries);
    }

    private static Value PlannedStepValue(PlannedStep step, string source)
    {
        var typeNames = step.StepDef.Compiled.ParameterTypes.Select(p => p.Name).ToArray();
        var entries = new List<KeyValuePair<string, Value>>
        {
            new("text", Value.Of(step.Text)),
            new("matchSpan", SpanValue(step.MatchSpan)),
            new("paramSpans", List(step.ParamSpans, SpanValue)),
            new("matchedExpression", Value.Of(step.StepDef.Expression)),
            new("args", Value.List(step.ParamSpans.Select((span, i) => Map(
                ("value", Value.Of(Scanner.Slice(source, span.StartOffset, span.EndOffset))),
                ("parameterType", i < typeNames.Length ? Value.Of(typeNames[i]) : Value.Null))))),
        };
        if (step.DataTable is not null)
        {
            entries.Add(new("dataTable", BlockValue(step.DataTable)));
        }

        if (step.DocString is not null)
        {
            entries.Add(new("docString", Map(
                ("content", Value.Of(step.DocString.Content)),
                ("contentType", Value.Of(step.DocString.ContentType)),
                ("span", SpanValue(step.DocString.Span)))));
        }

        return Value.Map(entries);
    }

    /// <summary>Projects a <see cref="VarDoc"/> to the <c>var-doc.json</c> shape (<c>source</c> is dropped).</summary>
    public static Value ToVarDocArtifact(VarDoc doc) => Map(
        ("path", Value.Of(doc.Path)),
        ("examples", List(doc.Examples, ExampleValue)),
        ("orphanAttachments", List(doc.OrphanAttachments, BlockValue)));

    private static Value ExampleValue(Example example) => Map(
        ("scopeStack", Value.List(example.ScopeStack.Select(Value.Of))),
        ("span", SpanValue(example.Span)),
        ("body", List(example.Body, BlockValue)));

    private static Value BlockValue(Block block) => block switch
    {
        Heading h => Map(
            ("kind", Value.Of(h.Kind)),
            ("level", Value.Of(h.Level)),
            ("text", Value.Of(h.Text)),
            ("span", SpanValue(h.Span))),
        Paragraph p => Map(
            ("kind", Value.Of(p.Kind)),
            ("text", Value.Of(p.Text)),
            ("span", SpanValue(p.Span)),
            ("segmentMap", List(p.SegmentMap, SegmentValue))),
        ListItem li => Map(
            ("kind", Value.Of(li.Kind)),
            ("ordered", Value.Of(li.Ordered)),
            ("text", Value.Of(li.Text)),
            ("span", SpanValue(li.Span)),
            ("segmentMap", List(li.SegmentMap, SegmentValue)),
            ("markerSpan", SpanValue(li.MarkerSpan))),
        Blockquote bq => Map(
            ("kind", Value.Of(bq.Kind)),
            ("text", Value.Of(bq.Text)),
            ("span", SpanValue(bq.Span)),
            ("segmentMap", List(bq.SegmentMap, SegmentValue))),
        Table t => Map(
            ("kind", Value.Of(t.Kind)),
            ("span", SpanValue(t.Span)),
            ("header", RowValue(t.Header)),
            ("rows", List(t.Rows, RowValue))),
        Fence f => Map(
            ("kind", Value.Of(f.Kind)),
            ("info", Value.Of(f.Info)),
            ("body", Value.Of(f.Body)),
            ("bodySpan", SpanValue(f.BodySpan)),
            ("span", SpanValue(f.Span))),
        ThematicBreak tb => Map(
            ("kind", Value.Of(tb.Kind)),
            ("span", SpanValue(tb.Span))),
        _ => throw new InvalidOperationException($"unknown block kind: {block.Kind}"),
    };

    private static Value RowValue(Row row) => Map(
        ("cells", Value.List(row.Cells.Select(Value.Of))),
        ("cellSpans", List(row.CellSpans, SpanValue)),
        ("span", SpanValue(row.Span)));

    private static Value SegmentValue(SegmentOffset segment) => Map(
        ("textOffset", Value.Of(segment.TextOffset)),
        ("sourceOffset", Value.Of(segment.SourceOffset)));

    private static Value SpanValue(Span span) => Map(
        ("startOffset", Value.Of(span.StartOffset)),
        ("endOffset", Value.Of(span.EndOffset)),
        ("startLine", Value.Of(span.StartLine)),
        ("startCol", Value.Of(span.StartCol)),
        ("endLine", Value.Of(span.EndLine)),
        ("endCol", Value.Of(span.EndCol)));

    private static Value List<T>(ImmutableArray<T> items, Func<T, Value> project) =>
        Value.List(items.Select(project));

    private static Value Map(params (string Key, Value Value)[] entries) =>
        Value.Map(entries.Select(e => new KeyValuePair<string, Value>(e.Key, e.Value)));
}
