package examples;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StateBinder;
import dev.varar.StepDefinitions;

public final class DeepThoughtSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.steps(Ctx::new);

        s.sensor("life, the universe and everything is {int}", (Ctx ctx, Integer answer) -> 42);
    }
}
