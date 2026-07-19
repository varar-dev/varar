package examples;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StateBinder;
import dev.varar.StepDefinitions;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

public final class YahtzeeSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.steps(Ctx::new);

        s.sensor("Examples of dice, category and score", (Ctx ctx, Map<String, String> row) -> {
            List<Integer> dice = Arrays.stream(row.get("dice").split(","))
                    .map(d -> Integer.parseInt(d.trim()))
                    .toList();
            return Map.of("score", Yahtzee.score(dice, row.get("category")));
        });
    }
}
