package com.oselvar.var.junit;

import com.oselvar.var.core.Plan;
import com.oselvar.var.runner.Discovery;
import com.oselvar.var.runner.Run;
import com.oselvar.var.runner.StepLoader;
import com.oselvar.var.runner.VarConfig;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.platform.engine.DiscoverySelector;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.TestSource;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.discovery.ClasspathResourceSelector;
import org.junit.platform.engine.discovery.DirectorySelector;
import org.junit.platform.engine.discovery.DiscoverySelectors;
import org.junit.platform.engine.discovery.FileSelector;
import org.junit.platform.engine.discovery.UniqueIdSelector;
import org.junit.platform.engine.support.descriptor.ClasspathResourceSource;
import org.junit.platform.engine.support.descriptor.FilePosition;
import org.junit.platform.engine.support.descriptor.FileSource;
import org.junit.platform.engine.support.discovery.SelectorResolver;

/**
 * Resolves the file-shaped selectors that {@code ClasspathRootSelector}/{@code
 * PackageSelector}/{@code ModuleSelector} are reduced to (see {@link
 * DiscoverySelectorResolver}), plus {@code FileSelector}/{@code DirectorySelector} given
 * directly, into one {@link VarFileDescriptor} per {@code .md} resource/file matching {@code
 * config.varsInclude()}/{@code varsExclude()} — ported from {@code
 * cucumber-junit-platform-engine}'s {@code FeatureFileResolver} (classpath-resource case) and
 * {@code FileContainerSelectorResolver} (directory-expansion case), ONE {@code SelectorResolver}
 * covering both because var, unlike Cucumber, has no scenario-outline/rule nesting to warrant
 * splitting concerns across several resolver classes.
 *
 * <p>Filesystem-based selectors ({@link FileSelector}/{@link DirectorySelector}) are relativized
 * against the current working directory (the module's base directory under Maven/Gradle
 * Surefire) since no {@code var.root} configuration key exists yet — flagged as a follow-up if a
 * real caller ever needs a different root.
 *
 * <p><strong>Task 10:</strong> once a resolved selector's {@code specPath}/{@code TestSource} is
 * known, this resolver also reads that file's actual text ({@link #readContent}), plans it against
 * the {@link StepLoader.LoadedSteps} threaded through the constructor (loaded once per discovery
 * pass by {@link VarTestEngine#discover}, not per file — see {@link VarEngineDescriptor}'s
 * javadoc), and adds one {@link VarExampleDescriptor} leaf per {@link Plan.PlannedExample} as a
 * child of the {@link VarFileDescriptor} it creates.
 */
final class VarFileSelectorResolver implements SelectorResolver {

    private final VarConfig config;
    private final StepLoader.LoadedSteps loadedSteps;
    private final Path root = Path.of("").toAbsolutePath().normalize();

    VarFileSelectorResolver(VarConfig config, StepLoader.LoadedSteps loadedSteps) {
        this.config = config;
        this.loadedSteps = loadedSteps;
    }

    /** Whether a classpath resource name (already relative, POSIX-separated) is a spec. */
    boolean matchesSpec(String resourceName) {
        return Discovery.matchSpec(
                Path.of(resourceName), config.varsInclude(), config.varsExclude(), Path.of(""));
    }

    @Override
    public Resolution resolve(ClasspathResourceSelector selector, Context context) {
        String name = selector.getClasspathResourceName();
        if (!matchesSpec(name)) {
            return Resolution.unresolved();
        }
        return toResolution(context, name, ClasspathResourceSource.from(name));
    }

    @Override
    public Resolution resolve(DirectorySelector selector, Context context) {
        Path dir = selector.getPath();
        if (!Files.isDirectory(dir)) {
            return Resolution.unresolved();
        }
        Set<DiscoverySelector> selectors = new HashSet<>();
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.filter(Files::isRegularFile)
                    .filter(p -> p.getFileName().toString().endsWith(".md"))
                    .forEach(p -> selectors.add(DiscoverySelectors.selectFile(p.toFile())));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (selectors.isEmpty()) {
            return Resolution.unresolved();
        }
        return Resolution.selectors(selectors);
    }

    @Override
    public Resolution resolve(FileSelector selector, Context context) {
        Path path = selector.getPath();
        if (!Discovery.matchSpec(path, config.varsInclude(), config.varsExclude(), root)) {
            return Resolution.unresolved();
        }
        String relPath = root.relativize(path.toAbsolutePath().normalize()).toString().replace('\\', '/');
        return toResolution(context, relPath, FileSource.from(path.toFile()));
    }

