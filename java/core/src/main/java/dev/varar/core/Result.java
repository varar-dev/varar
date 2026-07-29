package dev.varar.core;

import java.util.List;

/**
 * Immutable run-result records — port of {@code var-core/src/result.ts}.
 *
 * <p>{@code OathResults} is the persisted run result for one oath file: the {@code
 * .varar/<oath>.json} file IS a serialized {@code OathResults}.
 */
public final class Result {

    private Result() {}

    /**
     * One mismatched CELL as a source-offset range plus the runtime value. {@code from}/
     * {@code to} are absolute source offsets (== CodeMirror positions); {@code to} is exclusive.
     */
    public record CellFailure(int from, int to, String actual) {}

    /**
     * An example's run outcome. Mirrors TS's {@code 'passed' | 'failed'} string-literal union
     * (see {@code Diagnostics.Severity}/{@code DiagnosticCode} for the same enum-for-closed-union
     * convention used elsewhere in this port).
     */
    public enum Status {
        PASSED,
        FAILED
    }

    /**
     * Where a failure points in the source: an offset range, {@code to} exclusive. The failing
     * step's match span, or the first mismatched cell's span (the {@link FailureAnchor} rule).
     * This is what lets a renderer underline the step that failed rather than the whole line it
     * sits on. Serialized as the failure payload's {@code anchor} key.
     */
    public record AnchorRange(int from, int to) {}

    /**
     * The failure payload carried by a failed {@link ExampleResult}. TS leaves this as an
     * anonymous inline object type on {@code ExampleResult.failure}; Java requires a name here —
     * this follows the Python port's naming ({@code ExampleFailure} in {@code result.py}).
     *
     * @param cells every mismatched cell — table, header-bound row, inline capture or doc
     *     string; {@code null} when not applicable (TS's optional {@code cells?}).
     * @param anchor where the failure points, or {@code null} when the error never passed through
     *     a step. Optional for the same reason {@code cells} is: a result written without it still
     *     reads, and a renderer falls back to {@code line}.
     */
    public record ExampleFailure(int line, String message, String stack, List<CellFailure> cells, AnchorRange anchor) {
        public ExampleFailure {
            cells = cells == null ? null : List.copyOf(cells);
        }

        /** A failure with no anchor — the shape producers wrote before anchors were recorded. */
        public ExampleFailure(int line, String message, String stack, List<CellFailure> cells) {
            this(line, message, stack, cells, null);
        }
    }

    /**
     * The run result for one BDD example.
     *
     * @param lines 1-based source lines of this example's steps (the line-wash anchors).
     * @param failure {@code null} when {@code status} is {@code PASSED} (TS's optional {@code
     *     failure?}).
     */
    public record ExampleResult(String name, Status status, List<Integer> lines, ExampleFailure failure) {
        public ExampleResult {
            lines = List.copyOf(lines);
        }
    }

    /** The persisted run result for one oath file. */
    public record OathResults(int version, String oathPath, String sourceHash, List<ExampleResult> examples) {
        public OathResults {
            examples = List.copyOf(examples);
        }
    }
}
