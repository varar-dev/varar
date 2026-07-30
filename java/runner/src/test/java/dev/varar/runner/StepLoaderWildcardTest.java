package dev.varar.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.Registry;
import dev.varar.runner.StepLoader.LoadedSteps;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The {@code pkg.*} package-wildcard shape of a {@code steps} entry (star-import
 * semantics): every step-definition holder DIRECTLY in the package — both holder shapes
 * {@link StepLoader}'s explicit-FQN path accepts — discovered via the classloader.
 * These tests run against {@code target/test-classes}, i.e. the directory-classpath
 * resolution path; the fixture package {@code dev.varar.runner.wildcard} deliberately
 * mixes in a non-holder class, a nested class ({@code WildAlphaSteps$Ctx}), and a
 * subpackage holder, none of which a star import may pick up.
 */
class StepLoaderWildcardTest {

    private static final ClassLoader LOADER = StepLoaderWildcardTest.class.getClassLoader();

    @Test
    void wildcardResolvesEveryHolderDirectlyInThePackageFromADirectoryClasspath() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of("dev.varar.runner.wildcard.*"), LOADER);

        List<String> expressions = loaded.registry().steps().stream()
                .map(Registry.StepRegistration::expression)
                .toList();
        // WildAlphaSteps (implements StepDefinitions) and WildBetaSteps (static
        // factory) — both holder shapes, and nothing else.
        assertTrue(expressions.contains("wild alpha sets count to {int}"));
        assertTrue(expressions.contains("wild alpha count is {int}"));
        assertTrue(expressions.contains("wild beta sets label to {word}"));
        assertEquals(3, expressions.size(), "exactly the two direct holders' steps");
    }

    @Test
    void mixedPackageContentIsSkippedSilentlyIncludingNestedClassesAndSubpackages() {
        // The package also contains NotStepDefinitions (no holder shape), the nested
        // WildAlphaSteps$Ctx / WildBetaSteps$Ctx class files, and a genuine holder in
        // the subpackage dev.varar.runner.wildcard.sub — a star import includes none
        // of them, and their presence must not fail the load.
        LoadedSteps loaded = StepLoader.loadSteps(List.of("dev.varar.runner.wildcard.*"), LOADER);

        List<String> expressions = loaded.registry().steps().stream()
                .map(Registry.StepRegistration::expression)
                .toList();
        assertTrue(
                expressions.stream().noneMatch(e -> e.equals("sub package step")),
                "subpackage holder must not be star-imported");
        assertEquals(3, expressions.size());
    }

    @Test
    void wildcardLoadedStepsGetWorkingPerFileStateFactories() {
        LoadedSteps loaded = StepLoader.loadSteps(List.of("dev.varar.runner.wildcard.*"), LOADER);

        // The wildcard path must feed the exact same per-file context wiring as
        // explicit FQNs — each holder's expressionSourceFile resolves to ITS state.
        assertNotNull(loaded.createContext().apply("WildAlphaSteps.java"));
        assertNotNull(loaded.createContext().apply("WildBetaSteps.java"));
    }

    @Test
    void wildcardMatchingNoHolderFailsLikeAnUnknownFqn() {
        // The package exists and contains a class — just no step-definition holder.
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class,
                () -> StepLoader.loadSteps(List.of("dev.varar.runner.wildcard.empty.*"), LOADER));
        assertTrue(e.getMessage().contains("step-definition class not found"));
        assertTrue(e.getMessage().contains("dev.varar.runner.wildcard.empty.*"));
    }

    @Test
    void wildcardOnANonexistentPackageFailsLikeAnUnknownFqn() {
        IllegalArgumentException e = assertThrows(
                IllegalArgumentException.class,
                () -> StepLoader.loadSteps(List.of("dev.varar.runner.nosuchpackage.*"), LOADER));
        assertTrue(e.getMessage().contains("step-definition class not found"));
        assertTrue(e.getMessage().contains("dev.varar.runner.nosuchpackage.*"));
    }

    @Test
    void wildcardAndExplicitFqnEntriesMix() {
        LoadedSteps loaded = StepLoader.loadSteps(
                List.of("dev.varar.runner.wildcard.*", dev.varar.runner.fixtures.AlphaSteps.class.getName()), LOADER);

        List<String> expressions = loaded.registry().steps().stream()
                .map(Registry.StepRegistration::expression)
                .toList();
        assertTrue(expressions.contains("wild alpha sets count to {int}"));
        assertTrue(expressions.contains("alpha increments to {int}"));
        assertEquals(5, expressions.size());
    }
}
