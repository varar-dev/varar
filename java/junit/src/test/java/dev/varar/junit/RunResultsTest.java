package dev.varar.junit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.engine.discovery.DiscoverySelectors.selectFile;

import dev.varar.junit.fixtures.WidgetSteps;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.platform.testkit.engine.EngineTestKit;

/**
 * Run results persisted for the language server (ADR 0014). The shape is the cross-port contract —
 * the same file the TypeScript vitest reporter writes — so these assertions are about the wire
 * format, not about JUnit.
 */
class RunResultsTest {

    private static void writeProject(Path workspace, String oath) throws Exception {
        Files.writeString(
                workspace.resolve("varar.config.json"),
                "{ \"docs\": { \"include\": [\"*.md\"], \"exclude\": [] }, \"steps\": [\""
                        + WidgetSteps.class.getName()
                        + "\"] }",
                StandardCharsets.UTF_8);
        Files.writeString(workspace.resolve("vault.md"), oath, StandardCharsets.UTF_8);
    }

    private static void execute(Path workspace) {
        EngineTestKit.engine("varar")
                .selectors(selectFile(workspace.resolve("vault.md").toString()))
                .configurationParameter(ConfigBridge.CONFIG_ROOT_KEY, workspace.toString())
                .execute();
    }

    private static String results(Path workspace) throws Exception {
        return Files.readString(workspace.resolve(".varar/vault.md.json"), StandardCharsets.UTF_8);
    }

    @Test
    void aPassingOathIsWrittenWhereTheLanguageServerLooks(@TempDir Path workspace) throws Exception {
        writeProject(workspace, "# Vault\n\nI have 3 widgets, and I should have 3 widgets.\n");
        execute(workspace);

        String json = results(workspace);
        assertTrue(json.contains("\"oathPath\": \"vault.md\""), json);
        assertTrue(json.contains("\"status\": \"passed\""), json);
        assertTrue(json.contains("\"sourceHash\": \"fnv1a:"), json);
        assertFalse(json.contains("\"failure\""), json);
        assertTrue(json.endsWith("}\n"), "the file ends with a newline, as the TypeScript port writes it");
    }

    @Test
    void aMismatchRecordsTheCellAndTheAnchor(@TempDir Path workspace) throws Exception {
        String oath = "# Vault\n\nI have 3 widgets, and I should have 9 widgets.\n";
        writeProject(workspace, oath);
        execute(workspace);

        String json = results(workspace);
        assertTrue(json.contains("\"status\": \"failed\""), json);
        // The mismatched cell is "9" — the sentence around it is not underlined.
        int from = oath.indexOf("9 widgets");
        assertTrue(json.contains("\"from\": " + from), json);
        assertTrue(json.contains("\"actual\": \"3\""), json);
        assertTrue(json.contains("\"anchor\""), json);
    }

    @Test
    void aPassingRunOverwritesAnEarlierFailure(@TempDir Path workspace) throws Exception {
        writeProject(workspace, "# Vault\n\nI have 3 widgets, and I should have 9 widgets.\n");
        execute(workspace);
        assertTrue(results(workspace).contains("\"failed\""));

        // A stale result would leave a diagnostic on screen that the run just cleared.
        Files.writeString(
                workspace.resolve("vault.md"),
                "# Vault\n\nI have 3 widgets, and I should have 3 widgets.\n",
                StandardCharsets.UTF_8);
        execute(workspace);

        String json = results(workspace);
        assertTrue(json.contains("\"passed\""), json);
        assertFalse(json.contains("\"failure\""), json);
    }

    @Test
    void theResultPathNestsUnderVararByTheOathPath(@TempDir Path workspace) {
        assertEquals(
                workspace.resolve(".varar/varar/library.md.json"),
                dev.varar.runner.Results.resultFilePath(workspace, "varar/library.md"));
    }
}
