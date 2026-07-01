package com.oselvar.var.junit;

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
 * <p>This task (discovery selector resolution) creates the container only — it does not parse
 * or plan the file's content, so it has no children yet. Turning the file's content into one
 * leaf {@code VarExampleDescriptor} per example is a later task. Until then, {@link Node}'s
 * all-default (no-op) lifecycle is exactly right: an empty container that executes as a pure
 * pass-through.
 */
final class VarFileDescriptor extends AbstractTestDescriptor implements Node<VarEngineExecutionContext> {

    static final String SEGMENT_TYPE = "spec";

    VarFileDescriptor(UniqueId uniqueId, String specPath, TestSource source) {
        super(uniqueId, specPath, source);
    }

    @Override
    public Type getType() {
        return Type.CONTAINER;
    }
}
