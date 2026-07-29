package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.varar.core.Ast.Doc;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Port of {@code typescript/packages/core/tests/parse.test.ts}. */
class ParseTest {

    @Test
    void parseReturnsADocWhoseExamplesComeFromParagraphsAndCarryTheHeadingStack() {
        String source = "# Hello\n\nbody";
        Doc doc = Parse.parse("hello.md", source);
        assertEquals("hello.md", doc.path());
        assertEquals(source, doc.source());
        // One paragraph, one Example. Example name is computed by the planner, not captured
        // here; the structurer's job is just to track scope + body.
        assertEquals(1, doc.examples().size());
        assertEquals(List.of("Hello"), doc.examples().get(0).scopeStack());
    }
}
