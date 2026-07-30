package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The cross-port wire format of {@code .varar/<oathPath>.json} (ADR 0014). Every port builds this
 * same value and must serialize it byte-for-byte identically — see
 * {@code conformance/run-results/README.md} for what that pins, and why the bundle goldens don't
 * cover it.
 */
class RunResultsWireTest {

    private static final Path EXPECTED = Path.of("..", "..", "conformance", "run-results", "expected.json");

    private static Result.OathResults results() {
        return new Result.OathResults(
                1,
                "varar/library.md",
                "fnv1a:1622dfca",
                List.of(
                        new Result.ExampleResult(
                                "Maya borrowed *Emma*, due back on June 1, 2026",
                                Result.Status.PASSED,
                                List.of(3, 4),
                                null),
                        new Result.ExampleResult(
                                "Ben borrowed *Dune* for £2.50 & kept it",
                                Result.Status.FAILED,
                                List.of(13, 14),
                                new Result.ExampleFailure(
                                        14,
                                        "expected £2.50 but was £3.00\nand the library <refused>",
                                        "<stack>",
                                        List.of(new Result.CellFailure(71, 77, "£3.00")),
                                        new Result.AnchorRange(60, 90))),
                        new Result.ExampleResult(
                                "Noor borrowed *Kindred*",
                                Result.Status.FAILED,
                                List.of(8, 9),
                                new Result.ExampleFailure(9, "expected the library to refuse", "<stack>", null))));
    }

    @Test
    void theWireFormatMatchesTheCrossPortFixture() throws Exception {
        String written = CanonicalJson.stringifyInOrder(Result.toWire(results())) + "\n";
        assertEquals(Files.readString(EXPECTED, StandardCharsets.UTF_8), written);
    }
}
