using System.Collections.Immutable;
using System.Text.RegularExpressions;

namespace Varar.Core;

/// <summary>A doc string attached to a step (<c>content</c> includes the trailing newline).</summary>
public sealed record DocString(string Content, string ContentType, Span Span);

/// <param name="ParamTexts">
/// The notation each parameter matched, sliced at plan time from the document the step was WRITTEN
/// in. Consumers must use this rather than slicing the running oath's source: a step a reference
/// block spliced in (ADR 0016) has spans in a different document.
/// </param>
/// <param name="DocPath">
/// Set only on such a spliced step: the document its spans belong to. Null means the example's own.
/// </param>
public sealed record PlannedStep(
    string Text,
    Span MatchSpan,
    ImmutableArray<Span> ParamSpans,
    StepRegistration StepDef,
    ImmutableArray<Value> Args,
    ImmutableArray<ParameterFormat?> Formats,
    Table? DataTable = null,
    DocString? DocString = null,
    ImmutableArray<string> ParamTexts = default,
    string? DocPath = null);

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
    Doc Doc,
    ImmutableArray<PlannedExample> Examples,
    ImmutableArray<Diagnostic> Diagnostics);

/// <summary>Matching + planning. Port of <c>plan.ts</c>.</summary>
public static class Plan
{
    public static ExecutionPlan Run(Doc doc, Registry registry, OathWorkspace workspace)
    {
        var diagnostics = ImmutableArray.CreateBuilder<Diagnostic>();

        // A section another oath references stops being a standalone example: it runs where it is
        // referenced, not here (ADR 0016).
        bool Consumed(Example ex) =>
            workspace.Referenced.Contains(Reference_.SectionKey(doc.Path, string.Empty))
            || ex.ScopeStack.Any(h => workspace.Referenced.Contains(Reference_.SectionKey(doc.Path, Reference_.Slugify(h))));

        // Phase 1: plan each candidate paragraph independently into a "unit".
        var units = doc.Examples
            .Where(ex => !Consumed(ex))
            .Select(ex => PlanCandidate(ex, doc, registry, diagnostics))
            .ToList();

        // Phase 2: group adjacent candidates into examples. A matching candidate continues the open
        // example when no delimiter (heading / `---`) precedes it; otherwise it starts a new one. A
        // non-matching candidate (prose) is a delimiter: it closes the open example and is dropped.
        // A header-bound table candidate is standalone — it already emits one example per row. See
        // ADR 0012.
        var examples = ImmutableArray.CreateBuilder<PlannedExample>();
        MergedExample? open = null;

        void Flush()
        {
            if (open is not null)
            {
                examples.Add(FinishMerged(open, doc.Source));
            }

            open = null;
        }

        foreach (var unit in units)
        {
            switch (unit)
            {
                case HeaderBoundUnit hb:
                    Flush();
                    examples.AddRange(hb.Rows);
                    break;

                case ReferenceUnit ru:
                    {
                        // Splice the referenced section's steps in at this position. Only the reference
                        // block itself is subject to the delimiter rule; everything it splices in
                        // belongs to the same sequence, so a section of several paragraphs stays one
                        // example.
                        var resolved = ResolveReference(ru, doc, registry, workspace, diagnostics, []);
                        for (int i = 0; i < resolved.Count; i++)
                        {
                            if (open is not null && (i > 0 || !ru.PrecededByDelimiter))
                            {
                                MergeInto(open, resolved[i], fromReference: true);
                            }
                            else
                            {
                                Flush();
                                open = StartMerged(resolved[i]);

                                // An example that OPENS with a reference is named by its own first
                                // matching paragraph, not by the section it pulls in.
                                open.NameFromReference = true;
                            }
                        }

                        break;
                    }

                case StepsUnit { Matched: false }:
                    // Prose paragraph — a delimiter. Drop it and end the open example.
                    Flush();
                    break;

                case StepsUnit su when open is not null && !su.PrecededByDelimiter:
                    MergeInto(open, su, fromReference: false);
                    break;

                case StepsUnit su:
                    Flush();
                    open = StartMerged(su);
                    break;
            }
        }

        Flush();

        // A table or fence that doesn't attach to a step is just Markdown content, not a mistake —
        // it produces no diagnostic.
        return new ExecutionPlan(doc, examples.ToImmutable(), diagnostics.ToImmutable());
    }

    // A step-bearing candidate accumulating into one example while adjacent matching candidates
    // keep merging in.
    private sealed class MergedExample
    {
        public required string Name { get; set; }

        public required ImmutableArray<string> ScopeStack { get; set; }

        public required int StartOffset { get; init; }

        public required int EndOffset { get; set; }

        public required List<PlannedStep> Steps { get; init; }

        public bool ExpectedFail { get; set; }

        public string? ExpectedErrorMessage { get; set; }

        /// <summary>
        /// True while the name came from a spliced (referenced) paragraph and is waiting to be
        /// replaced by the example's own first matching paragraph.
        /// </summary>
        public bool NameFromReference { get; set; }
    }

    // One candidate paragraph, planned in isolation.
    private abstract record CandidateUnit;

