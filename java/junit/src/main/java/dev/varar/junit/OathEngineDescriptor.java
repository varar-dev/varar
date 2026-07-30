package dev.varar.junit;

import dev.varar.runner.StepLoader;
import java.util.function.Consumer;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.EngineDescriptor;
import org.junit.platform.engine.support.hierarchical.Node;

/**
 * Root descriptor for the var {@link org.junit.platform.engine.TestEngine TestEngine}.
 *
 * <p>Holds the session-scoped {@link StepLoader.LoadedSteps} that {@link OathTestEngine#discover}
 * builds exactly once per discovery pass (before resolving any file selectors — mirrors Python's
 * {@code pytest_configure}), so every {@link OathFileDescriptor}/{@link ExampleDescriptor}
 * planned during that same pass shares one merged {@code Registry} rather than each file
 * reloading+recompiling every step class's expressions from scratch.
 *
 * <p>The {@code ifChildren} guard is ported now anyway, ahead of need, mirroring {@code
 * CucumberEngineDescriptor}: the JUnit Platform always executes every engine that participated in
 * discovery, and in combination with the JUnit Platform Suite Engine this can invoke an engine's
 * lifecycle hooks more than once with nothing to run. Once this descriptor's lifecycle hooks grow
 * real engine-level setup/teardown work (execution — Task 11), that work added to {@link
 * #prepare}/{@link #before}/{@link #after}/{@link #cleanUp} should only happen when there's
 * actually something to execute.
 */
final class OathEngineDescriptor extends EngineDescriptor implements Node<OathEngineExecutionContext> {

    private StepLoader.LoadedSteps loadedSteps;

    OathEngineDescriptor(UniqueId uniqueId) {
        super(uniqueId, "varar");
    }

    /** Set once by {@link OathTestEngine#discover}, before resolving any file selectors. */
    void setLoadedSteps(StepLoader.LoadedSteps loadedSteps) {
        this.loadedSteps = loadedSteps;
    }

    /** The session-scoped, once-per-discovery-pass merged steps ({@code null} before discovery). */
    StepLoader.LoadedSteps loadedSteps() {
        return loadedSteps;
    }

    @Override
    public OathEngineExecutionContext prepare(OathEngineExecutionContext context) {
        return ifChildren(context, c -> {});
    }

    @Override
    public OathEngineExecutionContext before(OathEngineExecutionContext context) {
        return ifChildren(context, c -> {});
    }

    @Override
    public void after(OathEngineExecutionContext context) {
        ifChildren(context, c -> {});
    }

    @Override
    public void cleanUp(OathEngineExecutionContext context) {
        ifChildren(context, c -> {});
    }

    private OathEngineExecutionContext ifChildren(
            OathEngineExecutionContext context, Consumer<OathEngineExecutionContext> action) {
        if (!getChildren().isEmpty()) {
            action.accept(context);
        }
        return context;
    }
}
