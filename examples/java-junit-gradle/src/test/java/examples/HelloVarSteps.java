package examples;

import dev.varar.Registrar;
import dev.varar.State;
import dev.varar.StateBinder;
import dev.varar.StepDefinitions;

public final class HelloVarSteps implements StepDefinitions {

    record Ctx(String greeting, int result) implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.steps(() -> new Ctx("", 0));

        s.stimulus("I greet {string}", (Ctx ctx, String name) -> new Ctx("Hello, " + name + "!", ctx.result()));
        s.sensor("the greeting should be {string}", (Ctx ctx, String expected) -> ctx.greeting());
        s.stimulus("expression `{int}+{int}`", (Ctx ctx, Integer a, Integer b) -> new Ctx(ctx.greeting(), a + b));
        s.sensor("evaluate to `{int}`", (Ctx ctx, Integer expected) -> ctx.result());
    }
}
