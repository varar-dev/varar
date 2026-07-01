package com.oselvar.var.conformance.bundle06;

import com.oselvar.var.Registrar;
import com.oselvar.var.State;
import com.oselvar.var.StateBinder;
import com.oselvar.var.StepDefinitions;

/**
 * Java sibling of {@code echo.steps.ts} / {@code echo.steps.py} (bundle {@code
 * 06-doc-string-mismatch}). The TS/Python originals deliberately return the WRONG
 * string ({@code 'goodbye'}) so the core's doc-string comparison fails at the plan/
 * trace stages; this fixture mirrors that placeholder return (doc-string argument
 * wiring is a later task — see {@code EchoSteps} in {@code 04-tables-and-docstrings}).
 */
public final class EchoSteps implements StepDefinitions {

    record Ctx() implements State {}

    @Override
    public void defineSteps(Registrar registrar) {
        StateBinder<Ctx> s = registrar.defineState(Ctx::new);

        s.sensor("I echo the following:", (Ctx ctx) -> "goodbye");
    }
}
