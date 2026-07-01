package com.oselvar.var.conformance.bundle04;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Java sibling of {@code echo.steps.ts} / {@code echo.steps.py} (bundle {@code
 * 04-tables-and-docstrings}).
 *
 * <p>The TS/Python originals receive the doc string as a trailing argument after the
 * expression's own captures ({@code (ctx, doc) => [doc]}) and return it so the pure
 * core's {@code compareDocString} can check it against the source doc string. The
 * Java author API's trailing data-table/doc-string argument is wired in a later task
 * (see {@code StateBinder}'s javadoc) — this fixture only needs to register the
 * expression correctly for the registry stage, so the sensor body is a placeholder
 * until execution lands.
 */
public final class EchoSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.sensor("I echo the following:", (Ctx ctx) -> null);
    }
}
