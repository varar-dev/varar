package dev.varar.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Immutable run-result records — port of {@code typescript/packages/core/src/result.ts}.
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
    /**
     * @param docPath the document {@code line}, {@code cells} and {@code anchor} are offsets INTO.
     *     Null — the overwhelming majority — means the oath itself. Set only when the failing step
     *     was spliced in from another oath by a reference block (ADR 0016): its spans belong to
     *     that document, and a renderer that placed them in this one would underline whatever text
     *     sat at those offsets.
     */
    public record ExampleFailure(
            int line, String message, String stack, List<CellFailure> cells, AnchorRange anchor, String docPath) {
        public ExampleFailure {
            cells = cells == null ? null : List.copyOf(cells);
        }

        /** A failure written by an oath's own step — the overwhelming majority. */
        public ExampleFailure(int line, String message, String stack, List<CellFailure> cells, AnchorRange anchor) {
            this(line, message, stack, cells, anchor, null);
        }

        /** A failure with no anchor — the shape producers wrote before anchors were recorded. */
        public ExampleFailure(int line, String message, String stack, List<CellFailure> cells) {
            this(line, message, stack, cells, null);
        }
    }

    /**
     * An oath other than this one that contributed steps to the run, with its source hash as run
     * (ADR 0016).
     */
    public record ReferencedDocument(String path, String sourceHash) {}

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
    /**
     * @param documents every OTHER document this run's steps came from — the oaths a reference
     *     block pulled steps in from (ADR 0016), with their hashes as run. Empty when no step was
     *     spliced in, which is the common case.
     */
    public record OathResults(
            int version,
            String oathPath,
            String sourceHash,
            List<ExampleResult> examples,
            List<ReferencedDocument> documents) {
        public OathResults {
            examples = List.copyOf(examples);
            documents = documents == null ? List.of() : List.copyOf(documents);
        }

        public OathResults(int version, String oathPath, String sourceHash, List<ExampleResult> examples) {
            this(version, oathPath, sourceHash, examples, List.of());
        }
    }

    /**
     * Projects {@link OathResults} onto the JSON shape of {@code .varar/<oathPath>.json} (ADR
     * 0014): the TypeScript field names, in declaration order, with the optional members absent
     * rather than null so a reader that predates them still parses the file. Pure — writing the
     * file is the shell's job. Pair with {@link JsonWriter#stringifyInOrder}.
     */
    public static Map<String, Object> toWire(OathResults results) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("version", results.version());
        out.put("oathPath", results.oathPath());
        out.put("sourceHash", results.sourceHash());
        if (!results.documents().isEmpty()) {
            out.put(
                    "documents",
                    results.documents().stream()
                            .map(d -> (Object) orderedMap("path", d.path(), "sourceHash", d.sourceHash()))
                            .toList());
        }
        out.put(
                "examples",
                results.examples().stream().map(Result::exampleToWire).toList());
        return out;
    }

    private static Map<String, Object> exampleToWire(ExampleResult example) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("name", example.name());
        out.put("status", example.status() == Status.PASSED ? "passed" : "failed");
        out.put("lines", List.copyOf(example.lines()));
        if (example.failure() != null) {
            out.put("failure", failureToWire(example.failure()));
        }
        return out;
    }

    private static Map<String, Object> failureToWire(ExampleFailure failure) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("line", failure.line());
        out.put("message", failure.message());
        out.put("stack", failure.stack());
        if (failure.cells() != null && !failure.cells().isEmpty()) {
            out.put(
                    "cells",
                    failure.cells().stream()
                            .map(c -> (Object) orderedMap("from", c.from(), "to", c.to(), "actual", c.actual()))
                            .toList());
        }
        if (failure.anchor() != null) {
            out.put(
                    "anchor",
                    orderedMap(
                            "from",
                            failure.anchor().from(),
                            "to",
                            failure.anchor().to()));
        }
        // Present only on a step a reference block spliced in from another oath (ADR 0016).
        if (failure.docPath() != null) {
            out.put("docPath", failure.docPath());
        }
        return out;
    }

    private static Map<String, Object> orderedMap(Object... pairs) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) {
            out.put((String) pairs[i], pairs[i + 1]);
        }
        return out;
    }
}
