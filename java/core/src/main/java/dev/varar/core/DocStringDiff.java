package dev.varar.core;

/**
 * Doc-string comparison — port of {@code var-core/src/doc-string-diff.ts}.
 *
 * <p>{@code DocStringDiff} is a content difference: the fence body's source range plus the
 * expected (authored) and actual (returned) strings.
 */
public record DocStringDiff(Span span, String expected, String actual) {

    /**
     * Compares a doc-string step's returned value against the fence body content. Exact equality
     * (the body includes its trailing newline). {@code null} → no check (the step asserted
     * nothing). A non-string return is an author mistake → {@link CellDiff.ReturnShapeException}.
     */
    public static DocStringDiff compareDocString(Object returned, String content, Span span) {
        if (returned == null) return null;
        if (!(returned instanceof String s)) {
            throw new CellDiff.ReturnShapeException(
                    "expected a doc string (string), got " + returned.getClass().getSimpleName());
        }
        if (s.equals(content)) return null;
        return new DocStringDiff(span, content, s);
    }

    /** Thrown by the executor when a doc-string step's returned string differs. */
    public static final class DocStringMismatchException extends RuntimeException {
        private final DocStringDiff diff;

        public DocStringMismatchException(DocStringDiff diff) {
            super(message(diff));
            this.diff = diff;
        }

        public DocStringDiff diff() {
            return diff;
        }

        private static String message(DocStringDiff diff) {
            return "doc string: expected " + quote(diff.expected()) + " but was " + quote(diff.actual());
        }

        /**
         * Renders {@code s} the way {@code JSON.stringify} does in the TypeScript port.
         *
         * <p>Every port quotes this message identically because the text is matched by substring
         * in an {@code error} fence — a port that quotes differently fails a spec its siblings
         * pass. Escaping only {@code \\}, {@code "} and {@code \n} is not enough: doc strings
         * routinely carry tab-indented code.
         */
        private static String quote(String s) {
            StringBuilder b = new StringBuilder(s.length() + 2);
            b.append('"');
            for (int i = 0; i < s.length(); i++) {
                char c = s.charAt(i);
                switch (c) {
                    case '\\' -> b.append("\\\\");
                    case '"' -> b.append("\\\"");
                    case '\n' -> b.append("\\n");
                    case '\r' -> b.append("\\r");
                    case '\t' -> b.append("\\t");
                    case '\b' -> b.append("\\b");
                    case '\f' -> b.append("\\f");
                    default -> {
                        if (c < 0x20) {
                            b.append(String.format("\\u%04x", (int) c));
                        } else {
                            b.append(c);
                        }
                    }
                }
            }
            return b.append('"').toString();
        }
    }

    /** Type-guard helper mirroring {@code isDocStringMismatchError} in {@code doc-string-diff.ts}. */
    public static boolean isDocStringMismatchException(Throwable e) {
        return e instanceof DocStringMismatchException;
    }
}
