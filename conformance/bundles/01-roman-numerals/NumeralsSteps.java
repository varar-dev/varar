package dev.varar.conformance.bundle01;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.Map;

/**
 * Java sibling of {@code numerals.steps.ts} / {@code numerals.steps.py} (bundle
 * {@code 01-roman-numerals}). See {@code java/varar/src/test/java/dev/varar/
 * AuthorApiTest.java}'s {@code RomanNumeralSteps} for the hand-authored prototype this
 * fixture is adapted from — this is the real, conformance-harness-loaded copy.
 *
 * <p>Fixture-layout note (Task 13): this file lives under the language-neutral
 * conformance corpus (a sibling of every {@code *.steps.ts}/{@code *.steps.py} in this
 * directory), not under {@code var}'s {@code src/}. It reaches the test compile
 * classpath via {@code build-helper-maven-plugin}'s {@code add-test-source} goal
 * configured in {@code java/varar/pom.xml}, which adds {@code conformance/bundles}
 * as an additional test-source root — Maven's compiler plugin does not require a
 * source file's directory to match its package declaration, only that the directory be
 * a configured source root.
 */
public final class NumeralsSteps implements StepDefinitions<NumeralsSteps.Ctx> {

    record Ctx(String result) implements State {}

    private static final Map<Integer, String> ROMAN = Map.of(1, "I", 4, "IV", 9, "IX", 40, "XL");

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(null));

        s.stimulus(
                "I convert {int} to roman numerals",
                (Ctx ctx, Integer n) -> new Ctx(ROMAN.get(n)));

        // The trailing "." is matched literally, so {word} captures just the
        // numeral and this sensor returns the observed value for the core.
        s.sensor("The result is {word}.", (Ctx ctx, String expected) -> ctx.result());
    }
}
