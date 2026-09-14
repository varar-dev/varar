package dev.varar.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * The planner — port of {@code typescript/packages/core/src/plan.ts}. For each {@link Ast.Example} in a {@link
 * Ast.Doc}, plans every text-bearing block via {@link Matcher}, lifts block-relative match
 * offsets to absolute source {@link Span}s, attaches trailing {@link Ast.Table}/{@link Ast.Fence}
 * nodes to the last step (data table / doc string), handles the {@code ```error} fence
 * convention, detects header-bound tables (expanding them into one example per row), and collects
 * {@code ambiguous-match}/{@code error-fence-without-step} diagnostics.
 *
 * <p>Java's {@code String}/{@code char} are already UTF-16 code-unit indexed (see {@link Span}'s
 * javadoc), so — like {@link Matcher} and unlike the Python port — this needs no code-point/UTF-16
 * conversion layer: every offset here is a plain {@code String} index throughout.
 */
public final class Plan {

    private Plan() {}

    // -----------------------------------------------------------------------------------------
    // Public types
    // -----------------------------------------------------------------------------------------

    /** The result of planning a whole {@link Ast.Doc}. */
    public record ExecutionPlan(Ast.Doc doc, List<PlannedExample> examples, List<Diagnostics.Diagnostic> diagnostics) {
        public ExecutionPlan {
            examples = List.copyOf(examples);
            diagnostics = List.copyOf(diagnostics);
        }
    }

    /**
     * One matched-and-runnable example.
     *
     * <p>{@code headerBinding}/{@code expectedOutcome}/{@code expectedErrorMessage} are {@code
     * null} when not applicable (TS's optional fields). {@code rowChecks} is {@code null} except
     * on a header-bound table's row examples.
     *
     * <p>{@code rowChecks} stays typed {@code List<?>} rather than {@code List<CellDiff.RowCheck>}
     * — matching this record's original interface spec — even though each element is now the
     * canonical {@link CellDiff.RowCheck} from {@code CellDiff.java} (this field predates that
     * type; see {@code CellDiff.java}'s javadoc for the {@code column}/{@code value}/{@code span}
     * shape).
     */
    public record PlannedExample(
            String name,
            List<String> scopeStack,
            Span span,
            List<PlannedStep> steps,
            HeaderBinding headerBinding,
            List<?> rowChecks,
            String expectedOutcome,
            String expectedErrorMessage) {
        public PlannedExample {
            scopeStack = List.copyOf(scopeStack);
            steps = List.copyOf(steps);
            if (rowChecks != null) rowChecks = List.copyOf(rowChecks);
        }
    }

    /**
     * Describes the binding paragraph shared by every row of a header-bound table: the matched
     * step's span in that paragraph, plus one span per header cell located where it appears there.
     */
    public record HeaderBinding(Span matchSpan, List<Span> paramSpans, Registry.StepRegistration stepDef) {
        public HeaderBinding {
            paramSpans = List.copyOf(paramSpans);
        }
    }

    /**
     * One matched step: its text, source span, captured-parameter spans, args, and attachments.
     * {@code formats} is copied from the {@link Matcher.Hit} — each captured argument's
     * parameter-type display formatter, aligned 1:1 with {@code args} ({@code null} entries
     * when the type has none) — so the executor can render parameter mismatches without
     * reaching back into the registry. Copied null-tolerantly ({@code List.copyOf} rejects
     * nulls).
     */
    /**
     * @param paramTexts the notation each parameter matched, sliced at plan time from the document
     *     the step was WRITTEN in. Consumers must use this rather than slicing the running oath's
     *     source: a step a reference block spliced in (ADR 0016) has spans in a different document.
     * @param docPath set only on such a spliced step — the document its spans belong to; {@code
     *     null} means the example's own document.
     */
    public record PlannedStep(
            String text,
            Span matchSpan,
            List<Span> paramSpans,
            Registry.StepRegistration stepDef,
            List<Object> args,
            List<Function<Object, String>> formats,
            Ast.Table dataTable,
            Ast.Fence docString,
            List<String> paramTexts,
            String docPath) {
        public PlannedStep {
            paramSpans = List.copyOf(paramSpans);
            args = List.copyOf(args);
            formats = Collections.unmodifiableList(new ArrayList<>(formats));
            paramTexts = List.copyOf(paramTexts);
        }

        /** Same step, tagged with the document its spans belong to. */
        public PlannedStep withDocPath(String path) {
            return new PlannedStep(
                    text, matchSpan, paramSpans, stepDef, args, formats, dataTable, docString, paramTexts, path);
        }
    }

    // -----------------------------------------------------------------------------------------
    // Main entry point
    // -----------------------------------------------------------------------------------------

    /** Plans {@code doc} against {@code registry}: mirrors {@code plan()} in plan.ts exactly. */
    public static ExecutionPlan plan(Ast.Doc doc, Registry registry, Reference.OathWorkspace workspace) {
        List<Diagnostics.Diagnostic> diagnostics = new ArrayList<>();

        // Phase 1: plan each candidate paragraph independently into a "unit". A section another
        // oath references stops being a standalone example: it runs where it is referenced, not
        // here (ADR 0016).
        List<CandidateUnit> units = new ArrayList<>(doc.examples().size());
        for (Ast.Example ex : doc.examples()) {
            if (consumed(ex, doc, workspace)) continue;
            units.add(planCandidate(ex, doc, registry, diagnostics));
        }

        // Phase 2: group adjacent candidates into examples. A matching candidate continues the open
        // example when no delimiter (heading / `---`) precedes it; otherwise it starts a new one. A
        // non-matching candidate (prose) is a delimiter: it closes the open example and is dropped.
        // A header-bound table candidate is standalone — it already emits one example per row. See
        // ADR 0012.
        List<PlannedExample> examples = new ArrayList<>();
        MergedExample open = null;
        for (CandidateUnit unit : units) {
            if (unit instanceof HeaderBoundUnit hb) {
                if (open != null) {
                    examples.add(finishMerged(open, doc.source()));
                    open = null;
                }
                examples.addAll(hb.rows());
                continue;
            }
            if (unit instanceof ReferenceUnit ru) {
                // Splice the referenced section's steps in at this position. Only the reference
                // block itself is subject to the delimiter rule; everything it splices in belongs
                // to the same sequence, so a section of several paragraphs stays one example.
                List<StepsUnit> resolved = resolveReference(ru, doc, registry, workspace, diagnostics, List.of());
                for (int i = 0; i < resolved.size(); i++) {
                    StepsUnit spliced = resolved.get(i);
                    MergedExample current;
                    if (open != null && (i > 0 || !ru.precededByDelimiter())) {
                        mergeInto(open, spliced, true);
                        current = open;
                    } else {
                        if (open != null) examples.add(finishMerged(open, doc.source()));
                        current = startMerged(spliced);
                        // An example that OPENS with a reference is named by its own first matching
                        // paragraph, not by the section it pulls in — and it sits under THIS
                        // document's headings, not the section's.
                        current.nameFromReference = true;
                        current.scopeStack = ru.scopeStack();
                        current.startOffset = ru.span().startOffset();
                        open = current;
                    }
                    // A spliced unit's span is in the referenced document; the example's span is in
                    // this one. It ends at the reference block until a later paragraph of the
                    // example's own extends it.
                    current.endOffset = ru.span().endOffset();
                }
                continue;
            }
            StepsUnit su = (StepsUnit) unit;
            if (!su.matched()) {
                // Prose paragraph — a delimiter. Drop it and end the open example.
                if (open != null) {
                    examples.add(finishMerged(open, doc.source()));
                    open = null;
                }
                continue;
            }
            if (open != null && !su.precededByDelimiter()) {
                mergeInto(open, su, false);
            } else {
                if (open != null) examples.add(finishMerged(open, doc.source()));
                open = startMerged(su);
            }
        }
        if (open != null) examples.add(finishMerged(open, doc.source()));

        // A table or fence that doesn't attach to a step is just Markdown content, not a mistake
        // — it produces no diagnostic.

        return new ExecutionPlan(doc, examples, diagnostics);
    }

    // -----------------------------------------------------------------------------------------
    // Internal: two-phase grouping (ADR 0012)
    // -----------------------------------------------------------------------------------------

    /** One candidate paragraph, planned in isolation. */
    private sealed interface CandidateUnit permits HeaderBoundUnit, StepsUnit, ReferenceUnit {}

    /**
     * A reference block: its whole text is a link to an oath section, whose steps are spliced in
     * here (ADR 0016). Never prose, so it does not close the open example. Carries the referring
     * document's own heading chain and the block's own span: an example this reference opens
     * belongs here, not to the section.
     */
    private record ReferenceUnit(
            Reference.Ref reference, boolean precededByDelimiter, List<String> scopeStack, Span span)
            implements CandidateUnit {}

    /** A header-bound table candidate — standalone, one planned example per data row. */
    private record HeaderBoundUnit(List<PlannedExample> rows) implements CandidateUnit {}

    /** A step-bearing candidate (or a non-matching prose paragraph, {@code matched == false}). */
    private record StepsUnit(
            boolean matched,
            boolean precededByDelimiter,
            String name,
            List<String> scopeStack,
            Span span,
            List<PlannedStep> steps,
            String expectedOutcome,
            String expectedErrorMessage)
            implements CandidateUnit {}

    /**
     * A step-bearing candidate accumulating into one example while adjacent matching candidates
     * keep merging in. Mutable — the grouping loop appends steps and extends the end offset in
     * place; {@link #finishMerged} freezes it into an immutable {@link PlannedExample}.
     */
    private static final class MergedExample {
        String name;
        List<String> scopeStack;
        int startOffset;
        int endOffset;
        List<PlannedStep> steps;
        String expectedOutcome; // null or "fail"
        String expectedErrorMessage; // null when absent

        /**
         * True while the name came from a spliced (referenced) paragraph and is waiting to be
         * replaced by the example's own first matching paragraph.
         */
        boolean nameFromReference;
    }

    private static MergedExample startMerged(StepsUnit unit) {
        MergedExample m = new MergedExample();
        m.name = unit.name();
        m.scopeStack = unit.scopeStack();
        m.startOffset = unit.span().startOffset();
        m.endOffset = unit.span().endOffset();
        m.steps = new ArrayList<>(unit.steps());
        m.expectedOutcome = unit.expectedOutcome();
        m.expectedErrorMessage = unit.expectedErrorMessage();
        return m;
    }

    private static void mergeInto(MergedExample open, StepsUnit unit, boolean fromReference) {
        if (open.nameFromReference && !fromReference) {
            open.name = unit.name();
            open.scopeStack = unit.scopeStack();
            open.nameFromReference = false;
        }
        open.endOffset = unit.span().endOffset();
        open.steps.addAll(unit.steps());
        // Any error fence in a merged part marks the whole example expected-to-fail; keep the first
        // message we see.
        if ("fail".equals(unit.expectedOutcome())) {
            open.expectedOutcome = "fail";
            if (open.expectedErrorMessage == null && unit.expectedErrorMessage() != null) {
                open.expectedErrorMessage = unit.expectedErrorMessage();
            }
        }
    }

    private static PlannedExample finishMerged(MergedExample open, String source) {
        Span span = Span.spanFromOffsets(source, open.startOffset, open.endOffset);
        return new PlannedExample(
                open.name,
                open.scopeStack,
                span,
                open.steps,
                null,
                null,
                open.expectedOutcome,
                open.expectedErrorMessage);
    }

    /**
     * Plans a single candidate paragraph (plus its attached tables/fences) in isolation. Emits
     * ambiguity / error-fence diagnostics into {@code diagnostics}. Uses the same per-candidate
     * logic the old single-pass planner ran per example; grouping is Phase 2's job.
     */
    private static boolean consumed(Ast.Example ex, Ast.Doc doc, Reference.OathWorkspace workspace) {
        if (workspace.referenced().contains(Reference.sectionKey(doc.path(), ""))) return true;
        for (String h : ex.scopeStack()) {
            if (workspace.referenced().contains(Reference.sectionKey(doc.path(), Reference.slugify(h)))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Resolves one reference block into the step-bearing units of the section it names,
     * recursively: a referenced section may itself contain reference blocks, to any depth (ADR 0016
     * leaves depth to the author's judgement). {@code chain} carries the sections currently being
     * resolved so a repeat is reported as a cycle instead of recursing forever.
     */
    private static List<StepsUnit> resolveReference(
            ReferenceUnit unit,
            Ast.Doc from,
            Registry registry,
            Reference.OathWorkspace workspace,
            List<Diagnostics.Diagnostic> diagnostics,
            List<String> chain) {
        Reference.Ref ref = unit.reference();
        String key = Reference.sectionKey(ref.path(), ref.slug());
        if (chain.contains(key)) {
            diagnostics.add(Diagnostics.referenceCycle(unit.span()));
            return List.of();
        }
        // A same-file reference resolves against the document being planned, which is not
        // necessarily in the workspace.
        Ast.Doc target =
                ref.path().equals(from.path()) ? from : workspace.docs().get(ref.path());
        if (target == null) {
            diagnostics.add(Diagnostics.referenceNotFound(unit.span()));
            return List.of();
        }
        List<String> deeper = new ArrayList<>(chain);
        deeper.add(key);
        List<StepsUnit> out = new ArrayList<>();
        for (Ast.Example candidate : Reference.sectionCandidates(target, ref.slug())) {
            CandidateUnit planned = planCandidate(candidate, target, registry, diagnostics);
            if (planned instanceof ReferenceUnit nested) {
                out.addAll(resolveReference(nested, target, registry, workspace, diagnostics, deeper));
                continue;
            }
            // A header-bound table produces one example per row, which a spliced step list cannot
            // express; an `error` fence declares an outcome for an example, not for a reusable
            // fragment. Both are left out.
            if (planned instanceof StepsUnit su && su.matched()) {
                out.add(tagWithDoc(su, target.path(), from.path()));
            }
        }
        if (out.isEmpty()) diagnostics.add(Diagnostics.referenceEmpty(unit.span()));
        return out;
    }

    /**
     * Carries the source document's identity on every spliced step, so a failure in a referenced
     * section reports spans against the file they were written in rather than the file being run.
     */
    private static StepsUnit tagWithDoc(StepsUnit unit, String docPath, String hostPath) {
        if (docPath.equals(hostPath)) return unit;
        List<PlannedStep> tagged = new ArrayList<>(unit.steps().size());
        for (PlannedStep step : unit.steps()) tagged.add(step.withDocPath(docPath));
        return new StepsUnit(
                unit.matched(),
                unit.precededByDelimiter(),
                unit.name(),
                unit.scopeStack(),
                unit.span(),
                tagged,
                unit.expectedOutcome(),
                unit.expectedErrorMessage());
    }

    private static CandidateUnit planCandidate(
            Ast.Example ex, Ast.Doc doc, Registry registry, List<Diagnostics.Diagnostic> diagnostics) {
        // A block whose whole text is a link to an oath section is a reference, not content: never
        // matched against step definitions, and never prose.
        if (!ex.body().isEmpty()) {
            String primaryText = Reference.textOf(ex.body().get(0));
            if (primaryText != null) {
                Reference.Ref ref = Reference.referenceOf(primaryText, doc.path());
                if (ref != null) {
                    return new ReferenceUnit(ref, ex.precededByDelimiter(), ex.scopeStack(), ex.span());
                }
            }
        }

        boolean hadAmbiguous = false;
        List<Ast.Block> body = ex.body();

        // Pass 1: plan each text-bearing block and collect steps per body index.
        Map<Integer, List<PlannedStep>> stepsByBlock = new LinkedHashMap<>();
        for (int idx = 0; idx < body.size(); idx++) {
            Ast.Block block = body.get(idx);
            if (!isTextBearing(block)) continue;
            String text = textOf(block);
            BlockPlan result = planBlock(text, registry);
            for (Ambiguity collision : result.ambiguities()) {
                Span span = liftSpan(doc.source(), block, collision.matchStart(), collision.matchEnd());
                diagnostics.add(Diagnostics.ambiguousMatch(span));
                hadAmbiguous = true;
            }
            if (!hadAmbiguous && !result.steps().isEmpty()) {
                List<PlannedStep> blockSteps = new ArrayList<>(result.steps().size());
                for (Matcher.Hit hit : result.steps()) {
                    List<Span> paramSpans = new ArrayList<>(hit.paramSpans().size());
                    for (Matcher.ParamSpan p : hit.paramSpans()) {
                        paramSpans.add(liftSpan(doc.source(), block, p.start(), p.end()));
                    }
                    List<String> paramTexts = new ArrayList<>(hit.paramSpans().size());
                    for (Matcher.ParamSpan p : hit.paramSpans()) {
                        paramTexts.add(text.substring(p.start(), p.end()));
                    }
                    blockSteps.add(new PlannedStep(
                            text.substring(hit.matchStart(), hit.matchEnd()),
                            liftSpan(doc.source(), block, hit.matchStart(), hit.matchEnd()),
                            paramSpans,
                            hit.stepDef(),
                            hit.args(),
                            hit.formats(),
                            null,
                            null,
                            paramTexts,
                            null));
                }
                stepsByBlock.put(idx, blockSteps);
            }
        }

        // Header-bound table: a table whose every header cell is named (whole word, case-sensitive)
        // in the matched paragraph above it iterates row by row. The matched step runs once per
        // data row, receiving the row as an object keyed by header cell, and each row becomes its
        // own example.
        HeaderBoundResult bound = hadAmbiguous ? null : detectHeaderBound(body, stepsByBlock, doc.source());
        if (bound != null) {
            HeaderBinding headerBinding = new HeaderBinding(
                    bound.step().matchSpan(), bound.headerSpans(), bound.step().stepDef());
            List<String> headerCells = bound.table().header().cells();
            List<PlannedExample> rows = new ArrayList<>(bound.table().rows().size());
            for (Ast.Row row : bound.table().rows()) {
                Map<String, String> rowObject = new LinkedHashMap<>();
                for (int i = 0; i < headerCells.size(); i++) {
                    rowObject.put(headerCells.get(i), cellAt(row, i));
                }
                List<Object> rowArgs = new ArrayList<>(bound.step().args());
                rowArgs.add(rowObject);
                PlannedStep rowStep = new PlannedStep(
                        bound.step().text(),
                        row.span(),
                        bound.step().paramSpans(),
                        bound.step().stepDef(),
                        rowArgs,
                        bound.step().formats(),
                        null,
                        null,
                        bound.step().paramTexts(),
                        bound.step().docPath());
                List<CellDiff.RowCheck> rowChecks = new ArrayList<>(headerCells.size());
                for (int i = 0; i < headerCells.size(); i++) {
                    rowChecks.add(new CellDiff.RowCheck(headerCells.get(i), cellAt(row, i), cellSpanAt(row, i)));
                }
                List<String> nestedScope = new ArrayList<>(ex.scopeStack());
                nestedScope.add(bound.step().text());
                rows.add(new PlannedExample(
                        String.join(" / ", row.cells()),
                        nestedScope,
                        row.span(),
                        List.of(rowStep),
                        headerBinding,
                        rowChecks,
                        null,
                        null));
            }
            return new HeaderBoundUnit(rows);
        }

        // An ```error fence anywhere in this candidate marks it expected-to-fail and is consumed
        // here (never attached to a step as a doc string).
        Ast.Fence errorFence = null;
        for (Ast.Block b : body) {
            if (b instanceof Ast.Fence f && "error".equals(f.info())) {
                errorFence = f;
                break;
            }
        }

        // Pass 2: look for table/fence immediately after a step-bearing block.
        Map<Integer, Attachment> attachments = new LinkedHashMap<>();
        for (int idx = 1; idx < body.size(); idx++) {
            Ast.Block here = body.get(idx);
            if (here instanceof Ast.Table table && stepsByBlock.containsKey(idx - 1)) {
                Attachment prev = attachments.get(idx - 1);
                attachments.put(idx - 1, new Attachment(table, prev == null ? null : prev.docString()));
            } else if (here instanceof Ast.Fence fence
                    && !"error".equals(fence.info())
                    && stepsByBlock.containsKey(idx - 1)) {
                Attachment prev = attachments.get(idx - 1);
                attachments.put(idx - 1, new Attachment(prev == null ? null : prev.dataTable(), fence));
            }
        }

        // Pass 3: rebuild final step list, applying attachments to the last step of each block.
        List<PlannedStep> finalSteps = new ArrayList<>();
        for (int idx = 0; idx < body.size(); idx++) {
            List<PlannedStep> stepsAtIdx = stepsByBlock.getOrDefault(idx, List.of());
            Attachment attachAt = attachments.get(idx);
            for (int s = 0; s < stepsAtIdx.size(); s++) {
                PlannedStep step = stepsAtIdx.get(s);
                if (s == stepsAtIdx.size() - 1 && attachAt != null) {
                    finalSteps.add(new PlannedStep(
                            step.text(),
                            step.matchSpan(),
                            step.paramSpans(),
                            step.stepDef(),
                            step.args(),
                            step.formats(),
                            attachAt.dataTable(),
                            attachAt.docString(),
                            step.paramTexts(),
                            step.docPath()));
                } else {
                    finalSteps.add(step);
                }
            }
        }

        List<PlannedStep> runnableSteps = hadAmbiguous ? List.of() : finalSteps;

        // An `error` fence declares the candidate expected-to-fail, but here there's no runnable
        // step to produce that failure (nothing matched, or the match was ambiguous). That's an
        // author mistake, not silent Markdown — flag it.
        if (errorFence != null && runnableSteps.isEmpty()) {
            diagnostics.add(Diagnostics.errorFenceWithoutStep(errorFence.span()));
        }

        String expectedOutcome = null;
        String expectedErrorMessage = null;
        if (errorFence != null) {
            expectedOutcome = "fail";
            String trimmed = errorFence.body().strip();
            if (!trimmed.isEmpty()) expectedErrorMessage = trimmed;
        }

        return new StepsUnit(
                !runnableSteps.isEmpty(),
                ex.precededByDelimiter(),
                deriveExampleName(body),
                ex.scopeStack(),
                ex.span(),
                runnableSteps,
                expectedOutcome,
                expectedErrorMessage);
    }

    // -----------------------------------------------------------------------------------------
    // Internal: block-level planning
    // -----------------------------------------------------------------------------------------

    private record Ambiguity(int matchStart, int matchEnd, List<Matcher.Hit> candidates) {}

    private record BlockPlan(List<Matcher.Hit> steps, List<Ambiguity> ambiguities) {}

    private static BlockPlan planBlock(String text, Registry registry) {
        List<Matcher.Hit> allSteps = new ArrayList<>();
        List<Ambiguity> allAmbiguities = new ArrayList<>();
        for (Sentences.Sentence sentence : Sentences.splitSentences(text)) {
            List<Matcher.Hit> hits = Matcher.findHits(sentence.text(), registry);
            List<Matcher.Hit> adjusted = new ArrayList<>(hits.size());
            for (Matcher.Hit h : hits) {
                List<Matcher.ParamSpan> paramSpans =
                        new ArrayList<>(h.paramSpans().size());
                for (Matcher.ParamSpan p : h.paramSpans()) {
                    paramSpans.add(new Matcher.ParamSpan(
                            p.start() + sentence.startOffset(), p.end() + sentence.startOffset()));
                }
                adjusted.add(new Matcher.Hit(
                        h.expression(),
                        h.stepDef(),
                        h.matchStart() + sentence.startOffset(),
                        h.matchEnd() + sentence.startOffset(),
                        h.args(),
                        paramSpans,
                        h.formats()));
            }
            Matcher.ResolvedSteps resolved = Matcher.resolveHits(adjusted);
            if (resolved instanceof Matcher.Ambiguous ambiguous) {
                for (Matcher.AmbiguityCollision c : ambiguous.collisions()) {
                    allAmbiguities.add(new Ambiguity(c.matchStart(), c.matchEnd(), c.candidates()));
                }
            } else if (resolved instanceof Matcher.Ok ok && !ok.steps().isEmpty()) {
                allSteps.addAll(ok.steps());
            }
            // No keyword-led "missing step" detection — by design. Step-def generation is
            // selection-driven only, never inferred from sentence shape.
        }
        return new BlockPlan(List.copyOf(allSteps), List.copyOf(allAmbiguities));
    }

    // -----------------------------------------------------------------------------------------
    // Internal: header-bound table detection
    // -----------------------------------------------------------------------------------------

    private record HeaderBoundResult(Ast.Table table, PlannedStep step, List<Span> headerSpans) {}

    /**
     * Finds the first table in this example whose every header cell appears as a whole word
     * (case-sensitive) in the step-bearing block immediately above it. Returns that table together
     * with the step it binds to (the block's last matched step — the one a trailing table would
     * otherwise attach to).
     */
    private static HeaderBoundResult detectHeaderBound(
            List<Ast.Block> body, Map<Integer, List<PlannedStep>> stepsByBlock, String source) {
        for (int idx = 1; idx < body.size(); idx++) {
            Ast.Block here = body.get(idx);
            if (!(here instanceof Ast.Table table)) continue;
            Ast.Block above = body.get(idx - 1);
            if (!isTextBearing(above)) continue;
            List<PlannedStep> steps = stepsByBlock.get(idx - 1);
            if (steps == null || steps.isEmpty()) continue;
            String aboveText = textOf(above);
            List<String> headerCells = table.header().cells();
            int[] offsets = new int[headerCells.size()];
            boolean anyMissing = false;
            for (int i = 0; i < headerCells.size(); i++) {
                offsets[i] = wordOffset(aboveText, headerCells.get(i));
                if (offsets[i] < 0) anyMissing = true;
            }
            if (anyMissing) continue;
            List<Span> headerSpans = new ArrayList<>(headerCells.size());
            for (int i = 0; i < headerCells.size(); i++) {
                headerSpans.add(liftSpan(
                        source,
                        above,
                        offsets[i],
                        offsets[i] + headerCells.get(i).length()));
            }
            return new HeaderBoundResult(table, steps.get(steps.size() - 1), List.copyOf(headerSpans));
        }
        return null;
    }

    /** Offset of {@code word} in {@code haystack} as a whole word (case-sensitive), or -1. */
    private static int wordOffset(String haystack, String word) {
        String escaped = escapeRegex(word);
        Pattern pattern = Pattern.compile("(?<![\\p{L}\\p{N}_])" + escaped + "(?![\\p{L}\\p{N}_])");
        java.util.regex.Matcher m = pattern.matcher(haystack);
        return m.find() ? m.start() : -1;
    }

    private static String escapeRegex(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (".*+?^${}()|[]\\".indexOf(c) >= 0) sb.append('\\');
            sb.append(c);
        }
        return sb.toString();
    }

    // -----------------------------------------------------------------------------------------
    // Internal: attachments (pass 2/3 support)
    // -----------------------------------------------------------------------------------------

    private record Attachment(Ast.Table dataTable, Ast.Fence docString) {}

    // -----------------------------------------------------------------------------------------
    // Internal: example naming
    // -----------------------------------------------------------------------------------------

    static String deriveExampleName(List<Ast.Block> body) {
        Ast.Block primary = null;
        for (Ast.Block b : body) {
            if (isTextBearing(b)) {
                primary = b;
                break;
            }
        }
        if (primary == null) return "";
        // The entire paragraph is the test name — an example is often a paragraph where only
        // some sentences match steps, and the narration around them is part of what the test
        // asserts about. Hard line breaks inside the paragraph collapse to single spaces (test
        // names must be one line), and a single trailing . ! ? is stripped; embedded
        // terminators (e.g. inside `i.e.` or a quoted string) are left alone.
        String name = textOf(primary).replaceAll("\\s+", " ").trim();
        if (!name.isEmpty()) {
            char last = name.charAt(name.length() - 1);
            if (last == '.' || last == '!' || last == '?') {
                name = name.substring(0, name.length() - 1);
            }
        }
        return name;
    }

    // -----------------------------------------------------------------------------------------
    // Internal: block text/span helpers
    // -----------------------------------------------------------------------------------------

    private static boolean isTextBearing(Ast.Block block) {
        return block instanceof Ast.Paragraph || block instanceof Ast.ListItem || block instanceof Ast.Blockquote;
    }

    /** Text of a text-bearing block. Throws if {@code block} isn't one — call sites always check. */
    private static String textOf(Ast.Block block) {
        return switch (block) {
            case Ast.Paragraph p -> p.text();
            case Ast.ListItem l -> l.text();
            case Ast.Blockquote b -> b.text();
            default -> throw new IllegalStateException("not a text-bearing block: " + block);
        };
    }

    private static String cellAt(Ast.Row row, int i) {
        return i < row.cells().size() ? row.cells().get(i) : "";
    }

    private static Span cellSpanAt(Ast.Row row, int i) {
        return i < row.cellSpans().size() ? row.cellSpans().get(i) : row.span();
    }

    /**
     * Maps a {@code [blockStart, blockEnd)} UTF-16 offset range within a block's text back to a
     * source-document {@link Span}, via that block's {@code segmentMap}. Non-text-bearing blocks
     * (which carry no segment map) return their own span unchanged — mirrors {@code liftSpan}'s
     * defensive fallback in plan.ts.
     */
    private static Span liftSpan(String source, Ast.Block block, int blockStart, int blockEnd) {
        List<Ast.SegmentOffset> segmentMap =
                switch (block) {
                    case Ast.Paragraph p -> p.segmentMap();
                    case Ast.ListItem l -> l.segmentMap();
                    case Ast.Blockquote b -> b.segmentMap();
                    default -> null;
                };
        if (segmentMap == null) return spanOf(block);
        return liftFromSegmentMap(source, segmentMap, blockStart, blockEnd);
    }

    private static Span liftFromSegmentMap(
            String source, List<Ast.SegmentOffset> segmentMap, int blockStart, int blockEnd) {
        int start = liftSegmentOffset(segmentMap, blockStart);
        int end = liftSegmentOffset(segmentMap, blockEnd);
        return Span.spanFromOffsets(source, start, end);
    }

    private static int liftSegmentOffset(List<Ast.SegmentOffset> segmentMap, int textOffset) {
        Ast.SegmentOffset best = segmentMap.isEmpty() ? null : segmentMap.get(0);
        for (Ast.SegmentOffset entry : segmentMap) {
            if (entry.textOffset() <= textOffset) best = entry;
        }
        if (best == null) throw new IllegalStateException("empty segmentMap");
        return best.sourceOffset() + (textOffset - best.textOffset());
    }

    /** Exhaustive span accessor over the sealed {@link Ast.Block} union (no common interface method). */
    private static Span spanOf(Ast.Block block) {
        return switch (block) {
            case Ast.Heading h -> h.span();
            case Ast.Paragraph p -> p.span();
            case Ast.ListItem l -> l.span();
            case Ast.Blockquote b -> b.span();
            case Ast.Table t -> t.span();
            case Ast.Fence f -> f.span();
            case Ast.ThematicBreak t -> t.span();
        };
    }
}