    /**
     * Round-trips a {@link UniqueIdSelector} for one of our own descriptors (file or example) back
     * into a fresh discovery, so {@code UniqueIdSelector}-only requests (an IDE's "re-run this
     * test" action) work standalone, without an accompanying file/classpath selector.
     *
     * <p>Framework mechanics (confirmed by reading {@code EngineDiscoveryRequestResolution}'s
     * source): a bare {@code UniqueIdSelector} is NOT specially expanded by the platform itself —
     * a {@code SelectorResolver} must explicitly resolve it, or it is left unresolved.
     *
     * <ul>
     *   <li>A file-level {@code UniqueId} (no {@code "example"} segment) round-trips through {@link
     *       #fileSelectorFor}/{@link Context#resolve(DiscoverySelector)} exactly like a direct
     *       file/classpath selector — every example, since selecting the whole file means "run all
     *       of it".
     *   <li>An example-level {@code UniqueId} plans the file (unavoidable — {@code var-core}'s
     *       {@code Plan.plan} is whole-document, not per-example) but adds <strong>only</strong> the
     *       one matching {@link Plan.PlannedExample} as the container's child, via {@link
     *       #createDescriptor(TestDescriptor, String, TestSource, Integer)}'s {@code onlyLine}
     *       filter — so "discover only that one" holds: no sibling leaves appear in the tree, unlike
     *       naively resolving the whole file and picking one descriptor back out of it.
     * </ul>
     *
     * <p><strong>Known narrow limitation</strong> (not exercised by this task's tests, flagged as a
     * follow-up): selecting two <em>different</em> examples from the <em>same</em> file via two bare
     * {@code UniqueIdSelector}s in one request, with no accompanying file/classpath selector, builds
     * two independent single-child {@link VarFileDescriptor} instances for that file rather than
     * merging into one two-child container — because each call plans+filters independently, and the
     * platform's own selector-level dedup (keyed by the file's {@code UniqueId}, populated only from
     * a fully-resolved selector's matches) never observes the file itself as a {@code Match} here.
     * Real callers pair a bare example {@code UniqueIdSelector} with a file/classpath/package
     * selector in practice (see {@code DiscoverySelectorResolverTest}'s note on the same point for
     * the file-container case), which resolves the file once, normally, before this method is ever
     * reached for its examples.
     */
    @Override
    public Resolution resolve(UniqueIdSelector selector, Context context) {
        UniqueId uniqueId = selector.getUniqueId();
        Optional<String> specPath = segmentValue(uniqueId, VarFileDescriptor.SEGMENT_TYPE);
        if (specPath.isEmpty()) {
            return Resolution.unresolved();
        }
        Optional<String> exampleLine = segmentValue(uniqueId, VarExampleDescriptor.SEGMENT_TYPE);
        if (exampleLine.isEmpty()) {
            return context.resolve(fileSelectorFor(specPath.get()))
                    .map(Match::exact)
                    .map(Resolution::match)
                    .orElseGet(Resolution::unresolved);
        }
        return resolveOneExample(context, specPath.get(), exampleLine.get());
    }

    private Resolution resolveOneExample(Context context, String specPath, String lineValue) {
        int line;
        try {
            line = Integer.parseInt(lineValue);
        } catch (NumberFormatException e) {
            return Resolution.unresolved();
        }
        DiscoverySelector fileSelector = fileSelectorFor(specPath);
        if (!matchesFileSelector(fileSelector)) {
            return Resolution.unresolved();
        }
        TestSource source = sourceForSelector(fileSelector);
        Optional<VarFileDescriptor> fileDescriptor =
                context.addToParent(parent -> Optional.of(createDescriptor(parent, specPath, source, line)));
        return fileDescriptor
                .flatMap(fd -> fd.getChildren().stream().findFirst())
                .map(Match::exact)
                .map(Resolution::match)
                .orElseGet(Resolution::unresolved);
    }

    private static Optional<String> segmentValue(UniqueId uniqueId, String segmentType) {
        for (UniqueId.Segment segment : uniqueId.getSegments()) {
            if (segmentType.equals(segment.getType())) {
                return Optional.of(segment.getValue());
            }
        }
        return Optional.empty();
    }

    /**
     * Reconstructs the same selector kind {@link #resolve(FileSelector, Context)}/{@link
     * #resolve(ClasspathResourceSelector, Context)} would have been given for {@code specPath} —
     * a real file on disk (relative to {@link #root}) if one exists there, a classpath resource
     * otherwise (mirrors how a Maven/Gradle test-resource's classpath copy lives under {@code
     * target/test-classes}, NOT under {@code root}, so this check never misclassifies one as the
     * other).
     */
    private DiscoverySelector fileSelectorFor(String specPath) {
        Path candidate = root.resolve(specPath);
        if (Files.isRegularFile(candidate)) {
            return DiscoverySelectors.selectFile(candidate.toFile());
        }
        return DiscoverySelectors.selectClasspathResource(specPath);
    }