    private sealed record HeaderBoundUnit(ImmutableArray<PlannedExample> Rows) : CandidateUnit;

    // A reference block: its whole text is a link to an oath section, whose steps are spliced in
    // here (ADR 0016). Never prose, so it does not close the open example.
    private sealed record ReferenceUnit(
        Reference Reference,
        bool PrecededByDelimiter,
        Span Span) : CandidateUnit;

    private sealed record StepsUnit(
        bool Matched,
        bool PrecededByDelimiter,
        string Name,
        ImmutableArray<string> ScopeStack,
        Span Span,
        ImmutableArray<PlannedStep> Steps,
        bool ExpectedFail,
        string? ExpectedErrorMessage) : CandidateUnit;

    private static MergedExample StartMerged(StepsUnit unit) => new()
    {
        Name = unit.Name,
        ScopeStack = unit.ScopeStack,
        StartOffset = unit.Span.StartOffset,
        EndOffset = unit.Span.EndOffset,
        Steps = [.. unit.Steps],
        ExpectedFail = unit.ExpectedFail,
        ExpectedErrorMessage = unit.ExpectedErrorMessage,
    };

    private static void MergeInto(MergedExample open, StepsUnit unit, bool fromReference)
    {
        if (open.NameFromReference && !fromReference)
        {
            open.Name = unit.Name;
            open.ScopeStack = unit.ScopeStack;
            open.NameFromReference = false;
        }

        open.EndOffset = unit.Span.EndOffset;
        open.Steps.AddRange(unit.Steps);

        // Any error fence in a merged part marks the whole example expected-to-fail; keep the first
        // message we see.
        if (unit.ExpectedFail)
        {
            open.ExpectedFail = true;
            if (open.ExpectedErrorMessage is null && unit.ExpectedErrorMessage is not null)
            {
                open.ExpectedErrorMessage = unit.ExpectedErrorMessage;
            }
        }
    }

    private static PlannedExample FinishMerged(MergedExample open, string source) => new(
        open.Name,
        open.ScopeStack,
        Span.FromOffsets(source, open.StartOffset, open.EndOffset),
        [.. open.Steps],
        ExpectedFail: open.ExpectedFail,
        ExpectedErrorMessage: open.ExpectedErrorMessage);

    // Plan a single candidate paragraph (plus its attached tables/fences) in isolation. Emits
    // ambiguity / error-fence diagnostics into <paramref name="diagnostics"/>.
    /// <summary>
    /// Resolve one reference block into the step-bearing units of the section it names,
    /// recursively: a referenced section may itself contain reference blocks, to any depth (ADR
    /// 0016 leaves depth to the author's judgement). <paramref name="chain"/> carries the sections
    /// currently being resolved so a repeat is reported as a cycle instead of recursing forever.
    /// </summary>
    private static List<StepsUnit> ResolveReference(
        ReferenceUnit unit,
        Doc from,
        Registry registry,
        OathWorkspace workspace,
        ImmutableArray<Diagnostic>.Builder diagnostics,
        ImmutableList<string> chain)
    {
        var reference = unit.Reference;
        var key = Reference_.SectionKey(reference.Path, reference.Slug);
        if (chain.Contains(key))
        {
            diagnostics.Add(Varar.Core.Diagnostics.ReferenceCycle(chain.Add(key), unit.Span));
            return [];
        }

        // A same-file reference resolves against the document being planned, which is not
        // necessarily in the workspace.
        Doc? target = reference.Path == from.Path
            ? from
            : workspace.Docs.TryGetValue(reference.Path, out var found) ? found : null;
        if (target is null)
        {
            diagnostics.Add(Varar.Core.Diagnostics.ReferenceNotFound(reference.Text, reference.Path, unit.Span));
            return [];
        }

        var result = new List<StepsUnit>();
        foreach (var candidate in Reference_.SectionCandidates(target, reference.Slug))
        {
            switch (PlanCandidate(candidate, target, registry, diagnostics))
            {
                case ReferenceUnit nested:
                    result.AddRange(ResolveReference(nested, target, registry, workspace, diagnostics, chain.Add(key)));
                    break;

                // A header-bound table produces one example per row, which a spliced step list
                // cannot express; an `error` fence declares an outcome for an example, not for a
                // reusable fragment. Both are left out.
                case StepsUnit { Matched: true } planned:
                    result.Add(TagWithDoc(planned, target.Path, from.Path));
                    break;
            }
        }

        if (result.Count == 0)
        {
            diagnostics.Add(Varar.Core.Diagnostics.ReferenceEmpty(
                reference.Text, reference.Path, reference.Slug, unit.Span));
        }

        return result;
    }

    // Carry the source document's identity on every spliced step, so a failure in a referenced
    // section reports spans against the file they were written in rather than the file being run.
    private static StepsUnit TagWithDoc(StepsUnit unit, string docPath, string hostPath) =>
        docPath == hostPath
            ? unit
            : unit with { Steps = [.. unit.Steps.Select(s => s with { DocPath = docPath })] };

