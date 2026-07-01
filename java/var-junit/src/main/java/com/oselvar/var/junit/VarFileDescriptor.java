package com.oselvar.var.junit;

import com.oselvar.var.core.Plan;
import com.oselvar.var.runner.StepLoader;
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
 * added per {@link Plan.PlannedExample} in {@link Plan.ExecutionPlan#examples()}; execution (Task
 * 11) reaches this data either straight from an example leaf's parent, or via {@link #plan()}/
 * {@link #loadedSteps()}/{@link #content()} directly. Until execution lands, {@link Node}'s
 * all-default (no-op) lifecycle is exactly right: a pure pass-through container.
 */
final class VarFileDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "spec";

    private final String content;
    private final StepLoader.LoadedSteps loadedSteps;
    private final Plan.ExecutionPlan plan;

    VarFileDescriptor(
            UniqueId uniqueId,
            String specPath,
            TestSource source,
            String content,
            StepLoader.LoadedSteps loadedSteps,
            Plan.ExecutionPlan plan) {
        super(uniqueId, specPath, source);
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

    /** The session-scoped, once-per-discovery-pass merged steps this file was planned against. */
    StepLoader.LoadedSteps loadedSteps() {
        return loadedSteps;
    }

    /** The {@code var-core} plan this file's children ({@link VarExampleDescriptor}) were built from. */
    Plan.ExecutionPlan plan() {
        return plan;
    }
}
