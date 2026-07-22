package dev.varar.conformance.bundle11;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import java.util.List;

/**
 * Java sibling of {@code greet.steps.ts} / {@code greet.steps.py} (bundle {@code
 * 11-emoji-offsets}) — proves UTF-16 span offsets survive astral characters (emoji)
 * in the example prose.
 *
 * <p>The {@code example.md}'s trailing table (headers {@code Café}/{@code 日本語}) isn't
 * header-bound (neither header cell appears as a word in "I greet ..."), so {@code Plan}
 * attaches it to this step as a plain trailing data table. That makes two slots — the
 * {@code {string}} capture and the table — and a sensor with slots must return one value
 * per slot, so both are echoed back. Only the table's data rows are returned: the header
 * row is labels and is never compared.
 */
public final class GreetSteps implements StepDefinitions<GreetSteps.Ctx> {

    record Ctx() implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(Ctx::new);

        s.sensor(
                "I greet {string}",
                (Ctx ctx, String name, List<List<String>> table) ->
                        List.of(name, table.subList(1, table.size())));
    }
}
