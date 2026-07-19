using System.Collections.Immutable;
using System.Text.RegularExpressions;

namespace Varar.Core;

/// <summary>A doc string attached to a step (<c>content</c> includes the trailing newline).</summary>
public sealed record DocString(string Content, string ContentType, Span Span);

public sealed record PlannedStep(
    string Text,
    Span MatchSpan,
    ImmutableArray<Span> ParamSpans,
    StepRegistration StepDef,
    ImmutableArray<Value> Args,
    ImmutableArray<ParameterFormat?> Formats,
    Table? DataTable = null,
    DocString? DocString = null);

public sealed record HeaderBinding(
    Span MatchSpan,
    ImmutableArray<Span> ParamSpans,
    ImmutableArray<Span> HeaderCellSpans,
    StepRegistration StepDef);

public sealed record PlannedExample(
    string Name,
    ImmutableArray<string> ScopeStack,
    Span Span,
    ImmutableArray<PlannedStep> Steps,
    HeaderBinding? HeaderBinding = null,
    ImmutableArray<RowCheck> RowChecks = default,
    bool ExpectedFail = false,
    string? ExpectedErrorMessage = null);

public sealed record ExecutionPlan(
    VarDoc VarDoc,
    ImmutableArray<PlannedExample> Examples,
    ImmutableArray<Diagnostic> Diagnostics);

