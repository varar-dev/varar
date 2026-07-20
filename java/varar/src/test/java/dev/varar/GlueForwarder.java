package dev.varar;

/**
 * Test double for a registration-forwarding layer (what var-kotlin's StepsScope
 * is in production): annotated {@link StepsGlue}, so {@link Steps}'s
 * StackWalker must skip its frames and attribute the registration to THIS class's
 * caller, not this class.
 */
@StepsGlue
final class GlueForwarder {

    private GlueForwarder() {}

    record Ctx() implements State {}

    static void forwardAction(Steps<Ctx> binder, String expression) {
        binder.stimulus(expression, (Ctx ctx) -> ctx);
    }
}
