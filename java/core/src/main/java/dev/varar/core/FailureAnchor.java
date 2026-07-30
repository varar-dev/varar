package dev.varar.core;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Where a failure POINTS in the {@code .md}: a mismatch anchors at its first failing span (the
 * cell, the doc string fence body), anything else at the fallback — the step's match start.
 *
 * <p>Port of {@code var-core/src/failure-anchor.ts}. This rule is the single source of truth
 * for failure locations: the executor's stack augmentation renders it per-runtime, and the
 * conformance trace pins it as {@code failure.anchor}, so every language port must reproduce
 * it byte-for-byte.
 */
final class FailureAnchor {
    private FailureAnchor() {}

    static Span anchor(Throwable error, Span fallback) {
        if (CellDiff.isCellMismatchException(error)) {
            for (CellDiff c : ((CellDiff.CellMismatchException) error).cells()) {
                if (!c.ok()) return c.span();
            }
            return fallback;
        }
        return fallback;
    }

    /**
     * The anchor has to travel with the thrown exception, from the executor (which knows the step)
     * to {@link Failure#toFailure} (which only sees the exception). TS hangs it on the Error under
     * a global symbol; a Java {@link Throwable} takes no extra fields, so this side table does the
     * same job. Weak keys, so remembering an anchor can never keep an exception alive;
     * synchronized, because a suite may run examples on several threads.
     */
    private static final Map<Throwable, Span> ATTACHED = Collections.synchronizedMap(new WeakHashMap<>());

    static void attach(Throwable error, Span anchor) {
        if (error != null) ATTACHED.put(error, anchor);
    }

    static Span attached(Throwable error) {
        return error == null ? null : ATTACHED.get(error);
    }
}