/// <summary>Matching + planning. Port of <c>plan.ts</c>.</summary>
public static class Plan
{
    public static ExecutionPlan Run(VarDoc varDoc, Registry registry)
    {
        var examples = ImmutableArray.CreateBuilder<PlannedExample>();
        var diagnostics = ImmutableArray.CreateBuilder<Diagnostic>();

        foreach (var ex in varDoc.Examples)
        {
            bool hadAmbiguous = false;

            // Pass 1: plan each text-bearing block, collecting steps per body index.
            var stepsByBlock = new Dictionary<int, List<PlannedStep>>();
            for (int idx = 0; idx < ex.Body.Length; idx++)
            {
                var block = ex.Body[idx];
                var blockText = BlockText(block);
                if (blockText is null)
                {
                    continue;
                }

                var result = PlanBlock(blockText, registry);
                foreach (var collision in result.Ambiguities)
                {
                    var span = LiftSpan(varDoc.Source, block, collision.MatchStart, collision.MatchEnd);
                    diagnostics.Add(Varar.Core.Diagnostics.AmbiguousMatch(
                        Scanner.Slice(blockText, collision.MatchStart, collision.MatchEnd),
                        span,
                        collision.Candidates
                            .Select(c => new Candidate(c.Expression, c.StepDef.ExpressionSourceFile, c.StepDef.ExpressionSourceLine))
                            .ToImmutableArray()));
                    hadAmbiguous = true;
                }

                if (!hadAmbiguous && result.Steps.Length > 0)
                {
                    stepsByBlock[idx] = result.Steps.Select(hit => new PlannedStep(
                        Scanner.Slice(blockText, hit.MatchStart, hit.MatchEnd),
                        LiftSpan(varDoc.Source, block, hit.MatchStart, hit.MatchEnd),
                        hit.ParamSpans.Select(p => LiftSpan(varDoc.Source, block, p.Start, p.End)).ToImmutableArray(),
                        hit.StepDef,
                        hit.Args,
                        hit.Formats)).ToList();
                }
            }

            // Header-bound table: a table whose every header cell is named in the paragraph above it
            // iterates row by row, each row its own example.
            var bound = !hadAmbiguous ? DetectHeaderBound(ex, stepsByBlock, varDoc.Source) : null;
            if (bound is not null)
            {
                var headerBinding = new HeaderBinding(
                    bound.Step.MatchSpan,
                    bound.HeaderSpans,
                    bound.Table.Header.CellSpans,
                    bound.Step.StepDef);

                foreach (var row in bound.Table.Rows)
                {
                    var rowObject = Value.Map(bound.Table.Header.Cells.Select((cell, i) =>
                        new KeyValuePair<string, Value>(cell, Value.Of(i < row.Cells.Length ? row.Cells[i] : string.Empty))));

                    var rowStep = bound.Step with
                    {
                        MatchSpan = row.Span,
                        Args = bound.Step.Args.Add(rowObject),
                    };

                    var rowChecks = bound.Table.Header.Cells.Select((column, i) => new RowCheck(
                        column,
                        i < row.Cells.Length ? row.Cells[i] : string.Empty,
                        i < row.CellSpans.Length ? row.CellSpans[i] : row.Span)).ToImmutableArray();

                    examples.Add(new PlannedExample(
                        string.Join(" / ", row.Cells),
                        ex.ScopeStack.Add(bound.Step.Text),
                        row.Span,
                        ImmutableArray.Create(rowStep),
                        headerBinding,
                        rowChecks));
                }

                continue;
            }

            // An `error` fence marks the example expected-to-fail (consumed here, never a doc string).
            var errorFence = ex.Body.OfType<Fence>().FirstOrDefault(f => f.Info == "error");

            // Pass 2: table/fence immediately after a step-bearing block.
            var attachments = new Dictionary<int, (Table? DataTable, DocString? DocString)>();
            for (int idx = 1; idx < ex.Body.Length; idx++)
            {
                var here = ex.Body[idx];
                if (here is Table table && stepsByBlock.ContainsKey(idx - 1))
                {
                    var prev = attachments.GetValueOrDefault(idx - 1);
                    attachments[idx - 1] = (table, prev.DocString);
                }
                else if (here is Fence fence && fence.Info != "error" && stepsByBlock.ContainsKey(idx - 1))
                {
                    var prev = attachments.GetValueOrDefault(idx - 1);
                    attachments[idx - 1] = (prev.DataTable, new DocString(fence.Body, fence.Info, fence.BodySpan));
                }
            }

            // Pass 3: rebuild the final step list, applying attachments to each block's last step.
            var finalSteps = ImmutableArray.CreateBuilder<PlannedStep>();
            for (int idx = 0; idx < ex.Body.Length; idx++)
            {
                if (!stepsByBlock.TryGetValue(idx, out var stepsAtIdx))
                {
                    continue;
                }

                for (int s = 0; s < stepsAtIdx.Count; s++)
                {
                    var step = stepsAtIdx[s];
                    if (s == stepsAtIdx.Count - 1 && attachments.TryGetValue(idx, out var attach))
                    {
                        finalSteps.Add(step with { DataTable = attach.DataTable, DocString = attach.DocString });
                    }
                    else
                    {
                        finalSteps.Add(step);
                    }
                }
            }

            var runnableSteps = hadAmbiguous ? ImmutableArray<PlannedStep>.Empty : finalSteps.ToImmutable();

            if (errorFence is not null && runnableSteps.Length == 0)
            {
                diagnostics.Add(Varar.Core.Diagnostics.ErrorFenceWithoutStep(errorFence.Span));
            }

            if (finalSteps.Count == 0 && !hadAmbiguous)
            {
                continue;
            }

            bool expectedFail = errorFence is not null;
            string? expectedErrorMessage = errorFence is not null && errorFence.Body.Trim().Length > 0
                ? errorFence.Body.Trim()
                : null;

            examples.Add(new PlannedExample(
                DeriveExampleName(ex.Body),
                ex.ScopeStack,
                ex.Span,
                runnableSteps,
                ExpectedFail: expectedFail,
                ExpectedErrorMessage: expectedErrorMessage));
        }

        return new ExecutionPlan(varDoc, examples.ToImmutable(), diagnostics.ToImmutable());
    }

    private sealed record BlockPlan(ImmutableArray<Hit> Steps, ImmutableArray<AmbiguityCollision> Ambiguities);

    private sealed record HeaderBound(Table Table, PlannedStep Step, ImmutableArray<Span> HeaderSpans);

