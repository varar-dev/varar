package dev.varar.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The JSON writer behind {@code .varar/<oathPath>.json} (ADR 0014) — deliberately not backed by a
 * library (Jackson, Gson, ...): the format is small and fully specified, and a hand-rolled writer
 * avoids a library's default-formatting quirks (trailing spaces, empty-container rendering,
 * escaping differences) silently drifting from the TypeScript reference output.
 *
 * <p>Reproduces {@code JSON.stringify(value, null, 2)}: 2-space indent, LF, keys in the order the
 * map yields them, non-ASCII raw, control characters escaped, an integral double as an integer.
 *
 * <p>Conformance goldens are NOT written through here any more. A port has to agree with what a
 * golden SAYS, so each gate parses it and compares normalized content — see {@link JsonValue}.
 *
 * <p>{@code value} must be built from plain {@code Map<String, Object>}, {@code List<Object>},
 * {@code String}, {@code Number}, {@code Boolean} and {@code null} — no reflection over domain
 * types.
 */
public final class JsonWriter {

    private JsonWriter() {}

    private static final String INDENT_UNIT = "  ";

    /**
     * Serializes {@code value} the way {@code JSON.stringify(value, null, 2)} does in the
     * TypeScript port: the same 2-space indent and escaping, but keys in the order the map yields
     * them rather than sorted, and no trailing newline of its own.
     *
     * <p>The reference implementation writes the payload in declaration order, and that file is
     * read by humans diffing it as much as by the language server.
     */
    public static String stringifyInOrder(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value, 0);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object value, int depth) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof Map<?, ?> map) {
            writeObject(sb, map, depth);
        } else if (value instanceof List<?> list) {
            writeArray(sb, list, depth);
        } else if (value instanceof String s) {
            writeString(sb, s);
        } else if (value instanceof Boolean b) {
            sb.append(b.toString());
        } else if (value instanceof Number n) {
            writeNumber(sb, n);
        } else {
            throw new IllegalArgumentException("Unsupported value type for JSON: " + value.getClass());
        }
    }

    private static void writeObject(StringBuilder sb, Map<?, ?> map, int depth) {
        if (map.isEmpty()) {
            sb.append("{}");
            return;
        }
        // The caller supplies an ordered map: run results are written in declaration order.
        Map<String, Object> entries = new LinkedHashMap<>(cast(map));
        sb.append("{\n");
        int i = 0;
        int n = entries.size();
        for (var entry : entries.entrySet()) {
            indent(sb, depth + 1);
            writeString(sb, entry.getKey());
            sb.append(": ");
            write(sb, entry.getValue(), depth + 1);
            if (++i < n) sb.append(',');
            sb.append('\n');
        }
        indent(sb, depth);
        sb.append('}');
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> cast(Map<?, ?> map) {
        return (Map<String, Object>) map;
    }

    private static void writeArray(StringBuilder sb, List<?> list, int depth) {
        if (list.isEmpty()) {
            sb.append("[]");
            return;
        }
        sb.append("[\n");
        int n = list.size();
        for (int i = 0; i < n; i++) {
            indent(sb, depth + 1);
            write(sb, list.get(i), depth + 1);
            if (i + 1 < n) sb.append(',');
            sb.append('\n');
        }
        indent(sb, depth);
        sb.append(']');
    }

    private static void writeString(StringBuilder sb, String s) {
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                case '\b' -> sb.append("\\b");
                case '\f' -> sb.append("\\f");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        // Non-ASCII (and all other) characters are emitted raw — never
                        // backslash-u-escaped — matching JSON.stringify/ensure_ascii=False.
                        sb.append(c);
                    }
                }
            }
        }
        sb.append('"');
    }

    private static void writeNumber(StringBuilder sb, Number n) {
        if (n instanceof Double || n instanceof Float) {
            double d = n.doubleValue();
            if (d == Math.rint(d) && !Double.isInfinite(d)) {
                sb.append((long) d);
            } else {
                sb.append(n.toString());
            }
        } else {
            sb.append(n.toString());
        }
    }

    private static void indent(StringBuilder sb, int depth) {
        sb.append(INDENT_UNIT.repeat(depth));
    }
}
