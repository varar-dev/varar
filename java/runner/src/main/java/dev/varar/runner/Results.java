package dev.varar.runner;

import dev.varar.core.Hash;
import dev.varar.core.JsonWriter;
import dev.varar.core.Result;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Persists run results for the language server (ADR 0014) — the shell half of the contract the
 * core builds the payload for. Writes {@code <root>/.varar/<oathPath>.json}, which the
 * (language-neutral) LSP reads to turn a failure into an editor diagnostic.
 *
 * <p>Lives in the runner so every adapter on the JVM — JUnit, Kotest — feeds the same collector and
 * cannot drift from each other, or from the TypeScript reporter this is a port of.
 */
public final class Results {

    private final Map<String, String> sources = new LinkedHashMap<>();
    private final Map<String, List<Result.ExampleResult>> examples = new LinkedHashMap<>();

    /** Per oath: the other documents its steps were spliced in from (ADR 0016), path → source. */
    private final Map<String, Map<String, String>> documents = new LinkedHashMap<>();

    /** {@code <root>/.varar/<oathPath>.json} — the file the LSP watches. */
    public static Path resultFilePath(Path root, String oathPath) {
        return root.resolve(".varar").resolve(oathPath + ".json");
    }

    /**
     * Writes one oath's results: 2-space indent plus a trailing newline, matching {@code
     * JSON.stringify(results, null, 2)} in the TypeScript port.
     */
    public static Path write(Path root, Result.OathResults results) {
        Path out = resultFilePath(root, results.oathPath());
        try {
            Files.createDirectories(out.getParent());
            Files.writeString(out, JsonWriter.stringifyInOrder(Result.toWire(results)) + "\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("cannot write run results to " + out, e);
        }
        return out;
    }

    /** Accumulates one example's outcome; the oath's file is written once its examples are in. */
    public void record(String oathPath, String source, Result.ExampleResult result) {
        record(oathPath, source, result, Map.of());
    }

    /**
     * As {@link #record(String, String, Result.ExampleResult)}, plus the OTHER documents this
     * oath's steps were spliced in from (ADR 0016), as path → source. Their hashes go in the
     * payload so a consumer can tell a stale failure from a live one.
     */
    public void record(
            String oathPath, String source, Result.ExampleResult result, Map<String, String> referencedSources) {
        sources.put(oathPath, source);
        examples.computeIfAbsent(oathPath, k -> new ArrayList<>()).add(result);
        if (!referencedSources.isEmpty()) {
            documents.computeIfAbsent(oathPath, k -> new TreeMap<>()).putAll(referencedSources);
        }
    }

    /**
     * Writes what has been recorded for {@code oathPath} and forgets it. Passing oaths are written
     * too — a stale file would keep a diagnostic on screen that the run has just cleared.
     */
    public void flush(Path root, String oathPath) {
        List<Result.ExampleResult> recorded = examples.remove(oathPath);
        if (recorded == null || recorded.isEmpty()) {
            return;
        }
        List<Result.ReferencedDocument> docs = documents.getOrDefault(oathPath, new TreeMap<>()).entrySet().stream()
                .map(e -> new Result.ReferencedDocument(e.getKey(), Hash.hashSource(e.getValue())))
                .toList();
        documents.remove(oathPath);
        write(
                root,
                new Result.OathResults(
                        2, oathPath, Hash.hashSource(sources.get(oathPath)), List.copyOf(recorded), docs));
    }

    /** Writes every oath still held — for a runner with no per-file completion hook. */
    public void flushAll(Path root) {
        for (String oathPath : List.copyOf(examples.keySet())) {
            flush(root, oathPath);
        }
    }
}
