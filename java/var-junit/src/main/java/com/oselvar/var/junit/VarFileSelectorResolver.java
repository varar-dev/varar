package com.oselvar.var.junit;

import com.oselvar.var.runner.Discovery;
import com.oselvar.var.runner.VarConfig;
import java.io.IOException;
import java.io.UncheckedIOException;
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
import org.junit.platform.engine.support.descriptor.ClasspathResourceSource;
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
 */
final class VarFileSelectorResolver implements SelectorResolver {

    private final VarConfig config;
    private final Path root = Path.of("").toAbsolutePath().normalize();

    VarFileSelectorResolver(VarConfig config) {
        this.config = config;
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

    private Resolution toResolution(Context context, String specPath, TestSource source) {
        return context.addToParent(parent -> Optional.of(createDescriptor(parent, specPath, source)))
                .map(Match::exact)
                .map(Resolution::match)
                .orElseGet(Resolution::unresolved);
    }

    private VarFileDescriptor createDescriptor(TestDescriptor parent, String specPath, TestSource source) {
        UniqueId uniqueId = parent.getUniqueId().append(VarFileDescriptor.SEGMENT_TYPE, specPath);
        return new VarFileDescriptor(uniqueId, specPath, source);
    }
}