    /** The same {@code var.vars.include}/{@code varsExclude()} guard {@link #resolve} methods apply. */
    private boolean matchesFileSelector(DiscoverySelector selector) {
        if (selector instanceof FileSelector fileSelector) {
            return Discovery.matchSpec(fileSelector.getPath(), config.varsInclude(), config.varsExclude(), root);
        }
        if (selector instanceof ClasspathResourceSelector classpathSelector) {
            return matchesSpec(classpathSelector.getClasspathResourceName());
        }
        return false;
    }

    private static TestSource sourceForSelector(DiscoverySelector selector) {
        if (selector instanceof FileSelector fileSelector) {
            return FileSource.from(fileSelector.getPath().toFile());
        }
        if (selector instanceof ClasspathResourceSelector classpathSelector) {
            return ClasspathResourceSource.from(classpathSelector.getClasspathResourceName());
        }
        throw new IllegalStateException("unsupported selector: " + selector);
    }

    private Resolution toResolution(Context context, String specPath, TestSource source) {
        return context.addToParent(parent -> Optional.of(createDescriptor(parent, specPath, source, null)))
                .map(Match::exact)
                .map(Resolution::match)
                .orElseGet(Resolution::unresolved);
    }

    /**
     * Builds one {@link VarFileDescriptor}, planned against {@link #loadedSteps}, with one {@link
     * VarExampleDescriptor} child per {@link Plan.PlannedExample} — or, if {@code onlyLine} is
     * non-{@code null}, only the one example whose {@code span().startLine()} equals it (used by
     * {@link #resolveOneExample} so selecting a single example by {@code UniqueId} doesn't pull its
     * siblings into the discovered tree).
     */
    private VarFileDescriptor createDescriptor(
            TestDescriptor parent, String specPath, TestSource source, Integer onlyLine) {
        UniqueId uniqueId = parent.getUniqueId().append(VarFileDescriptor.SEGMENT_TYPE, specPath);
        String content = readContent(source);
        Plan.ExecutionPlan plan = Run.planSpec(specPath, content, loadedSteps.registry());
        VarFileDescriptor fileDescriptor = new VarFileDescriptor(uniqueId, specPath, source, content, loadedSteps, plan);
        for (Plan.PlannedExample example : plan.examples()) {
            if (onlyLine != null && example.span().startLine() != onlyLine) {
                continue;
            }
            fileDescriptor.addChild(createExampleDescriptor(fileDescriptor, source, example));
        }
        return fileDescriptor;
    }

    private VarExampleDescriptor createExampleDescriptor(
            VarFileDescriptor fileDescriptor, TestSource fileSource, Plan.PlannedExample example) {
        int line = example.span().startLine();
        UniqueId uniqueId =
                fileDescriptor.getUniqueId().append(VarExampleDescriptor.SEGMENT_TYPE, String.valueOf(line));
        return new VarExampleDescriptor(uniqueId, example.name(), withLine(fileSource, line), example);
    }

    /** Returns a copy of {@code fileSource} pointing at {@code line} (1-based), for IDE navigation. */
    private static TestSource withLine(TestSource fileSource, int line) {
        FilePosition position = FilePosition.from(line);
        if (fileSource instanceof ClasspathResourceSource crs) {
            return ClasspathResourceSource.from(crs.getClasspathResourceName(), position);
        }
        if (fileSource instanceof FileSource fs) {
            return FileSource.from(fs.getFile(), position);
        }
        // Every TestSource this resolver ever constructs (toResolution's two call sites) is one
        // of the two cases above; a third kind would be a bug in this class, not a runtime input.
        throw new IllegalStateException("unsupported TestSource: " + fileSource);
    }

    /** Reads a resolved spec's actual text — the classpath-resource or real-file case. */
    private static String readContent(TestSource source) {
        if (source instanceof ClasspathResourceSource crs) {
            return readClasspathResource(crs.getClasspathResourceName());
        }
        if (source instanceof FileSource fs) {
            return readFile(fs.getFile().toPath());
        }
        throw new IllegalStateException("unsupported TestSource: " + source);
    }

    private static String readClasspathResource(String name) {
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        try (InputStream in = loader.getResourceAsStream(name)) {
            if (in == null) {
                throw new UncheckedIOException(new IOException("classpath resource not found: " + name));
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static String readFile(Path path) {
        try {
            return Files.readString(path);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
