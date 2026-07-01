package com.oselvar.var.junit;

import com.oselvar.var.runner.VarConfig;
import org.junit.platform.commons.io.ResourceFilter;
import org.junit.platform.engine.EngineDiscoveryRequest;
import org.junit.platform.engine.support.discovery.DiscoveryIssueReporter;
import org.junit.platform.engine.support.discovery.EngineDiscoveryRequestResolver;

/**
 * Resolves an {@link EngineDiscoveryRequest}'s selectors into one {@link VarFileDescriptor} per
 * matching {@code .md} spec, added as a child of {@link VarEngineDescriptor}.
 *
 * <p>Built on {@code junit-platform-engine}'s real generic selector-resolution machinery
 * ({@link EngineDiscoveryRequestResolver}/{@code SelectorResolver}) rather than hand-dispatching
 * each {@code EngineDiscoveryRequest} selector kind manually — this is exactly what {@code
 * cucumber-junit-platform-engine}'s own {@code DiscoverySelectorResolver} does (confirmed by
 * reading both its source and the real {@code EngineDiscoveryRequestResolver}/{@code
 * SelectorResolver} sources, not assumed): build a resolver via {@code .builder()}, register a
 * handful of {@code SelectorResolver}s, call {@code .build().resolve(request, engineDescriptor,
 * issueReporter)} once. That one call drives a queue-based algorithm (see {@code
 * EngineDiscoveryRequestResolver#resolve}'s javadoc) that tries every registered resolver against
 * every selector — including selectors newly produced by a previous resolver's {@code
 * Resolution.selectors(...)} — until nothing new resolves. This is why a {@code
 * ClasspathRootSelector}/{@code PackageSelector}/{@code ModuleSelector} and a directly-supplied
 * {@code ClasspathResourceSelector}/{@code FileSelector}/{@code DirectorySelector} all end up
 * producing the same {@link VarFileDescriptor} shape without this class dispatching on selector
 * type itself:
 *
 * <ul>
 *   <li>{@code ClasspathRootSelector}/{@code ModuleSelector}/{@code PackageSelector} &rarr;
 *       {@code ClasspathResourceSelector} (candidate {@code .md} resources matching {@code
 *       var.vars.include}/{@code varsExclude()}) — the platform's own built-in {@code
 *       addResourceContainerSelectorResolver(ResourceFilter)}, which performs exactly this
 *       expansion generically (classpath/module/package scanning) for any engine; var supplies
 *       only the {@link ResourceFilter} predicate (delegating to {@code
 *       com.oselvar.var.runner.Discovery.matchSpec}).
 *   <li>{@code ClasspathResourceSelector}/{@code FileSelector}/{@code DirectorySelector} &rarr;
 *       one {@link VarFileDescriptor} (a directory first expands into candidate {@code
 *       FileSelector}s, which the same resolver then re-resolves) &mdash; {@link
 *       VarFileSelectorResolver}.
 * </ul>
 *
 * <p>var's needs are simpler than Cucumber's (no scenario-outline/rule/example nesting), so this
 * is deliberately ONE var-specific {@code SelectorResolver} class rather than Cucumber's several
 * (one per selector-kind concern) — there is no equivalent of Cucumber's separate {@code
 * FeatureWithLinesFileResolver}/{@code FeatureFileResolver} split to preserve.
 *
 * <p><strong>Task 9/10 split:</strong> this resolver creates containers only (one {@link
 * VarFileDescriptor} per matching spec, no children) — it does not parse or plan a file's
 * content into example leaves. That remains a clean, separate next task: nothing about {@code
 * EngineDiscoveryRequestResolver}'s mechanics forces leaf creation into this same pass (unlike
 * Cucumber's {@code FeatureFileResolver}, which must parse eagerly because Gherkin's
 * scenario/rule/outline nesting is discovered structure, not a flat list — var's is a flat list
 * of examples per file, so there is no structural reason to fuse the two tasks).
 *
 * <p>{@code UniqueIdSelector} (re-running a single container by id) is intentionally left
 * unresolved for now: with no children under a {@code VarFileDescriptor} until example leaves
 * exist, there is nothing more specific to round-trip to, and IDEs re-running "this file" already
 * pass a matching {@code ClasspathResourceSelector}/{@code FileSelector} alongside the {@code
 * UniqueIdSelector} in practice. Revisit once example leaves exist (next task).
 */
final class DiscoverySelectorResolver {

    private final EngineDiscoveryRequestResolver<VarEngineDescriptor> resolver;

    DiscoverySelectorResolver(VarConfig config) {
        VarFileSelectorResolver fileSelectorResolver = new VarFileSelectorResolver(config);
        this.resolver =
                EngineDiscoveryRequestResolver.<VarEngineDescriptor>builder()
                        .addResourceContainerSelectorResolver(
                                ResourceFilter.of(resource -> fileSelectorResolver.matchesSpec(resource.getName())))
                        .addSelectorResolver(fileSelectorResolver)
                        .build();
    }

    void resolveSelectors(
            EngineDiscoveryRequest request,
            VarEngineDescriptor engineDescriptor,
            DiscoveryIssueReporter issueReporter) {
        resolver.resolve(request, engineDescriptor, issueReporter);
    }
}
