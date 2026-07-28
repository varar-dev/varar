package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Translated from {@code var-core/tests/drift.test.ts} + hash.test.ts vectors. */
class DriftTest {

    private static final Object NOOP_HANDLER = (Runnable) () -> {};

    private static Registry reg(boolean withStep) {
        Registry r = Registry.createRegistry();
        if (withStep) {
            r = Registry.addStep(r, "I withdraw {int}", "steps.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        }
        return r;
    }

    private static Registry romanReg(boolean withStep) {
        Registry r = Registry.createRegistry();
        if (withStep) {
            r = Registry.addStep(r, "a decimal and a roman number", "steps.ts", 1, NOOP_HANDLER, StepKind.SENSOR);
        }
        return r;
    }

    private static Plan.ExecutionPlan planOf(String source, Registry r) {
        return Plan.plan(Parse.parse("w.md", source), r);
    }

    private static List<String> bare(List<Drift.Drifted> drifts) {
        List<String> out = new ArrayList<>();
        for (Drift.Drifted d : drifts) out.add(d.name() + "@" + d.line());
        return out;
    }

    /** An in-memory BaselineStore. */
    private static final class MemoryStore implements Drift.BaselineStore {
        String contents;

        @Override
        public String read() {
            return contents;
        }

        @Override
        public void write(String c) {
            contents = c;
        }
    }

    @Test
    void hashMatchesTheTypescriptVectors() {
        assertEquals("fnv1a:4f9f2cab", Hash.hashSource("hello"));
        assertEquals("fnv1a:1a47e90b", Hash.hashSource("abc"));
        assertEquals("fnv1a:4eace75e", Hash.hashSource("# Title\n"));
    }

    @Test
    void liveExamplesRecordsOneEntryPerExampleProducingParagraph() {
        Ast.VarDoc varDoc = Parse.parse("w.md", "I withdraw 40.");
        assertEquals(
                List.of(new Drift.BaselineExample("I withdraw 40", 1)),
                Drift.liveExamples(varDoc, planOf("I withdraw 40.", reg(true))));
    }

    @Test
    void deriveOathBaselineCarriesTheFingerprint() {
        String source = "I withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        Drift.OathBaseline baseline = Drift.deriveOathBaseline(source, varDoc, planOf(source, reg(true)));
        assertEquals(Hash.hashSource(source), baseline.sourceHash());
        assertEquals(List.of(new Drift.BaselineExample("I withdraw 40", 1)), baseline.examples());
    }

    @Test
    void noBaselineMeansNoDrift() {
        Ast.VarDoc varDoc = Parse.parse("w.md", "I withdraw 40.");
        assertTrue(Drift.detectDrift(null, varDoc, planOf("I withdraw 40.", reg(true)))
                .isEmpty());
    }

    @Test
    void aRenamedStepDrifts() {
        String source = "I withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        Drift.OathBaseline baseline = Drift.deriveOathBaseline(source, varDoc, planOf(source, reg(true)));
        assertEquals(List.of("I withdraw 40@1"), bare(Drift.detectDrift(baseline, varDoc, planOf(source, reg(false)))));
    }

    @Test
    void anInPlaceTypoDrifts() {
        String before = "I withdraw 40.";
        Drift.OathBaseline baseline =
                Drift.deriveOathBaseline(before, Parse.parse("w.md", before), planOf(before, reg(true)));
        String after = "I withdrraw 40.";
        Ast.VarDoc afterDoc = Parse.parse("w.md", after);
        assertEquals(List.of("I withdraw 40@1"), bare(Drift.detectDrift(baseline, afterDoc, planOf(after, reg(true)))));
    }

    @Test
    void aDeletedParagraphIsNotDrift() {
        String before = "I withdraw 40.";
        Drift.OathBaseline baseline =
                Drift.deriveOathBaseline(before, Parse.parse("w.md", before), planOf(before, reg(true)));
        Ast.VarDoc afterDoc = Parse.parse("w.md", "");
        assertTrue(Drift.detectDrift(baseline, afterDoc, planOf("", reg(true))).isEmpty());
    }

    @Test
    void movingAndRewordingAStillMatchingExampleDoesNotDrift() {
        String before = "I withdraw 40.\n\nI withdraw 10.";
        Drift.OathBaseline baseline =
                Drift.deriveOathBaseline(before, Parse.parse("w.md", before), planOf(before, reg(true)));
        String after = "I withdraw 11.\n\nI withdraw 40.";
        assertTrue(Drift.detectDrift(baseline, Parse.parse("w.md", after), planOf(after, reg(true)))
                .isEmpty());
    }

    @Test
    void moveRewordProseOnOldLineDoesNotFalsePositive() {
        String before = "I withdraw 40.";
        Drift.OathBaseline baseline =
                Drift.deriveOathBaseline(before, Parse.parse("w.md", before), planOf(before, reg(true)));
        String after = "Just some notes.\n\nI withdraw 41.";
        assertTrue(Drift.detectDrift(baseline, Parse.parse("w.md", after), planOf(after, reg(true)))
                .isEmpty());
    }

    @Test
    void aParagraphRewrittenPastRecognitionIsNotDrift() {
        String before = "I withdraw 40.";
        Drift.OathBaseline baseline =
                Drift.deriveOathBaseline(before, Parse.parse("w.md", before), planOf(before, reg(true)));
        String after = "The branch closed years ago.";
        assertTrue(Drift.detectDrift(baseline, Parse.parse("w.md", after), planOf(after, reg(true)))
                .isEmpty());
    }

    private static final String ROMAN =
            "Each row gives a decimal and a roman number:\n\n| decimal | roman |\n| ------: | :---- |\n| 3 | III |\n| 9 | IX |\n";

    @Test
    void headerBoundTableRecordsItsBindingParagraphOnce() {
        Ast.VarDoc varDoc = Parse.parse("r.md", ROMAN);
        assertEquals(
                List.of(new Drift.BaselineExample("Each row gives a decimal and a roman number:", 1)),
                Drift.liveExamples(varDoc, Plan.plan(varDoc, romanReg(true))));
    }

    @Test
    void aHeaderBoundBindingParagraphThatStopsMatchingDrifts() {
        Ast.VarDoc varDoc = Parse.parse("r.md", ROMAN);
        Drift.OathBaseline baseline = Drift.deriveOathBaseline(ROMAN, varDoc, Plan.plan(varDoc, romanReg(true)));
        assertEquals(
                List.of("Each row gives a decimal and a roman number:@1"),
                bare(Drift.detectDrift(baseline, varDoc, Plan.plan(varDoc, romanReg(false)))));
    }

    @Test
    void reconcileRecordsThenReportsAndPreservesOnDrift() {
        String source = "I withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        MemoryStore store = new MemoryStore();
        assertTrue(Drift.reconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(true)), false)
                .isEmpty());
        String beforeLock = store.contents;
        List<Drift.Drifted> drifts =
                Drift.reconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(false)), false);
        assertEquals(List.of("I withdraw 40@1"), bare(drifts));
        assertEquals(beforeLock, store.contents); // preserved while unacknowledged
    }

    @Test
    void reconcileUpdateModeAcceptsDrift() {
        String source = "I withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        MemoryStore store = new MemoryStore();
        Drift.reconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(true)), false);
        assertTrue(Drift.reconcileDrift(store, "w.md", source, varDoc, planOf(source, reg(false)), true)
                .isEmpty());
        Drift.VarLock lock = Drift.parseVarLock(store.contents);
        assertEquals(List.of(), lock.oaths().get("w.md").examples());
    }

    private static final String EXPECTED_LOCK = "{\n"
            + "  \"version\": 2,\n"
            + "  \"oaths\": {\n"
            + "    \"library.md\": {\n"
            + "      \"sourceHash\": \"fnv1a:1a2b3c4d\",\n"
            + "      \"examples\": [\n"
            + "        {\n"
            + "          \"name\": \"I check out\",\n"
            + "          \"line\": 7\n"
            + "        }\n"
            + "      ]\n"
            + "    }\n"
            + "  }\n"
            + "}\n";

    @Test
    void stringifyMatchesTheTypescriptSerializerByteForByte() {
        Drift.VarLock lock = new Drift.VarLock(
                2,
                Map.of(
                        "library.md",
                        new Drift.OathBaseline(
                                "fnv1a:1a2b3c4d", List.of(new Drift.BaselineExample("I check out", 7)))));
        assertEquals(EXPECTED_LOCK, Drift.stringifyVarLock(lock));
    }

    @Test
    void parseRoundTripsAValidLock() {
        Drift.VarLock lock = new Drift.VarLock(
                2,
                Map.of(
                        "library.md",
                        new Drift.OathBaseline(
                                "fnv1a:1a2b3c4d", List.of(new Drift.BaselineExample("I check out", 7)))));
        Drift.VarLock parsed = Drift.parseVarLock(Drift.stringifyVarLock(lock));
        assertEquals("fnv1a:1a2b3c4d", parsed.oaths().get("library.md").sourceHash());
        assertEquals(
                List.of(new Drift.BaselineExample("I check out", 7)),
                parsed.oaths().get("library.md").examples());
    }

    @Test
    void parseRejectsMalformedInput() {
        assertNull(Drift.parseVarLock("not json"));
        assertNull(Drift.parseVarLock("{}"));
        assertNull(Drift.parseVarLock("{\"version\":1,\"oaths\":{}}"));
        assertNull(Drift.parseVarLock("{\"version\":2,\"oaths\":{\"a.md\":{\"examples\":[]}}}"));
    }

    @Test
    void driftMessageNamesTheParagraph() {
        Drift.Drifted d = new Drift.Drifted("I withdraw 40", 1, Span.spanFromOffsets("I withdraw 40.", 0, 13));
        assertTrue(Drift.message(d).contains("I withdraw 40"));
        assertFalse(Drift.message(d).isBlank());
    }

    // ---- Merged examples keep per-paragraph drift granularity (ADR 0012) -------

    private static Registry depositWithdrawReg(boolean withDeposit) {
        Registry r = Registry.createRegistry();
        if (withDeposit) {
            r = Registry.addStep(r, "I deposit {int}", "steps.ts", 1, NOOP_HANDLER, StepKind.STIMULUS);
        }
        r = Registry.addStep(r, "I withdraw {int}", "steps.ts", 2, NOOP_HANDLER, StepKind.STIMULUS);
        return r;
    }

    @Test
    void twoParagraphsThatMergeIntoOneExampleAreEachRecordedAsALiveBaselineEntry() {
        String source = "I deposit 100.\n\nI withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        Plan.ExecutionPlan plan = Plan.plan(varDoc, depositWithdrawReg(true));
        // One planned example (the two paragraphs merged), but two live entries.
        assertEquals(1, plan.examples().size());
        assertEquals(
                List.of(new Drift.BaselineExample("I deposit 100", 1), new Drift.BaselineExample("I withdraw 40", 3)),
                Drift.liveExamples(varDoc, plan));
    }

    @Test
    void deletingOneStepDefOfAMergedExampleDriftsOnlyTheNowProseParagraph() {
        String source = "I deposit 100.\n\nI withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        Drift.OathBaseline baseline =
                Drift.deriveOathBaseline(source, varDoc, Plan.plan(varDoc, depositWithdrawReg(true)));
        // The deposit step is gone: its paragraph becomes prose, splitting the example. The
        // withdraw paragraph is still live; the deposit one drifts.
        List<Drift.Drifted> drift = Drift.detectDrift(baseline, varDoc, Plan.plan(varDoc, depositWithdrawReg(false)));
        assertEquals(List.of("I deposit 100@1"), bare(drift));
    }

    // ---- Pruning baselines for oaths that no longer exist (issue #70) ----

    /**
     * A lock carrying two oaths, one of which the docs globs no longer match — the state a deleted
     * or moved .md leaves behind.
     */
    private static String lockWithStalePath() {
        String source = "I withdraw 40.";
        Ast.VarDoc varDoc = Parse.parse("w.md", source);
        Drift.OathBaseline baseline = Drift.deriveOathBaseline(source, varDoc, Plan.plan(varDoc, reg(true)));
        return Drift.stringifyVarLock(new Drift.VarLock(2, Map.of("varar/w.md", baseline, "w.md", baseline)));
    }

    @Test
    void pruneVarLockKeepsOnlyThePathsItIsGiven() {
        Drift.VarLock lock = Drift.parseVarLock(lockWithStalePath());
        Drift.VarLock pruned = Drift.pruneVarLock(lock, List.of("varar/w.md"));
        assertEquals(List.of("varar/w.md"), new ArrayList<>(pruned.oaths().keySet()));
    }

    @Test
    void pruneReportsStalePathsWithoutUpdateAndDoesNotWrite() {
        MemoryStore store = new MemoryStore();
        store.contents = lockWithStalePath();
        String before = store.contents;

        assertEquals(List.of("w.md"), Drift.pruneBaselines(store, List.of("varar/w.md"), false));
        // Reporting is not deleting: nothing is removed behind the author's back.
        assertEquals(before, store.contents);
    }

    @Test
    void pruneDropsStalePathsUnderUpdate() {
        MemoryStore store = new MemoryStore();
        store.contents = lockWithStalePath();

        assertEquals(List.of("w.md"), Drift.pruneBaselines(store, List.of("varar/w.md"), true));
        assertEquals(
                List.of("varar/w.md"),
                new ArrayList<>(Drift.parseVarLock(store.contents).oaths().keySet()));
    }

    @Test
    void pruneLeavesALockWithNoStalePathsUntouched() {
        MemoryStore store = new MemoryStore();
        store.contents = lockWithStalePath();
        String before = store.contents;

        assertTrue(
                Drift.pruneBaselines(store, List.of("varar/w.md", "w.md"), true).isEmpty());
        // Byte-identical, not merely equivalent — an unnecessary rewrite would show up as a
        // spurious diff in every consumer's working tree.
        assertEquals(before, store.contents);
    }

    @Test
    void pruneIsANoOpWhenThereIsNoBaselineYet() {
        MemoryStore store = new MemoryStore();
        assertTrue(Drift.pruneBaselines(store, List.of("varar/w.md"), true).isEmpty());
        assertNull(store.contents);
    }
}
