package dev.varar.runner.wildcard.empty;

/**
 * Wildcard fixture: the only class in a package that contains NO step-definition
 * holder at all, so {@code dev.varar.runner.wildcard.empty.*} is a wildcard that
 * matches nothing — which must fail the same way an unknown FQN does.
 */
public final class NoHoldersHere {

    public int nothing() {
        return 0;
    }
}
