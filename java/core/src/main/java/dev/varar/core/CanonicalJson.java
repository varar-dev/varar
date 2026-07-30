package dev.varar.core;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Hand-rolled canonical JSON serializer — deliberately not backed by a library (Jackson,
 * Gson, ...): the format is small and fully specified by the four rules below, and a
 * hand-rolled serializer avoids a library's default-formatting quirks (trailing spaces,
 * empty-container rendering, escaping differences) silently drifting from the JS/Python
 * reference output. See {@code doc/superpowers/specs/2026-07-01-java-core-port-design.md},
 * section "Canonical JSON — no library shortcut".
 *
 * <p>Port (concept only) of {@code canonicalStringify} in {@code var-core/src/conformance.ts}
 * and {@code var_core.canonical_json.canonical_stringify}. Must reproduce, byte-for-byte,
 * {@code JSON.stringify(sortKeys(value), null, 2) + "\n"} — i.e.:
 *
 * <ol>
 *   <li>Recursively <b>key-sorted</b> objects (map keys sorted lexicographically at every
 *       nesting level).
 *   <li><b>2-space indent</b>, matching {@code JSON.stringify(value, null, 2)}'s exact
 *       bracket/comma/newline placement.
 *   <li><b>LF</b> line endings, trailing newline at the very end.
 *   <li>Non-ASCII characters emitted <b>raw</b> (not backslash-u-escaped) — but JSON
 *       control characters ({@code "}, {@code \}, and actual control chars like
 *       {@code \n}/{@code \t}) still get standard JSON string escaping.
 * </ol>
 *
 * <p>{@code value} must be built from plain {@code Map<String, Object>} (JSON objects),
 * {@code List<Object>} (JSON arrays), {@code String}, {@code Number}, {@code Boolean}, and
 * {@code null} — no reflection over domain/record types. Note: {@code Map.of(...)}'s
 * iteration order is unspecified, so this serializer always sorts the key set itself
 * (via {@link TreeMap}) rather than relying on the input map's own iteration order.
 */
public final class CanonicalJson {

    private CanonicalJson() {}

    private static final String INDENT_UNIT = "  ";

    /** Serializes {@code value} to canonical JSON, with a trailing {@code "\n"}. */
    public static String canonicalStringify(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value, 0, true);
        sb.append('\n');
        return sb.toString();
    }

    /**
     * Serializes {@code value} the way {@code JSON.stringify(value, null, 2)} does in the
     * TypeScript port: the same 2-space indent and escaping, but keys in the order the map yields
     * them rather than sorted, and no trailing newline of its own.
     *
     * <p>Run results (ADR 0014) use this rather than {@link #canonicalStringify} — the reference
     * implementation writes the payload in declaration order, and that file is read by humans
     * diffing it as much as by the language server.
     */
    public static String stringifyInOrder(Object value) {
        StringBuilder sb = new StringBuilder();
        write(sb, value, 0, false);
        return sb.toString();
    }

    private static void write(StringBuilder sb, Object value, int depth, boolean sortKeys) {
        if (value == null) {
            sb.append("null");
        } else if (value instanceof Map<?, ?> map) {
            writeObject(sb, map, depth, sortKeys);
        } else if (value instanceof List<?> list) {
            writeArray(sb, list, depth, sortKeys);
        } else if (value instanceof String s) {
            writeString(sb, s);
        } else if (value instanceof Boolean b) {
            sb.append(b.toString());
        } else if (value instanceof Number n) {
            writeNumber(sb, n);
        } else {
            throw new IllegalArgumentException("Unsupported value type for canonical JSON: " + value.getClass());
        }
    }

    private static void writeObject(StringBuilder sb, Map<?, ?> map, int depth, boolean sortKeys) {
        if (map.isEmpty()) {
            sb.append("{}");
            return;
        }
        // Map.of(...)'s iteration order is unspecified — sort the key set ourselves rather
        // than trust the input map's own order. A caller that DOES care about order (run
        // results) passes an ordered map and sortKeys=false.
        Map<String, Object> entries = new LinkedHashMap<>();
        if (sortKeys) {
            entries.putAll(new TreeMap<>(cast(map)));
        } else {
            entries.putAll(cast(map));
        }
        sb.append("{\n");
        int i = 0;
        int n = entries.size();
        for (var entry : entries.entrySet()) {
            indent(sb, depth + 1);
            writeString(sb, entry.getKey());
            sb.append(": ");
            write(sb, entry.getValue(), depth + 1, sortKeys);
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

    private static void writeArray(StringBuilder sb, List<?> list, int depth, boolean sortKeys) {
        if (list.isEmpty()) {
            sb.append("[]");
            return;
        }
        sb.append("[\n");
        int n = list.size();
        for (int i = 0; i < n; i++) {
            indent(sb, depth + 1);
            write(sb, list.get(i), depth + 1, sortKeys);
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
