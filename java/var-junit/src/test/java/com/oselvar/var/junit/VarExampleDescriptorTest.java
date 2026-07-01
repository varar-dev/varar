package com.oselvar.var.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectClasspathResource;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectFile;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectUniqueId;

import com.oselvar.var.junit.fixtures.WidgetSteps;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.platform.engine.TestDescriptor;
import org.junit.platform.engine.UniqueId;
import org.junit.platform.engine.support.descriptor.ClasspathResourceSource;
import org.junit.platform.engine.support.descriptor.FilePosition;
import org.junit.platform.engine.support.descriptor.FileSource;
import org.junit.platform.testkit.engine.EngineDiscoveryResults;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Proves Task 10's leaf descriptor tree: one {@link VarExampleDescriptor} per {@code
 * Plan.PlannedExample}, a {@link TestDescriptor.Type#TEST} child of its {@link
 * VarFileDescriptor}, with a {@code UniqueId} keyed by the example's source line — not its
 * Markdown-derived display name.
 *
 * <p><strong>Uses the real {@code EngineTestKit.engine("var")...discover()} path</strong>
 * (unlike {@code DiscoverySelectorResolverTest}, which had to call {@link
 * VarTestEngine#discover} directly to dodge the Launcher's {@code
 * EngineDiscoveryOrchestrator}, which {@linkplain TestDescriptor#prune() prunes} every
 * non-root, childless container after discovery — Task 9's containers had no children yet).
 * Confirmed here: now that every {@link VarFileDescriptor} gets at least one {@link
 * VarExampleDescriptor} child, it is never pruned, so the ordinary, realistic {@code
 * EngineTestKit} entry point works cleanly — Task 9's pruning finding is resolved by this task,
 * as the plan predicted.
 */
class VarExampleDescriptorTest {

    private static final String STEPS = WidgetSteps.class.getName();

    private static EngineDiscoveryResults discoverWidgets() {
        return EngineTestKit.engine("var")
                .selectors(selectClasspathResource("examplefixture/widgets.md"))
                .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                .configurationParameter("var.steps", STEPS)
                .discover();
    }

    private static TestDescriptor onlyFileDescriptor(TestDescriptor engineDescriptor) {
        List<? extends TestDescriptor> children = List.copyOf(engineDescriptor.getChildren());
        assertEquals(1, children.size(), "expected exactly one spec container");
        return children.get(0);
    }

    @Test
    void twoExampleFileDiscoversTwoLeavesWithLineBasedUniqueIdsAndSource() {
        TestDescriptor engineDescriptor = discoverWidgets().getEngineDescriptor();
        TestDescriptor fileDescriptor = onlyFileDescriptor(engineDescriptor);
        assertEquals(TestDescriptor.Type.CONTAINER, fileDescriptor.getType());

        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(2, examples.size(), "widgets.md has two step-matched examples");

        // examplefixture/widgets.md: "I have 3 widgets. ..." starts on line 3, "I have 9
        // widgets. ..." on line 7 (confirmed directly against Run.planSpec's own
        // PlannedExample#span#startLine for this exact file content, not guessed).
        assertExampleLeaf(examples.get(0), 3);
        assertExampleLeaf(examples.get(1), 7);
    }

    private static void assertExampleLeaf(TestDescriptor example, int expectedLine) {
        assertEquals(TestDescriptor.Type.TEST, example.getType());

        UniqueId.Segment lastSegment = example.getUniqueId().getLastSegment();
        assertEquals("example", lastSegment.getType());
        assertEquals(String.valueOf(expectedLine), lastSegment.getValue());

        FilePosition position =
                example.getSource()
                        .map(source -> {
                            if (source instanceof ClasspathResourceSource crs) {
                                return crs.getPosition().orElse(null);
                            }
                            if (source instanceof FileSource fs) {
                                return fs.getPosition().orElse(null);
                            }
                            return null;
                        })
                        .orElse(null);
        assertEquals(FilePosition.from(expectedLine), position);
    }

    @Test
    void selectingOneLeafByUniqueIdDiscoversOnlyThatOne() {
        TestDescriptor wholeFileEngine = discoverWidgets().getEngineDescriptor();
        TestDescriptor fileDescriptor = onlyFileDescriptor(wholeFileEngine);
        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        TestDescriptor targetLeaf = examples.get(0);
        TestDescriptor otherLeaf = examples.get(1);
        assertNotEquals(targetLeaf.getUniqueId(), otherLeaf.getUniqueId());

        EngineDiscoveryResults singleSelection =
                EngineTestKit.engine("var")
                        .selectors(selectUniqueId(targetLeaf.getUniqueId()))
                        .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                        .configurationParameter("var.steps", STEPS)
                        .discover();

        TestDescriptor engineDescriptor = singleSelection.getEngineDescriptor();
        TestDescriptor selectedFile = onlyFileDescriptor(engineDescriptor);
        List<? extends TestDescriptor> selectedExamples = List.copyOf(selectedFile.getChildren());

        assertEquals(1, selectedExamples.size(), "selecting one example's UniqueId must not pull in its siblings");
        assertEquals(targetLeaf.getUniqueId(), selectedExamples.get(0).getUniqueId());
    }

    @Test
    void uniqueIdIsLineBasedNotNameBased() {
        // Same step-bearing paragraph position (line 3 in both files), deliberately different
        // leading narration ("Setup complete. ") so Plan's deriveExampleName (first sentence of
        // the example's body) differs between the two files -- proving the UniqueId tracks the
        // example's *position*, not its Markdown-derived display text (the exact risk the design
        // doc flags: an author editing wording must not change a UniqueId, or UniqueIdSelector
        // re-run-single-test silently breaks).
        TestDescriptor wordingA = discoverOneFile("examplefixture/wording-a.md");
        TestDescriptor wordingB = discoverOneFile("examplefixture/wording-b.md");

        TestDescriptor exampleA = onlyExample(wordingA);
        TestDescriptor exampleB = onlyExample(wordingB);

        assertNotEquals(
                exampleA.getDisplayName(),
                exampleB.getDisplayName(),
                "sanity check: the fixtures really do produce different display names");
        assertEquals(
                exampleA.getUniqueId().getLastSegment(),
                exampleB.getUniqueId().getLastSegment(),
                "the \"example\" UniqueId segment (line-based) must be identical despite the wording change");
        assertEquals("3", exampleA.getUniqueId().getLastSegment().getValue());
    }

    private static TestDescriptor discoverOneFile(String classpathResource) {
        EngineDiscoveryResults results =
                EngineTestKit.engine("var")
                        .selectors(selectClasspathResource(classpathResource))
                        .configurationParameter("var.vars.include", "examplefixture/**/*.md")
                        .configurationParameter("var.steps", STEPS)
                        .discover();
        return onlyFileDescriptor(results.getEngineDescriptor());
    }

    private static TestDescriptor onlyExample(TestDescriptor fileDescriptor) {
        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(1, examples.size());
        return examples.get(0);
    }

    @Test
    void noSelectorsMatchWhenIncludeIsEmpty() {
        // Same guarantee as Task 9's discovery-level test, still true now that files get real
        // children: an empty var.vars.include must discover nothing at all, not merely "no
        // examples inside an empty container".
        EngineDiscoveryResults results =
                EngineTestKit.engine("var")
                        .selectors(selectClasspathResource("examplefixture/widgets.md"))
                        .configurationParameter("var.steps", STEPS)
                        .discover();
        assertTrue(results.getEngineDescriptor().getChildren().isEmpty());
    }

    @Test
    void fileDescriptorTypeIsStillContainer() {
        TestDescriptor fileDescriptor = discoverOneFile("examplefixture/widgets.md");
        assertInstanceOf(TestDescriptor.class, fileDescriptor);
        assertEquals(TestDescriptor.Type.CONTAINER, fileDescriptor.getType());
    }

    /**
     * {@code DiscoverySelectorResolverTest} only ever exercises the classpath-resource branch
     * (via {@code selectPackage} &rarr; {@code ClasspathResourceSelector}); a real {@code
     * FileSelector} — Maven Surefire's own default when it walks {@code src/test/resources}
     * directly, and what an IDE passes for "run this file" on a plain filesystem path — hits an
     * entirely different branch in {@code VarFileSelectorResolver} ({@code readFile}/{@code
     * FileSource}, not {@code readClasspathResource}/{@code ClasspathResourceSource}). This test
     * exercises that branch directly, so it isn't accidentally only proven for classpath
     * resources.
     */
    @Test
    void realFileSelectorAlsoProducesLeavesWithFileSourcePositions() {
        Path widgetsFile = Path.of("src/test/resources/examplefixture/widgets.md").toAbsolutePath();
        assertTrue(Files.isRegularFile(widgetsFile), "fixture must exist on disk for this FileSelector-based test");

        EngineDiscoveryResults results =
                EngineTestKit.engine("var")
                        .selectors(selectFile(widgetsFile.toFile()))
                        .configurationParameter("var.vars.include", "src/test/resources/examplefixture/**/*.md")
                        .configurationParameter("var.steps", STEPS)
                        .discover();

        TestDescriptor fileDescriptor = onlyFileDescriptor(results.getEngineDescriptor());
        assertInstanceOf(FileSource.class, fileDescriptor.getSource().orElseThrow());

        List<? extends TestDescriptor> examples = List.copyOf(fileDescriptor.getChildren());
        assertEquals(2, examples.size());
        assertExampleLeaf(examples.get(0), 3);
        assertExampleLeaf(examples.get(1), 7);

        // The bare-UniqueId single-leaf-selection path must also exclude siblings for a real
        // (non-classpath) file, not just the classpath-resource case tested above.
        UniqueId targetId = examples.get(0).getUniqueId();
        EngineDiscoveryResults singleSelection =
                EngineTestKit.engine("var")
                        .selectors(selectUniqueId(targetId))
                        .configurationParameter("var.vars.include", "src/test/resources/examplefixture/**/*.md")
                        .configurationParameter("var.steps", STEPS)
                        .discover();
        TestDescriptor selectedFile = onlyFileDescriptor(singleSelection.getEngineDescriptor());
        assertEquals(1, selectedFile.getChildren().size());
        assertEquals(targetId, selectedFile.getChildren().iterator().next().getUniqueId());
    }
}