    private static CandidateUnit PlanCandidate(
        Example ex,
        Doc doc,
        Registry registry,
        ImmutableArray<Diagnostic>.Builder diagnostics)
    {
        // A block whose whole text is a link to an oath section is a reference, not content: never
        // matched against step definitions, and never prose.
        if (ex.Body.Length > 0
            && Reference_.TextOf(ex.Body[0]) is { } primaryText
            && Reference_.ReferenceOf(primaryText, doc.Path) is { } reference)
        {
            return new ReferenceUnit(reference, ex.PrecededByDelimiter, ex.Span);
        }

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
                var span = LiftSpan(doc.Source, block, collision.MatchStart, collision.MatchEnd);
                diagnostics.Add(Varar.Core.Diagnostics.AmbiguousMatch(
                    Scanner.Slice(blockText, collision.MatchStart, collision.MatchEnd),
                    span,
                    [.. collision.Candidates
                        .Select(c => new Candidate(c.Expression, c.StepDef.ExpressionSourceFile, c.StepDef.ExpressionSourceLine))]));
                hadAmbiguous = true;
            }

            if (!hadAmbiguous && result.Steps.Length > 0)
            {
                stepsByBlock[idx] = result.Steps.Select(hit => new PlannedStep(
                    Scanner.Slice(blockText, hit.MatchStart, hit.MatchEnd),
                    LiftSpan(doc.Source, block, hit.MatchStart, hit.MatchEnd),
                    [.. hit.ParamSpans.Select(p => LiftSpan(doc.Source, block, p.Start, p.End))],
                    hit.StepDef,
                    hit.Args,
                    hit.Formats,
                    ParamTexts: [.. hit.ParamSpans.Select(p => Scanner.Slice(blockText, p.Start, p.End))])).ToList();
            }
        }

        // Header-bound table: a table whose every header cell is named in the paragraph above it
        // iterates row by row, each row its own example.
        var bound = !hadAmbiguous ? DetectHeaderBound(ex, stepsByBlock, doc.Source) : null;
        if (bound is not null)
        {
            var headerBinding = new HeaderBinding(
                bound.Step.MatchSpan,
                bound.HeaderSpans,
                bound.Table.Header.CellSpans,
                bound.Step.StepDef);

            var rows = ImmutableArray.CreateBuilder<PlannedExample>();
            foreach (var row in bound.Table.Rows)
            {
                var rowObject = Value.Map(bound.Table.Header.Cells.Select((cell, i) =>
                    new KeyValuePair<string, Value>(cell, Value.Of(i < row.Cells.Length ? row.Cells[i] : string.Empty))));

                var rowStep = bound.Step with
                {
                    MatchSpan = row.Span,
                    Args = bound.Step.Args.Add(rowObject),
                };

                ImmutableArray<RowCheck> rowChecks = [.. bound.Table.Header.Cells.Select((column, i) => new RowCheck(
                    column,
                    i < row.Cells.Length ? row.Cells[i] : string.Empty,
                    i < row.CellSpans.Length ? row.CellSpans[i] : row.Span))];

                rows.Add(new PlannedExample(
                    string.Join(" / ", row.Cells),
                    ex.ScopeStack.Add(bound.Step.Text),
                    row.Span,
                    [rowStep],
                    headerBinding,
                    rowChecks));
            }

            return new HeaderBoundUnit(rows.ToImmutable());
        }

        // An `error` fence marks the candidate expected-to-fail (consumed here, never a doc string).
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

        var runnableSteps = hadAmbiguous ? [] : finalSteps.ToImmutable();

        // An `error` fence declares the candidate expected-to-fail, but here there's no runnable
        // step to produce that failure (nothing matched, or the match was ambiguous). That's an
        // author mistake, not silent Markdown — flag it.
        if (errorFence is not null && runnableSteps.Length == 0)
        {
            diagnostics.Add(Varar.Core.Diagnostics.ErrorFenceWithoutStep(errorFence.Span));
        }

        bool expectedFail = errorFence is not null;
        string? expectedErrorMessage = errorFence is not null && errorFence.Body.Trim().Length > 0
            ? errorFence.Body.Trim()
            : null;

        return new StepsUnit(
            Matched: runnableSteps.Length > 0,
            PrecededByDelimiter: ex.PrecededByDelimiter,
            Name: DeriveExampleName(ex.Body),
            ScopeStack: ex.ScopeStack,
            Span: ex.Span,
            Steps: runnableSteps,
            ExpectedFail: expectedFail,
            ExpectedErrorMessage: expectedErrorMessage);
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
                ParamSpans = [.. h.ParamSpans.Select(p => new ParamSpan(p.Start + sentence.StartOffset, p.End + sentence.StartOffset))],
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

            int[] offsets = [.. table.Header.Cells.Select(cell => WordOffset(aboveText, cell))];
            if (offsets.Any(o => o < 0))
            {
                continue;
            }

            ImmutableArray<Span> headerSpans =
                [.. table.Header.Cells.Select((cell, i) => LiftSpan(source, above, offsets[i], offsets[i] + cell.Length))];
            return new HeaderBound(table, steps[^1], headerSpans);
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
