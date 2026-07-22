package dev.varar.core;

import io.cucumber.cucumberexpressions.CaptureGroupTransformer;
import io.cucumber.cucumberexpressions.Expression;
import io.cucumber.cucumberexpressions.ExpressionFactory;
import io.cucumber.cucumberexpressions.ParameterType;
import io.cucumber.cucumberexpressions.ParameterTypeRegistry;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Step registry — port of {@code var-core/src/registry.ts}. Wraps the Java {@code
 * cucumber-expressions} library ({@code io.cucumber:cucumber-expressions:20.0.0}).
 *
 * <p><b>API-surface note, confirmed against the 20.0.0 jar (via {@code javap -p}), not
 * assumed:</b> the TS/Python ports construct {@code CucumberExpression} from a public
 * constructor. The Java library's {@code CucumberExpression(String,
 * ParameterTypeRegistry)} constructor is package-private — {@code javap} prints it with
 * no access modifier, and the class is otherwise unreachable for direct construction
 * from {@code dev.varar.core}. The library's public entry point is instead {@code
 * ExpressionFactory(ParameterTypeRegistry).createExpression(String)}, which returns the
 * public {@code Expression} interface (dispatching internally to a {@code
 * CucumberExpression} unless the source string is itself an anchored/regex-literal form
 * — {@code ^...$} or {@code /.../} — which this project's step expressions never are;
 * confirmed by reading {@code ExpressionFactory}'s decompiled bytecode). {@link
 * StepRegistration#compiled} is therefore typed as {@code Expression}, not the
 * (inaccessible) concrete {@code CucumberExpression} — {@code Expression}'s {@code
 * match}/{@code getRegexp}/{@code getSource} are exactly what Task 14's matcher needs
 * regardless of the concrete implementation.
 *
 * <p>{@code ParameterTypeRegistry} likewise has no no-arg constructor in this version —
 * only {@code ParameterTypeRegistry(Locale)}. {@link Locale#ENGLISH} is used here; this
 * only affects locale-sensitive built-in types ({@code float}/{@code double} decimal
 * separators), not {@code int}/{@code word}/{@code string}.
 */
public record Registry(
        List<StepRegistration> steps,
        ParameterTypeRegistry parameterTypes,
        List<CustomParameterType> customParameterTypes,
        Map<String, Function<Object, String>> formats) {

    public Registry {
        steps = List.copyOf(steps);
        customParameterTypes = List.copyOf(customParameterTypes);
        formats = Map.copyOf(formats);
    }

    /**
     * A custom parameter type as registered by an author — name plus the bare pattern
     * source ({@link Pattern#pattern()}, no flags/delimiters), the exact string the
     * conformance registry artifact serializes. Built-ins never appear here.
     */
    public record CustomParameterType(String name, String regexp) {}

    /**
     * One registered step: its source cucumber expression, source location, handler
     * (retained type-erased as {@link Object} — execution is a later task), the compiled
     * expression, and its role. {@code kind} may be {@code null} (the legacy/kindless
     * step path, mirroring TS/Python's optional {@code kind}).
     */
    public record StepRegistration(
            String expression,
            String expressionSourceFile,
            int expressionSourceLine,
            Object handler,
            Expression compiled,
            StepKind kind) {}

    /**
     * var's built-in {@code {emph}} parameter type — Markdown emphasis, matching the uniform
     * emphasis notations (bold-italic, bold, italic; {@code *} and {@code _} delimiters),
     * ordered longest-delimiter-first so {@code **x**} isn't half-eaten by the {@code *} branch.
     * Each of the six alternation branches captures the inner text in its own group, so only the
     * outermost delimiter pair is stripped ({@code **_x_**} &rarr; {@code _x_}).
     *
     * <p>Byte-identical to the TS port's {@code EMPH_REGEXP} (mind Java's own backslash escaping —
     * the {@code \*} of the source regexp is written {@code \\*} here). Seeded into every {@link
     * Registry} by {@link #createRegistry()}, so it is a genuine built-in: it is <b>not</b> recorded
     * in {@link #customParameterTypes()} and therefore never appears in a bundle's {@code
     * golden/registry.json} {@code parameterTypes} list (which serializes only the author's explicit
     * {@code defineParameterType} calls, exactly like the library's own {@code {string}}/{@code
     * {int}}).
     */
    public static final String EMPH_REGEXP =
            "\\*\\*\\*([^*]+)\\*\\*\\*|___([^_]+)___|\\*\\*([^*]+)\\*\\*|__([^_]+)__|\\*([^*]+)\\*|_([^_]+)_";

    /** An empty registry with a fresh default {@link ParameterTypeRegistry}, plus var's built-ins. */
    public static Registry createRegistry() {
        return seedBuiltins(new Registry(List.of(), new ParameterTypeRegistry(Locale.ENGLISH), List.of(), Map.of()));
    }

    /**
     * Seeds var's own built-in parameter types (beyond cucumber-expressions' {@code
     * int}/{@code float}/{@code string}/{@code word}) onto {@code registry}. Unlike {@link
     * #defineParameterType}, the seeded types are defined on the shared {@link
     * ParameterTypeRegistry} (and their formatters recorded in {@link #formats()}) but are
     * deliberately <b>not</b> appended to {@link #customParameterTypes()} — they are built-ins, not
     * author-registered custom types, so they must stay out of the {@code registry.json} artifact.
     */
    private static Registry seedBuiltins(Registry registry) {
        // Exactly one of the six alternation branches matches, so exactly one capture group is
        // non-null; return its inner text (mirrors the TS port's `groups.find(g => g !== undefined)`).
        CaptureGroupTransformer<String> parse = groups -> {
            for (String g : groups) {
                if (g != null) {
                    return g;
                }
            }
            return "";
        };
        ParameterType<String> emph = new ParameterType<>(
                "emph",
                List.of(EMPH_REGEXP),
                (Type) Object.class,
                parse,
                // Emphasis is distinctive notation; don't auto-suggest it in snippets.
                /* useForSnippets= */ false,
                /* preferForRegexpMatch= */ false,
                /* useRegexpMatchAsStrongTypeHint= */ false);
        registry.parameterTypes().defineParameterType(emph);
        Map<String, Function<Object, String>> formats = new LinkedHashMap<>(registry.formats());
        // Mismatch display renders the value back in single-asterisk emphasis.
        formats.put("emph", value -> "*" + value + "*");
        return new Registry(registry.steps(), registry.parameterTypes(), registry.customParameterTypes(), formats);
    }

    /**
     * Compiles {@code expression} against {@code registry}'s parameter types and appends
     * it, returning a new {@link Registry}; the original is unchanged.
     *
     * @throws IllegalArgumentException if {@code expression} duplicates an existing
     *     registration in {@code registry} — the message lists both source positions,
     *     mirroring {@code registry.ts}'s error text.
     */
    public static Registry addStep(
            Registry registry,
            String expression,
            String expressionSourceFile,
            int expressionSourceLine,
            Object handler,
            StepKind kind) {
        for (StepRegistration existing : registry.steps()) {
            if (existing.expression().equals(expression)) {
                throw new IllegalArgumentException("duplicate step definition for \""
                        + expression
                        + "\" at "
                        + existing.expressionSourceFile()
                        + ":"
                        + existing.expressionSourceLine()
                        + " and "
                        + expressionSourceFile
                        + ":"
                        + expressionSourceLine);
            }
        }
        Expression compiled = new ExpressionFactory(registry.parameterTypes()).createExpression(expression);
        List<StepRegistration> next = new ArrayList<>(registry.steps());
        next.add(new StepRegistration(expression, expressionSourceFile, expressionSourceLine, handler, compiled, kind));
        return new Registry(next, registry.parameterTypes(), registry.customParameterTypes(), registry.formats());
    }

    /**
     * Registers a custom parameter type on {@code registry}'s shared {@link
     * ParameterTypeRegistry} and returns a NEW {@link Registry} recording it in {@link
     * #customParameterTypes()}. The underlying {@link ParameterTypeRegistry} is still
     * mutated in place — {@code ParameterTypeRegistry.defineParameterType} mutates in
     * place, and (as in the TS/Python ports) that mutation is intentionally shared across
     * every step subsequently compiled against this registry — but callers MUST use the
     * returned {@link Registry} (not the argument) to observe the tracked custom type.
     *
     * @param parse maps the matched capture group(s) to the argument value; unlike
     *     TS/Python there is no implicit identity default — callers pass one explicitly
     */
    public static <T> Registry defineParameterType(
            Registry registry, String name, Pattern regexp, Function<String[], T> parse) {
        return defineParameterType(registry, name, regexp, parse, null);
    }

    /**
     * As {@link #defineParameterType(Registry, String, Pattern, Function)}, additionally
     * retaining {@code format} — the inverse of {@code parse}, rendering a value back in
     * the document's notation. Display-only: it is consulted solely when a sensor's
     * returned value mismatches a transformed inline parameter (see {@link ParamDiff});
     * it never influences matching or the comparison verdict. Kept in a parallel
     * name-keyed map on this record because the underlying {@code cucumber-expressions}
     * {@link ParameterType} cannot carry it — mirroring the TS port's {@code formats}
     * map beside its {@code ParameterTypeRegistry}.
     *
     * @param parse maps the matched capture group(s) to the argument value
     * @param format renders a value of this type in the document's notation; {@code
     *     null} means no formatter (mismatches fall back to the generic rendering chain)
     */
    public static <T> Registry defineParameterType(
            Registry registry, String name, Pattern regexp, Function<String[], T> parse, Function<T, String> format) {
        CaptureGroupTransformer<T> adapted = groups -> parse.apply(groups);
        // TS passes `null` for `type` (a JS ParameterType tolerates it, deanonymizing
        // later); this library's constructor `Objects.requireNonNull`s it (confirmed via
        // decompiled bytecode) — `Object.class` is the same stand-in the library's own
        // `createAnonymousParameterType` passes when no concrete type is known.
        ParameterType<T> parameterType = new ParameterType<>(
                name,
                List.of(regexp.pattern()),
                (Type) Object.class,
                adapted,
                /* useForSnippets= */ true,
                /* preferForRegexpMatch= */ false,
                /* useRegexpMatchAsStrongTypeHint= */ false);
        registry.parameterTypes().defineParameterType(parameterType);
        List<CustomParameterType> recorded = new ArrayList<>(registry.customParameterTypes());
        recorded.add(new CustomParameterType(name, regexp.pattern()));
        Map<String, Function<Object, String>> formats = registry.formats();
        if (format != null) {
            Map<String, Function<Object, String>> next = new LinkedHashMap<>(registry.formats());
            @SuppressWarnings("unchecked")
            Function<Object, String> erased = (Function<Object, String>) format;
            next.put(name, erased);
            formats = next;
        }
        return new Registry(registry.steps(), registry.parameterTypes(), recorded, formats);
    }
}
