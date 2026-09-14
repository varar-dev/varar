package dev.varar.conformance.bundle22;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;

/** Java sibling of {@code library.steps.ts} / {@code library.steps.py} (bundle {@code 22-reference-ambiguous-anchor}). */
public final class LibrarySteps implements StepDefinitions<LibrarySteps.Ctx> {

    record Ctx(int shelf) implements State {}

    @Override
    public void register(Steps<Ctx> s) {
        s.state(() -> new Ctx(0));

        s.stimulus("I shelve {int} books", (Ctx ctx, Integer n) -> new Ctx(ctx.shelf() + n));

        s.stimulus("I borrow a book", (Ctx ctx) -> new Ctx(ctx.shelf() - 1));

        s.sensor("The shelf holds {int} books", (Ctx ctx, Integer n) -> ctx.shelf());
    }
}
