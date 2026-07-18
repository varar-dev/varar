package com.oselvar.var.config;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Minimal recursive-descent JSON parser: the reading twin of var-core's
 * hand-rolled {@code CanonicalJson} writer. The repo deliberately has zero
 * JSON library dependencies; var.config.json files are tiny, so a ~150-line
 * strict parser (objects, arrays, strings with escapes, numbers, booleans,
 * null — no extensions, no comments, duplicate keys rejected) beats pulling
 * in Jackson for one file format.
 *
 * <p>Numbers parse as {@link Long} when integral (no '.', 'e', 'E'),
 * otherwise {@link Double}. Objects are {@link LinkedHashMap} (insertion
 * order), arrays are {@link ArrayList}.
 */
public final class Json {

    private Json() {}

    public static Object parse(String text) {
        Parser p = new Parser(text);
        p.skipWhitespace();
        Object value = p.parseValue();
        p.skipWhitespace();
        if (!p.atEnd()) throw p.error("unexpected trailing content");
        return value;
    }

    private static final class Parser {
        private final String s;
        private int i = 0;

        Parser(String s) {
            this.s = s;
        }

        boolean atEnd() {
            return i >= s.length();
        }

        IllegalArgumentException error(String message) {
            return new IllegalArgumentException(message + " at offset " + i);
        }

        void skipWhitespace() {
            while (i < s.length()) {
                char c = s.charAt(i);
                if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++;
                else break;
            }
        }

        char peek() {
            if (atEnd()) throw error("unexpected end of input");
            return s.charAt(i);
        }

        void expect(char c) {
            if (atEnd() || s.charAt(i) != c) throw error("expected '" + c + "'");
            i++;
        }

        Object parseValue() {
            char c = peek();
            return switch (c) {
                case '{' -> parseObject();
                case '[' -> parseArray();
                case '"' -> parseString();
                case 't' -> parseLiteral("true", Boolean.TRUE);
                case 'f' -> parseLiteral("false", Boolean.FALSE);
                case 'n' -> parseLiteral("null", null);
                default -> parseNumber();
            };
        }

        Object parseLiteral(String literal, Object value) {
            if (!s.startsWith(literal, i)) throw error("invalid literal");
            i += literal.length();
            return value;
        }

        Map<String, Object> parseObject() {
            expect('{');
            Map<String, Object> out = new LinkedHashMap<>();
            skipWhitespace();
            if (!atEnd() && peek() == '}') {
                i++;
                return out;
            }
            while (true) {
                skipWhitespace();
                String key = parseString();
                if (out.containsKey(key)) throw error("duplicate key \"" + key + "\"");
                skipWhitespace();
                expect(':');
                skipWhitespace();
                out.put(key, parseValue());
                skipWhitespace();
                char c = peek();
                if (c == ',') {
                    i++;
                    continue;
                }
                if (c == '}') {
                    i++;
                    return out;
                }
                throw error("expected ',' or '}'");
            }
        }

        List<Object> parseArray() {
            expect('[');
            List<Object> out = new ArrayList<>();
            skipWhitespace();
            if (!atEnd() && peek() == ']') {
                i++;
                return out;
            }
            while (true) {
                skipWhitespace();
                out.add(parseValue());
                skipWhitespace();
                char c = peek();
                if (c == ',') {
                    i++;
                    continue;
                }
                if (c == ']') {
                    i++;
                    return out;
                }
                throw error("expected ',' or ']'");
            }
        }

        String parseString() {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                if (atEnd()) throw error("unterminated string");
                char c = s.charAt(i++);
                if (c == '"') return sb.toString();
                if (c == '\\') {
                    if (atEnd()) throw error("unterminated escape");
                    char e = s.charAt(i++);
                    switch (e) {
                        case '"' -> sb.append('"');
                        case '\\' -> sb.append('\\');
                        case '/' -> sb.append('/');
                        case 'b' -> sb.append('\b');
                        case 'f' -> sb.append('\f');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'u' -> {
                            if (i + 4 > s.length()) throw error("truncated \\u escape");
                            int cp = 0;
                            for (int k = 0; k < 4; k++) {
                                int d = Character.digit(s.charAt(i + k), 16);
                                if (d < 0) throw error("invalid \\u escape");
                                cp = (cp << 4) | d;
                            }
                            sb.append((char) cp);
                            i += 4;
                        }
                        default -> throw error("invalid escape '\\" + e + "'");
                    }
                } else if (c < 0x20) {
                    throw error("unescaped control character in string");
                } else {
                    sb.append(c);
                }
            }
        }

        Object parseNumber() {
            int start = i;
            if (!atEnd() && s.charAt(i) == '-') i++;
            // JSON requires at least one digit for the integer part: a
            // leading-dot number like ".5" (or a bare "-") is not valid JSON.
            int intStart = i;
            while (!atEnd() && Character.isDigit(s.charAt(i))) i++;
            if (i == intStart) throw error("invalid number");
            boolean integral = true;
            if (!atEnd() && s.charAt(i) == '.') {
                integral = false;
                i++;
                while (!atEnd() && Character.isDigit(s.charAt(i))) i++;
            }
            if (!atEnd() && (s.charAt(i) == 'e' || s.charAt(i) == 'E')) {
                integral = false;
                i++;
                if (!atEnd() && (s.charAt(i) == '+' || s.charAt(i) == '-')) i++;
                while (!atEnd() && Character.isDigit(s.charAt(i))) i++;
            }
            String token = s.substring(start, i);
            try {
                return integral ? (Object) Long.parseLong(token) : (Object) Double.parseDouble(token);
            } catch (NumberFormatException e) {
                throw error("invalid number \"" + token + "\"");
            }
        }
    }
}
