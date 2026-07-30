package dev.varar.runner;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.Result;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Writing {@code .varar/<oathPath>.json} for the language server (ADR 0014). The payload's shape is
 * pinned in {@code ResultWireTest} over in the core; this is about the file: where it lands, and
 * that a flush clears what it wrote.
 */
class ResultsTest {

    private static Result.ExampleResult passed(String name, int line) {
        return new Result.ExampleResult(name, Result.Status.PASSED, List.of(line), null);
    }

    @Test
    void theFileNestsUnderVararByTheOathPath(@TempDir Path root) {
        assertEquals(root.resolve(".varar/varar/library.md.json"), Results.resultFilePath(root, "varar/library.md"));
    }

    @Test
    void flushWritesTheOathAndCreatesMissingDirectories(@TempDir Path root) throws Exception {
        Results results = new Results();
        results.record("varar/library.md", "# L\n\nMaya borrows.\n", passed("Maya borrows", 3));
        results.flush(root, "varar/library.md");

        Path written = root.resolve(".varar/varar/library.md.json");
        String json = Files.readString(written, StandardCharsets.UTF_8);
        assertTrue(json.contains("\"oathPath\": \"varar/library.md\""), json);
        assertTrue(json.contains("\"sourceHash\": \"fnv1a:"), json);
        assertTrue(json.endsWith("}\n"), "the file ends with a newline, as the TypeScript port writes it");
    }

    @Test
    void flushingTwiceDoesNotRewriteTheSameExamples(@TempDir Path root) throws Exception {
        Results results = new Results();
        results.record("a.md", "# A\n\nOne.\n", passed("One", 3));
        results.flush(root, "a.md");
        Files.delete(root.resolve(".varar/a.md.json"));

        // The examples were handed over by the first flush; a second must not resurrect them.
        results.flush(root, "a.md");
        assertFalse(Files.exists(root.resolve(".varar/a.md.json")));
    }

    @Test
    void flushAllWritesEveryOathHeld(@TempDir Path root) throws Exception {
        Results results = new Results();
        results.record("a.md", "# A\n\nOne.\n", passed("One", 3));
        results.record("b.md", "# B\n\nTwo.\n", passed("Two", 3));
        results.flushAll(root);

        assertTrue(Files.exists(root.resolve(".varar/a.md.json")));
        assertTrue(Files.exists(root.resolve(".varar/b.md.json")));
    }
}
