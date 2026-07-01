package com.oselvar.var.junit;

import com.oselvar.var.core.Plan;
import com.oselvar.var.runner.Run;
import com.oselvar.var.runner.StepLoader;
import java.util.List;
import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.AbstractTestDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * One container per discovered {@code .md} spec resource/file.
 *
 * <p>{@code UniqueId} segment type {@link #SEGMENT_TYPE} ({@code "spec"}), value = the
 * resource's relative path, POSIX-separated (mirrors {@code
 * cucumber-junit-platform-engine}'s {@code "feature"} segment). The display name is the same
 * relative path.
 *
 * <p>Carries this file's resolved source text, the session-scoped {@link StepLoader.LoadedSteps}
 * it was planned against, and the resulting {@link Plan.ExecutionPlan} — all read/computed once,
 * by {@link VarFileSelectorResolver}, at discovery time. One {@link VarExampleDescriptor} child is
 * added per {@link Plan.PlannedExample} in {@link Plan.ExecutionPlan#examples()}; execution reaches
 * this data either straight from an example leaf's parent, or via {@link #plan()}/{@link
 * #loadedSteps()}/{@link #content()} directly.
 *
 * <h2>Execution (Task 11)</h2>
 *
 * <p>{@link Run#examplesWithRuns} is called exactly ONCE per file, in {@link #before}, and its
 * result cached in {@link #exampleRuns} — mirroring how {@link StepLoader#loadSteps} is cached
 * once-per-discovery-pass (Task 10), rather than re-planning/re-collecting per leaf. {@link
 * Node}'s contract guarantees {@link #before} completes, for this whole container, strictly
 * before any child's {@code execute()} runs (even under parallel execution, which this engine
 * doesn't enable yet, but a sibling's own state is never touched by this caching — see {@link
 * #runFor}'s javadoc) — so the one-time computation here is race-free without extra
 * synchronization. Each {@link VarExampleDescriptor} leaf looks its own {@link Run.ExampleRun} up
 * from this cached list via {@link #runFor}, keyed by {@link Plan.PlannedExample} equality (a
 * {@code record}, so value-based) rather than re-deriving anything at execution time.
 */
final class VarFileDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "spec";

    private final String specPath;
    private final String content;
    private final StepLoader.LoadedSteps loadedSteps;
    private final Plan.ExecutionPlan plan;

    /** Populated once by {@link #before}, before any child's {@code execute()} runs. */
    private List<Run.ExampleRun> exampleRuns;

    VarFileDescriptor(
            UniqueId uniqueId,
            String specPath,
            TestSource source,
            String content,
            StepLoader.LoadedSteps loadedSteps,
            Plan.ExecutionPlan plan) {
        super(uniqueId, specPath, source);
        this.specPath = specPath;
        this.content = content;
        this.loadedSteps = loadedSteps;
        this.plan = plan;
    }

    @Override
    public Type getType() {
        return Type.CONTAINER;
    }

    /** This file's raw source text, as read at discovery time. */
    String content() {
        return content;
    }

    /**
     * This file's path, exactly as passed to {@link Run#planSpec} at discovery time — the same
     * string an injected failure stack frame's {@code fileName} carries, so it must be passed
     * unchanged to {@code Render.renderFailure} for {@code Failure.toFailure}'s failing-line
     * lookup to find it.
     */
    String specPath() {
        return specPath;
    }

    /** The session-scoped, once-per-discovery-pass merged steps this file was planned against. */
    StepLoader.LoadedSteps loadedSteps() {
        return loadedSteps;
    }

    /** The {@code var-core} plan this file's children ({@link VarExampleDescriptor}) were built from. */
    Plan.ExecutionPlan plan() {
        return plan;
    }

    @Override
    public VarEngineExecutionContext before(VarEngineExecutionContext context) {
        // Run.examplesWithRuns only zips plan.examples() with the lazy Runnables
        // Execute.collectExamples produces — no example actually runs here; each Runnable
        // creates its own fresh per-(example, file) state when IT is invoked (see
        // Execute.runExample), so caching this list introduces no shared mutable state
        // between examples, in or out of document order.
        exampleRuns = Run.examplesWithRuns(plan, loadedSteps.createContext(), new Run.RecordingReporter());
        return context;
    }

    /**
     * The {@link Run.ExampleRun} planned for {@code example}, looked up from the list {@link
     * #before} cached once for this whole file — never recomputed per leaf. {@code example} is
     * matched by {@code equals()} against {@link Run.ExampleRun#example()}: {@link
     * Plan.PlannedExample} is a plain {@code record}, so this is a value comparison, robust
     * whether or not the two sides happen to be the same object reference.
     *
     * @throws IllegalStateException if called before {@link #before}, or with an {@code example}
     *     this file's plan never produced (both would be this engine's own bug, not a runtime
     *     input to defend against).
     */
    Runnable runFor(Plan.PlannedExample example) {
        if (exampleRuns == null) {
            throw new IllegalStateException("runFor() called before before(): " + specPath);
        }
        for (Run.ExampleRun run : exampleRuns) {
            if (run.example().equals(example)) {
                return run.run();
            }
        }
        throw new IllegalStateException("no ExampleRun found for " + example + " in " + specPath);
    }
}
