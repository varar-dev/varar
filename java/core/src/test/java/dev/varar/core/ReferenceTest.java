package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Translated from the ADR 0016 cases of {@code typescript/packages/core/tests/reference.test.ts}. */
class ReferenceTest {

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    private static final String SHARED = """
            # Shared

            ## A stocked library

            I shelve 3 books. The shelf holds 3 books.

            ## Fees are enabled

            Fees are enabled.
            """;

    private static Registry reg() {
        Registry r = Registry.createRegistry();
        r = Registry.addStep(r, "I shelve {int} books", "steps.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "The shelf holds {int} books", "steps.ts", 2, NOOP_HANDLER, StepKind.SENSOR);
        r = Registry.addStep(r, "Fees are enabled", "steps.ts", 3, NOOP_HANDLER, StepKind.STIMULUS);
        r = Registry.addStep(r, "Maya borrows {string}", "steps.ts", 4, NOOP_HANDLER, StepKind.STIMULUS);
        return r;
    }

    /** Plans {@code fees.md} with {@code shared.md} in the workspace. */
    private static Plan.ExecutionPlan planWith(String main) {
        Ast.Doc shared = Parse.parse("shared.md", SHARED);
        Ast.Doc doc = Parse.parse("fees.md", main);
        return Plan.plan(doc, reg(), Reference.buildWorkspace(List.of(shared, doc)));
    }

    @Test
    void anExampleAReferenceOpensIsPlacedAtTheReferenceBlockUnderTheReferringDocumentsHeadings() {
        // The spliced steps keep their spans in shared.md; the EXAMPLE lives in fees.md. Its span
        // used to be built from the section's offsets read against fees.md's source, which put it
        // at an unrelated line.
        String main = """
                # Late fees

                [A stocked library](./shared.md#a-stocked-library)

                Maya borrows "Emma".
                """;
        Plan.ExecutionPlan planned = planWith(main);
        assertEquals(List.of(), planned.diagnostics());
        Plan.PlannedExample ex = planned.examples().get(0);
        assertEquals(List.of("Late fees"), ex.scopeStack());
        assertEquals(3, ex.span().startLine());
        assertEquals(1, ex.span().startCol());
        assertEquals(5, ex.span().endLine());
        assertEquals(
                "[A stocked library](./shared.md#a-stocked-library)\n\nMaya borrows \"Emma\".",
                main.substring(ex.span().startOffset(), ex.span().endOffset()));
        // Spliced steps carry the document they were written in; the example's own step carries none.
        assertEquals(
                Arrays.asList("shared.md", "shared.md", null),
                ex.steps().stream().map(Plan.PlannedStep::docPath).toList());
    }

    @Test
    void anExampleThatIsNothingButAReferenceSpansTheReferenceBlockAndKeepsTheHostHeadings() {
        String main = """
                # Late fees

                ## Invariants

                [Fees are enabled](./shared.md#fees-are-enabled)
                """;
        Plan.ExecutionPlan planned = planWith(main);
        assertEquals(1, planned.examples().size());
        Plan.PlannedExample ex = planned.examples().get(0);
        assertEquals(
                List.of("Fees are enabled"),
                ex.steps().stream().map(Plan.PlannedStep::text).toList());
        assertEquals(List.of("Late fees", "Invariants"), ex.scopeStack());
        assertEquals(
                "[Fees are enabled](./shared.md#fees-are-enabled)",
                main.substring(ex.span().startOffset(), ex.span().endOffset()));
    }

    @Test
    void aReferenceMidExampleExtendsTheExampleToTheReferenceBlockNotIntoTheOtherFile() {
        String main = """
                # Late fees

                Maya borrows "Emma".

                [Fees are enabled](./shared.md#fees-are-enabled)
                """;
        Plan.ExecutionPlan planned = planWith(main);
        Plan.PlannedExample ex = planned.examples().get(0);
        assertEquals(
                List.of("Maya borrows \"Emma\"", "Fees are enabled"),
                ex.steps().stream().map(Plan.PlannedStep::text).toList());
        assertEquals(
                "Maya borrows \"Emma\".\n\n[Fees are enabled](./shared.md#fees-are-enabled)",
                main.substring(ex.span().startOffset(), ex.span().endOffset()));
    }

    @Test
    void aLinkThatClimbsAboveTheWorkspaceRootKeepsItsLeadingDotDot() {
        // The oath-path convention keeps `../` for an oath outside the root; the resolver must
        // too, or `../../shared/b.md` from `varar/a.md` would land on `shared/b.md`.
        Ast.Doc doc = Parse.parse("varar/a.md", "[Up](../../shared/b.md#setup)\n");
        assertEquals("../shared/b.md", Reference.references(doc).get(0).path());
        Ast.Doc deeper = Parse.parse("../outside/a.md", "[Up](../b.md)\n");
        assertEquals("../b.md", Reference.references(deeper).get(0).path());
    }

    @Test
    void joinPosixNormalisesDotsWithinTheRoot() {
        assertEquals("varar/shared.md", Reference.joinPosix("varar", "./shared.md"));
        assertEquals("shared/b.md", Reference.joinPosix("varar/x", "../../shared/b.md"));
        assertEquals("b.md", Reference.joinPosix("", "b.md"));
    }
}
