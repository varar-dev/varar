package dev.varar.core;

import static org.junit.jupiter.api.Assertions.assertEquals;

import dev.varar.core.Ast.VarDoc;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Port of {@code typescript/packages/core/tests/parse.test.ts}. */
class ParseTest {

    @Test
    void parseReturnsAVarDocWhoseExamplesComeFromParagraphsAndCarryTheHeadingStack() {
        String source = "# Hello\n\nbody";
        VarDoc varDoc = Parse.parse("hello.md", source);
        assertEquals("hello.md", varDoc.path());
        assertEquals(source, varDoc.source());
        // One paragraph, one Example. Example name is computed by the planner, not captured
        // here; the structurer's job is just to track scope + body.
        assertEquals(1, varDoc.examples().size());
        assertEquals(List.of("Hello"), varDoc.examples().get(0).scopeStack());
    }
}