    private static BlockPlan PlanBlock(string text, Registry registry)
    {
        var allSteps = ImmutableArray.CreateBuilder<Hit>();
        var allAmbiguities = ImmutableArray.CreateBuilder<AmbiguityCollision>();
        foreach (var sentence in Sentences.Split(text))
        {
            var hits = Matcher.FindHits(sentence.Text, registry);
            var adjusted = hits.Select(h => h with
            {
                MatchStart = h.MatchStart + sentence.StartOffset,
                MatchEnd = h.MatchEnd + sentence.StartOffset,
                ParamSpans = h.ParamSpans.Select(p => new ParamSpan(p.Start + sentence.StartOffset, p.End + sentence.StartOffset)).ToImmutableArray(),
            }).ToImmutableArray();

            switch (Matcher.ResolveHits(adjusted))
            {
                case ResolvedSteps.Ambiguous ambiguous:
                    allAmbiguities.AddRange(ambiguous.Collisions);
                    break;
                case ResolvedSteps.Ok ok when ok.Steps.Length > 0:
                    allSteps.AddRange(ok.Steps);
                    break;
            }
        }

        return new BlockPlan(allSteps.ToImmutable(), allAmbiguities.ToImmutable());
    }

    private static HeaderBound? DetectHeaderBound(Example ex, Dictionary<int, List<PlannedStep>> stepsByBlock, string source)
    {
        for (int idx = 1; idx < ex.Body.Length; idx++)
        {
            if (ex.Body[idx] is not Table table)
            {
                continue;
            }

            var above = ex.Body[idx - 1];
            var aboveText = BlockText(above);
            if (aboveText is null)
            {
                continue;
            }

            if (!stepsByBlock.TryGetValue(idx - 1, out var steps) || steps.Count == 0)
            {
                continue;
            }

            var offsets = table.Header.Cells.Select(cell => WordOffset(aboveText, cell)).ToArray();
            if (offsets.Any(o => o < 0))
            {
                continue;
            }

            var headerSpans = table.Header.Cells
                .Select((cell, i) => LiftSpan(source, above, offsets[i], offsets[i] + cell.Length))
                .ToImmutableArray();
            return new HeaderBound(table, steps[steps.Count - 1], headerSpans);
        }

        return null;
    }

    // Offset of `word` in `haystack` as a whole word (case-sensitive), or -1.
    private static int WordOffset(string haystack, string word)
    {
        var escaped = Regex.Replace(word, @"[.*+?^${}()|[\]\\]", "\\$&");
        var m = Regex.Match(haystack, $"(?<![\\p{{L}}\\p{{N}}_]){escaped}(?![\\p{{L}}\\p{{N}}_])");
        return m.Success ? m.Index : -1;
    }

    public static string DeriveExampleName(ImmutableArray<Block> body)
    {
        var primaryText = body.Select(BlockText).FirstOrDefault(t => t is not null);
        if (primaryText is null)
        {
            return string.Empty;
        }

        var collapsed = Regex.Replace(primaryText, @"\s+", " ").Trim();
        return Regex.Replace(collapsed, @"[.!?]$", string.Empty);
    }

    private static string? BlockText(Block block) => block switch
    {
        Paragraph p => p.Text,
        ListItem li => li.Text,
        Blockquote bq => bq.Text,
        _ => null,
    };

    private static Span LiftSpan(string source, Block block, int blockStart, int blockEnd)
    {
        ImmutableArray<SegmentOffset> segmentMap = block switch
        {
            Paragraph p => p.SegmentMap,
            ListItem li => li.SegmentMap,
            Blockquote bq => bq.SegmentMap,
            _ => default,
        };

        if (segmentMap.IsDefault)
        {
            return block.Span;
        }

        int start = LiftSegmentOffset(segmentMap, blockStart);
        int end = LiftSegmentOffset(segmentMap, blockEnd);
        return Span.FromOffsets(source, start, end);
    }

    private static int LiftSegmentOffset(ImmutableArray<SegmentOffset> segmentMap, int textOffset)
    {
        var best = segmentMap[0];
        foreach (var entry in segmentMap)
        {
            if (entry.TextOffset <= textOffset)
            {
                best = entry;
            }
        }

        return best.SourceOffset + (textOffset - best.TextOffset);
    }
}
