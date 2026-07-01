package com.oselvar.var.junit;

import com.oselvar.var.core.Plan;
import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.AbstractTestDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * One leaf per {@link Plan.PlannedExample}, a child of the {@link VarFileDescriptor} its example
 * was planned from.
 *
 * <p>{@code UniqueId} segment type {@link #SEGMENT_TYPE} ({@code "example"}), value = {@code
 * example.span().startLine()} as a decimal string — deliberately <strong>not</strong> {@link
 * Plan.PlannedExample#name()} (the display name, derived from the example's Markdown text, shown
 * via {@link #getDisplayName()}). The design doc ({@code
 * docs/superpowers/specs/2026-07-01-java-junit-engine-design.md}) flags this as a hard
 * requirement, not a nice-to-have: a {@code UniqueId} built from wording would change whenever an
 * author edits a sentence without moving the example, silently breaking {@code UniqueIdSelector}
 * re-run-single-test (an IDE's "re-run this test" action round-trips the {@code UniqueId} it
 * captured on a previous run — if that id no longer resolves to the same example, or resolves to
 * a different one, the re-run silently does the wrong thing).
 *
 * <p>{@link #getSource()} is a {@code FileSource}/{@code ClasspathResourceSource} with a {@code
 * FilePosition} at that same {@code startLine()} — {@link Plan.PlannedExample} spans are 1-based
 * (see {@code Span}'s javadoc) and {@code FilePosition} requires line numbers greater than zero
 * (confirmed by reading {@code FilePosition}'s source), so no conversion is needed.
 *
 * <p>Retains the {@link Plan.PlannedExample} itself so a later task (execution — Task 11) can run
 * it; the registry/{@code createContext}/source text it was planned against are reachable via its
 * parent {@link VarFileDescriptor} rather than duplicated here. Does <strong>not</strong> implement
 * {@code execute(...)} yet — {@link Node}'s all-default (no-op) lifecycle makes this a pure
 * pass-through leaf for now, exactly like {@link VarFileDescriptor} before it.
 */
final class VarExampleDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "example";

    private final Plan.PlannedExample example;

    VarExampleDescriptor(UniqueId uniqueId, String displayName, TestSource source, Plan.PlannedExample example) {
        super(uniqueId, displayName, source);
        this.example = example;
    }

    @Override
    public Type getType() {
        return Type.TEST;
    }

    /** The example this leaf was planned from. */
    Plan.PlannedExample example() {
        return example;
    }
}
