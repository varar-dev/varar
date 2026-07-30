package dev.varar.junit;

import dev.varar.config.Config;
import dev.varar.core.Drift;
import dev.varar.runner.BaselineStores;
import dev.varar.runner.Discovery;
import dev.varar.runner.StepLoader;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.junit.platform.engine.EngineDiscoveryRequest;
import org.junit.platform.engine.ExecutionRequest;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.discovery.DiscoveryIssueReporter;
import org.junit.platform.engine.support.hierarchical.HierarchicalTestEngine;

/**
 * The var {@link org.junit.platform.engine.TestEngine TestEngine} (id {@code "varar"}).
 *
 * <p>Registered via {@code META-INF/services/org.junit.platform.engine.TestEngine} —
 * installing the {@code var-junit} dependency is the entire integration story; no user
 * wiring is required (mirrors {@code var-pytest}'s {@code pytest11} entry-point
 * ergonomics). See {@code doc/adr/0003-java-junit-integration.md}.
 *
 * <p>{@link #discover} loads every {@code steps} class named by varar.config.json exactly once per
 * discovery pass ({@link StepLoader#loadSteps}, mirroring Python's {@code pytest_configure}) —
 * cached on the returned {@link OathEngineDescriptor} — then resolves the request's selectors
 * ({@link DiscoverySelectorResolver}) into one {@link OathFileDescriptor} container per {@code .md}
 * oath matching {@code docsInclude}/{@code docsExclude} ({@link ConfigBridge}), each with one
 * {@link ExampleDescriptor} leaf per {@link dev.varar.core.Plan.PlannedExample} planned
 * against that shared, merged registry. It does not yet execute anything (Task 11).
 */
public final class OathTestEngine extends HierarchicalTestEngine<OathEngineExecutionContext> {

    @Override
    public String getId() {
        return "varar";
    }

    @Override
    public TestDescriptor discover(EngineDiscoveryRequest discoveryRequest, UniqueId uniqueId) {
        OathEngineDescriptor engineDescriptor = new OathEngineDescriptor(uniqueId);
        Config config = ConfigBridge.fromConfigurationParameters(discoveryRequest.getConfigurationParameters());
        StepLoader.LoadedSteps loadedSteps =
                StepLoader.loadSteps(config.steps(), Thread.currentThread().getContextClassLoader());
        engineDescriptor.setLoadedSteps(loadedSteps);
        DiscoveryIssueReporter issueReporter =
                DiscoveryIssueReporter.forwarding(discoveryRequest.getDiscoveryListener(), uniqueId);
        Path root = ConfigBridge.rootFrom(discoveryRequest.getConfigurationParameters());
        new DiscoverySelectorResolver(config, root, loadedSteps)
                .resolveSelectors(discoveryRequest, engineDescriptor, issueReporter);
        pruneStaleBaselines(engineDescriptor, config, root);
        return engineDescriptor;
    }

    /**
     * Drops baselines for oaths the config no longer discovers. Reconciliation is per-oath and never
     * sees a path that has gone, so {@code varar.lock.json} would otherwise accumulate dead entries
     * forever (issue #70). Once per discovery pass, here rather than in the resolver, which runs per
     * selector.
     *
     * <p>The kept set is the union of two views, because this engine discovers oaths two ways and
     * neither alone is complete:
     *
     * <ul>
     *   <li>the <strong>filesystem</strong> walk of the {@code docs} globs under {@code root} — the
     *       full set regardless of how narrowly the request was scoped, which is what makes an IDE's
     *       single-example re-run safe to prune from;
     *   <li>the oaths <strong>actually resolved</strong> in this request — which is how a
     *       classpath-resource oath (one that is on the classpath but not under {@code root} on
     *       disk) stays in the lock.
     * </ul>
     *
     * <p>A union can only ever keep more, never less. And if the filesystem walk finds nothing at
     * all, this bails out entirely: {@code root} is then not a project directory we understand, and
     * pruning on that basis could delete every live baseline.
     */
    private static void pruneStaleBaselines(OathEngineDescriptor engineDescriptor, Config config, Path root) {
        List<Path> onDisk = Discovery.findOaths(config.docsInclude(), config.docsExclude(), root);
        if (onDisk.isEmpty()) {
            return;
        }
        Set<String> keep = new LinkedHashSet<>();
        for (Path oath : onDisk) {
            keep.add(root.toAbsolutePath()
                    .normalize()
                    .relativize(oath.toAbsolutePath().normalize())
                    .toString()
                    .replace('\\', '/'));
        }
        for (TestDescriptor child : engineDescriptor.getChildren()) {
            if (child instanceof OathFileDescriptor fileDescriptor) {
                keep.add(fileDescriptor.oathPath());
            }
        }
        Drift.pruneBaselines(BaselineStores.file(root.toAbsolutePath().normalize()), keep, updateMode());
    }

    /** Same acknowledgment switch the resolver honours: {@code -Dvarar.update} / {@code VARAR_UPDATE}. */
    private static boolean updateMode() {
        return "true".equals(System.getProperty("varar.update"))
                || "1".equals(System.getenv("VARAR_UPDATE"))
                || "true".equals(System.getenv("VARAR_UPDATE"));
    }

    @Override
    protected OathEngineExecutionContext createExecutionContext(ExecutionRequest request) {
        return new OathEngineExecutionContext(request.getEngineExecutionListener());
    }
}
