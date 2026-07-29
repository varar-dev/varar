package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.varar.core.Ast.Doc;
import dev.varar.core.Ast.Example;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Port of {@code typescript/packages/core/tests/structurer.test.ts}, cross-checked against
 * {@code python/packages/core/tests/test_structurer.py}.
 */
class StructurerTest {

    @Test
    void everyParagraphBecomesACandidateExampleScopedByTheHeadingsAboveIt() {
        String source =
                "# Withdrawing cash\n\nGiven I have $100 in my account\n\n# Overdraft\n\nGiven I have $10 in my account";
        Doc doc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, doc.examples().size());
        assertEquals(List.of("Withdrawing cash"), doc.examples().get(0).scopeStack());
        assertEquals(List.of("Overdraft"), doc.examples().get(1).scopeStack());
    }

    @Test
    void twoParagraphsUnderTheSameHeadingEachBecomeASeparateExample() {
        String source = "## Example\n\nFirst paragraph.\n\nSecond paragraph.";
        Doc doc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, doc.examples().size());
        assertTrue(doc.examples().get(0).body().get(0) instanceof Ast.Paragraph);
        assertTrue(doc.examples().get(1).body().get(0) instanceof Ast.Paragraph);
        assertEquals(List.of("Example"), doc.examples().get(0).scopeStack());
        assertEquals(List.of("Example"), doc.examples().get(1).scopeStack());
    }

    @Test
    void nestedHeadingsStackIntoAnOuterToInnerScopeStack() {
        String source = "## Outer\n\nbody one\n\n### Inner\n\nbody two";
        Doc doc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, doc.examples().size());
        assertEquals(List.of("Outer"), doc.examples().get(0).scopeStack());
        assertEquals(List.of("Outer", "Inner"), doc.examples().get(1).scopeStack());
    }

    @Test
    void aHeadingAtTheSameLevelPopsThePreviousSiblingOffTheScopeStack() {
        String source = "## A\n\nbody A\n\n## B\n\nbody B";
        Doc doc = Structurer.structure("test.md", source, Scanner.scan(source));
        assertEquals(2, doc.examples().size());
        assertEquals(List.of("A"), doc.examples().get(0).scopeStack());
        assertEquals(List.of("B"), doc.examples().get(1).scopeStack());
    }

    @Test
    void aParagraphWithNoEnclosingHeadingHasAnEmptyScopeStack() {
        String source = "standalone paragraph";
        Doc doc = Structurer.structure("p.md", source, Scanner.scan(source));
        assertEquals(1, doc.examples().size());
        assertEquals(List.of(), doc.examples().get(0).scopeStack());
    }

    @Test
    void headingsOnTheirOwnProduceNoExamples() {
        String source = "# Title only\n\n## Sub-title\n\n### Another";
        Doc doc = Structurer.structure("h.md", source, Scanner.scan(source));
        assertEquals(0, doc.examples().size());
    }

    @Test
    void structurePreservesTheSourceStringVerbatim() {
        String source = "# Hi\n\nbody";
        Doc doc = Structurer.structure("p.md", source, Scanner.scan(source));
        assertEquals(source, doc.source());
        assertEquals("p.md", doc.path());
    }

    @Test
    void orphanTablesAndFencesAreRecordedOnTheDoc() {
        String source = "| name | age |\n|------|-----|\n| Bob  | 30  |";
        Doc doc = Structurer.structure("o.md", source, Scanner.scan(source));
        assertEquals(1, doc.orphanAttachments().size());
        assertTrue(doc.orphanAttachments().get(0) instanceof Ast.Table);
    }

    @Test
    void aTableRightAfterAParagraphAttachesToThatParagraphNotOrphan() {
        String source = "## Example\n\nGiven these users:\n\n| name | age |\n|------|-----|\n| Bob  | 30  |";
        Doc doc = Structurer.structure("o.md", source, Scanner.scan(source));
        assertEquals(0, doc.orphanAttachments().size());
        Example example = doc.examples().get(0);
        assertTrue(example.body().stream().anyMatch(b -> b instanceof Ast.Table));
    }

    @Test
    void aHeadingBetweenAParagraphAndAFenceMakesTheFenceAnOrphan() {
        String source = "## A\n\npara\n\n## B\n\n```\nfenced body\n```\n";
        Doc doc = Structurer.structure("h.md", source, Scanner.scan(source));
        assertEquals(1, doc.orphanAttachments().size());
        Example example = doc.examples().get(0);
        assertFalse(example.body().stream().anyMatch(b -> b instanceof Ast.Fence));
    }

    @Test
    void precededByDelimiterMarksCandidatesAfterAHeadingOrThematicBreak() {
        String source = "First para.\n\nSecond para.\n\n---\n\nThird para.\n\n## H\n\nFourth para.";
        Doc doc = Structurer.structure("d.md", source, Scanner.scan(source));
        assertEquals(
                List.of(
                        true, // first candidate in the file
                        false, // adjacent paragraph, no delimiter between
                        true, // after `---`
                        true), // after a heading
                doc.examples().stream().map(Example::precededByDelimiter).toList());
    }
}
