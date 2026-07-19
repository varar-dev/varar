package dev.varar.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class JsonTest {

    @Test
    void parsesObjectsArraysStringsNumbersBooleansNull() {
        Object v = Json.parse("{\"a\": [1, 2.5, \"s\", true, false, null], \"b\": {}}");
        Map<?, ?> obj = (Map<?, ?>) v;
        assertEquals(Map.of(), obj.get("b"));
        List<?> a = (List<?>) obj.get("a");
        assertEquals(1L, a.get(0));
        assertEquals(2.5, a.get(1));
        assertEquals("s", a.get(2));
        assertEquals(true, a.get(3));
        assertEquals(false, a.get(4));
        assertEquals(null, a.get(5));
    }

    @Test
    void decodesStringEscapes() {
        assertEquals("a\"b\\c/\b\f\n\r\té", Json.parse("\"a\\\"b\\\\c\\/\\b\\f\\n\\r\\t\\u00e9\""));
    }

    @Test
    void rejectsTrailingGarbageAndTruncatedInput() {
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{} x"));
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{ \"a\": "));
        assertThrows(IllegalArgumentException.class, () -> Json.parse(""));
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> Json.parse("{ nope"));
        assertTrue(e.getMessage().contains("offset"), e.getMessage());
    }

    @Test
    void rejectsDuplicateObjectKeys() {
        assertThrows(IllegalArgumentException.class, () -> Json.parse("{\"a\":1,\"a\":2}"));
    }

    @Test
    void rejectsLeadingDotNumbers() {
        // JSON requires a digit before the decimal point; ".5" (and "-.5") are
        // not valid. "0.5" still parses.
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> Json.parse(".5"));
        assertTrue(e.getMessage().contains("offset"), e.getMessage());
        assertThrows(IllegalArgumentException.class, () -> Json.parse("-.5"));
        assertThrows(IllegalArgumentException.class, () -> Json.parse("[.5]"));
        assertEquals(0.5, Json.parse("0.5"));
    }

    @Test
    void rejectsNonHexUnicodeEscape() {
        // A unicode escape with a non-hex digit is rejected with an "at offset N"
        // message like every other parser error (not a bare NumberFormatException).
        // The backslash and the 'u' are concatenated separately so this source
        // file itself contains no unicode-escape sequence for the compiler to
        // choke on.
        String json = "\"\\" + "u00zz\""; // JSON text: backslash-u then 00zz
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> Json.parse(json));
        assertTrue(e.getMessage().contains("offset"), e.getMessage());
    }
}
