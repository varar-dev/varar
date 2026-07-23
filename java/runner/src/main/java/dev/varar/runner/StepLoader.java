package dev.varar.runner;

import dev.varar.State;
import dev.varar.StepDefinitions;
import dev.varar.Steps;
import dev.varar.core.Registry;
import io.cucumber.cucumberexpressions.ParameterTypeRegistry;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.JarURLConnection;
import java.net.URISyntaxException;
import java.net.URL;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

/**
 * Reflectively loads a run's {@link StepDefinitions} classes, merges each one's own
 * {@link Registry} into a single shared one, and builds the per-file {@code
 * createContext} function {@link dev.varar.core.Execute} expects.
 *
 * <h2>One {@code Steps} per {@code StepDefinitions} class</h2>
 *
 * <p>Mirrors {@code Steps}'s own contract (see its javadoc): "one state factory per
 * step-definition class." Sharing a single {@code Steps} across multiple
 * {@code StepDefinitions} instances would let a second class's {@code steps} call
 * silently overwrite the first's {@code stateFactory} — this class avoids that by
 * constructing a fresh {@code Steps} per instantiated class (see the loop in
 * {@link #loadSteps}), exactly as {@code Execute.runExample}'s per-example, per-file
 * state cache assumes.
 *
 * <h2>The context-lookup key</h2>
 *
 * <p>Confirmed by reading {@code Execute.runExample} directly: it does {@code
 * state = resolve(createContext.apply(file))} where {@code file =
 * step.stepDef().expressionSourceFile()} — a plain {@code String}, the exact source
 * file name {@code Steps}'s {@code StackWalker} captured for every step a
 * given class registers (all steps from one class share the same caller file, since
 * {@code StackWalker} always finds the same calling file for a given class's
 * registrations). So the key {@link #loadSteps} must produce for {@code createContext}
 * is that same string — not the {@code Class} object, not a synthetic id.
 *
 * <p>Because every step a class registers reports the SAME {@code
 * expressionSourceFile}, this class only needs to read ONE of them (the first) to learn
 * the key for that whole class's {@code stateFactory}. A class whose {@code
 * register} calls {@code defineState} but registers zero {@code
 * context}/{@code action}/{@code sensor} steps has a {@code stateFactory} but no
 * {@code expressionSourceFile} to key it by — {@link #loadSteps} skips contributing a
 * context-map entry for it. This is safe, not a loss: {@code Execute} only ever calls
 * {@code createContext.apply} with a step's OWN {@code expressionSourceFile}, and a
 * class with no steps has no step that could ever supply that file as a lookup key in
 * the first place.
 *
 * <h2>Merging registries</h2>
 *
 * <p>{@link Registry} has no built-in cross-registry merge — {@link #loadSteps}
 * provides one, since {@code var-core}'s {@code Registry} is frozen behavior from the
 * core-port plan (this is a legitimate small addition to {@code var-runner}, not a
 * change to {@code var-core}).
 *
 * <p><b>Why this does not go through {@link Registry#addStep}/{@code
 * Registry.defineParameterType}, despite the design note suggesting it:</b> {@code
 * addStep} recompiles a raw expression string against the ACCUMULATOR's own {@code
 * ParameterTypeRegistry}, which would only produce a correct result for a step using a
 * custom parameter type if that type were re-registered on the accumulator first. But
 * {@code ParameterTypeRegistry.getParameterTypes()} — confirmed via {@code javap} — is
 * package-private in {@code io.cucumber.cucumberexpressions}, so there is no accessible
 * way from {@code dev.varar.runner} to enumerate a source registry's custom
 * parameter types in order to re-register them. Recompiling is unnecessary anyway: each
 * {@link Registry.StepRegistration#compiled} is already a fully-compiled {@code
 * Expression}, self-contained and independent of any registry object once built (it was
 * built once, correctly, against its OWN registry's parameter types back in {@code
 * Steps}). So merging is simply concatenating each source registry's {@code
 * steps()} list into the accumulator's — reusing the already-compiled expressions as-is
 * — with the same duplicate-expression check {@code addStep} performs (and the same
 * error message shape), since two classes accidentally registering the identical
 * expression is a genuine authoring bug this merge should still catch. {@code
 * customParameterTypes()} is merged the same way — plain concatenation, no
 * recompilation — since it exists purely to be projected into the registry
 * conformance artifact ({@link dev.varar.core.Conformance#toRegistryArtifact}),
 * never consulted to compile anything itself. Duplicate custom parameter-type names are
 * rejected (two classes accidentally registering the same name is a genuine authoring
 * bug this merge should catch).
 */
public final class StepLoader {

    private StepLoader() {}

    /** One run's merged step registry plus its per-file initial-state lookup. */
    public record LoadedSteps(Registry registry, Function<String, Object> createContext) {}

    /**
     * Loads every named {@link StepDefinitions} class from {@code loader}, merges their
     * registries into one, and returns the merged {@link LoadedSteps}.
     *
     * @param stepClassNames each entry is either a fully-qualified class name — a class
     *     implementing {@link StepDefinitions} with a public no-arg constructor, OR exposing
     *     one or more public static no-arg methods whose return type is assignable to {@link
     *     StepDefinitions} — or a package wildcard {@code pkg.*} resolving to every such
     *     class directly in {@code pkg} (see {@link #resolveEntry})
     * @param loader the classloader to resolve {@code stepClassNames} against
     * @throws IllegalArgumentException if a name can't be resolved to a class, a package
     *     wildcard matches no step-definition class, the resolved class neither implements
     *     {@link StepDefinitions} nor exposes a matching static factory method, two classes
     *     register the identical step expression, two classes register a custom parameter
     *     type with the same name, or two load units' steps report the same {@code
     *     expressionSourceFile} (one steps per step-definition file)
     * @throws IllegalStateException if a resolved class can't be instantiated or invoked
     */
    public static LoadedSteps loadSteps(List<String> stepClassNames, ClassLoader loader) {
        List<Registry.StepRegistration> mergedSteps = new ArrayList<>();
        List<Registry.CustomParameterType> mergedCustomParameterTypes = new ArrayList<>();
        Map<String, Function<Object, String>> mergedFormats = new LinkedHashMap<>();
        ParameterTypeRegistry parameterTypes = null;
        Map<String, Supplier<? extends State>> factoriesByFile = new HashMap<>();

        List<String> resolvedClassNames = new ArrayList<>();
        for (String entry : stepClassNames) {
            resolvedClassNames.addAll(resolveEntry(entry, loader));
        }
        for (String className : resolvedClassNames) {
            for (StepDefinitions<?> instance : resolveUnits(className, loader)) {
                Steps.Bound bound = Steps.bind(instance);

                Registry own = bound.registry();
                if (parameterTypes == null) {
                    // Arbitrary pick: the FIRST class's ParameterTypeRegistry becomes the
                    // merged registry's own — it's never consulted again once every step's
                    // Expression is already compiled (see class javadoc), so which one is
                    // kept is immaterial to matching.
                    parameterTypes = own.parameterTypes();
                }
                for (Registry.StepRegistration step : own.steps()) {
                    requireNoDuplicate(mergedSteps, step);
                    mergedSteps.add(step);
                }
                for (Registry.CustomParameterType cpt : own.customParameterTypes()) {
                    requireNoDuplicateParameterTypeName(mergedCustomParameterTypes, cpt);
                    mergedCustomParameterTypes.add(cpt);
                }
                // Display formatters are keyed by type name; duplicate names were
                // rejected just above, so this union never overwrites an entry.
                mergedFormats.putAll(own.formats());

                if (!own.steps().isEmpty()) {
                    String file = own.steps().get(0).expressionSourceFile();
                    if (factoriesByFile.containsKey(file)) {
                        throw new IllegalArgumentException(
                                "more than one steps registration reports the step-definition file \""
                                        + file
                                        + "\" (one steps per step-definition file; loaded classes: "
                                        + stepClassNames
                                        + ")");
                    }
                    factoriesByFile.put(file, bound.stateFactory());
                }
                // else: steps was called but zero steps were registered (a
                // context-only class) — there's no expressionSourceFile to key it by, and
                // none is ever needed, since Execute only looks up a file that has at least
                // one step registered against it.
            }
        }

        Registry merged = new Registry(
                mergedSteps,
                parameterTypes != null
                        ? parameterTypes
                        : Registry.createRegistry().parameterTypes(),
                mergedCustomParameterTypes,
                mergedFormats);
        Map<String, Supplier<? extends State>> resolvedFactories = Map.copyOf(factoriesByFile);
        Function<String, Object> createContext = file -> {
            Supplier<? extends State> factory = resolvedFactories.get(file);
            if (factory == null) {
                throw new IllegalStateException("no state factory registered for step-definition file \""
                        + file
                        + "\" (loaded classes: "
                        + stepClassNames
                        + ")");
            }
            return factory.get();
        };
        return new LoadedSteps(merged, createContext);
    }

    private static void requireNoDuplicate(
            List<Registry.StepRegistration> mergedSteps, Registry.StepRegistration incoming) {
        for (Registry.StepRegistration existing : mergedSteps) {
            if (existing.expression().equals(incoming.expression())) {
                throw new IllegalArgumentException("duplicate step definition for \""
                        + incoming.expression()
                        + "\" at "
                        + existing.expressionSourceFile()
                        + ":"
                        + existing.expressionSourceLine()
                        + " and "
                        + incoming.expressionSourceFile()
                        + ":"
                        + incoming.expressionSourceLine());
            }
        }
    }

    private static void requireNoDuplicateParameterTypeName(
            List<Registry.CustomParameterType> mergedTypes, Registry.CustomParameterType incoming) {
        for (Registry.CustomParameterType existing : mergedTypes) {
            if (existing.name().equals(incoming.name())) {
                throw new IllegalArgumentException("duplicate custom parameter-type name \"" + incoming.name() + "\"");
            }
        }
    }

    /**
     * Resolves one configured {@code steps} entry to the class names it denotes. A plain
     * fully-qualified class name resolves to itself, unchecked — {@link #resolveUnits}
     * still rejects it loudly if it isn't a step-definition holder. An entry ending in
     * {@code .*} is a package wildcard with star-import semantics: it resolves to every
     * step-definition holder <em>directly</em> in that package — top-level classes only,
     * no nested classes, no subpackages — discovered via {@code loader} (both directory
     * and jar classpath entries), name-sorted for determinism. A holder is what the
     * explicit-FQN path accepts: a concrete class implementing {@link StepDefinitions},
     * or one exposing a public static no-arg method returning it (the Kotlin file-facade
     * shape). Classes in the package that are neither are skipped silently; a wildcard
     * matching no holder at all fails exactly like an unknown fully-qualified name.
     */
    private static List<String> resolveEntry(String entry, ClassLoader loader) {
        if (!entry.endsWith(".*")) return List.of(entry);
        String packageName = entry.substring(0, entry.length() - ".*".length());
        List<String> holders = new ArrayList<>();
        for (String className : topLevelClassNamesIn(packageName, loader)) {
            if (isStepDefinitionHolder(className, loader)) holders.add(className);
        }
        if (holders.isEmpty()) {
            throw new IllegalArgumentException("step-definition class not found: " + entry
                    + " (no class directly in package "
                    + packageName
                    + " implements "
                    + StepDefinitions.class.getName()
                    + " or exposes a public static no-arg method returning it)");
        }
        return holders;
    }

    /**
     * Every top-level class name directly in {@code packageName} (no subpackages), from
     * every classpath entry {@code loader} maps the package to — directory entries listed
     * from the filesystem, jar entries enumerated from the jar index. Sorted. Nested and
     * synthetic classes ({@code $} in the file name) and {@code package-info}/{@code
     * module-info} are excluded — star-import semantics import top-level types only.
     */
    private static Set<String> topLevelClassNamesIn(String packageName, ClassLoader loader) {
        String packagePath = packageName.replace('.', '/');
        Set<String> names = new TreeSet<>();
        Enumeration<URL> resources;
        try {
            resources = loader.getResources(packagePath);
        } catch (IOException e) {
            throw new IllegalStateException("cannot enumerate classpath entries for package " + packageName, e);
        }
        while (resources.hasMoreElements()) {
            URL url = resources.nextElement();
            switch (url.getProtocol()) {
                case "file" -> collectFromDirectory(url, packageName, names);
                case "jar" -> collectFromJar(url, packagePath, packageName, names);
                default -> {
                    // Some other classpath entry kind (e.g. a custom protocol) — nothing
                    // this dependency-free scan knows how to enumerate.
                }
            }
        }
        return names;
    }

    private static void collectFromDirectory(URL url, String packageName, Set<String> names) {
        Path dir;
        try {
            dir = Path.of(url.toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException("cannot resolve classpath directory for package " + packageName, e);
        }
        try (DirectoryStream<Path> entries = Files.newDirectoryStream(dir, "*.class")) {
            for (Path entry : entries) {
                addClassName(names, packageName, entry.getFileName().toString());
            }
        } catch (IOException e) {
            throw new IllegalStateException(
                    "cannot list classpath directory " + dir + " for package " + packageName, e);
        }
    }

    private static void collectFromJar(URL url, String packagePath, String packageName, Set<String> names) {
        String prefix = packagePath + "/";
        try {
            JarURLConnection connection = (JarURLConnection) url.openConnection();
            // Never close a JarFile the URL-connection cache shares with the classloader.
            connection.setUseCaches(false);
            try (JarFile jar = connection.getJarFile()) {
                Enumeration<JarEntry> entries = jar.entries();
                while (entries.hasMoreElements()) {
                    String name = entries.nextElement().getName();
                    if (!name.startsWith(prefix) || !name.endsWith(".class")) continue;
                    String fileName = name.substring(prefix.length());
                    if (fileName.contains("/")) continue; // subpackage — not a star-import match
                    addClassName(names, packageName, fileName);
                }
            }
        } catch (IOException e) {
            throw new IllegalStateException("cannot read classpath jar " + url + " for package " + packageName, e);
        }
    }

    private static void addClassName(Set<String> names, String packageName, String classFileName) {
        String simpleName = classFileName.substring(0, classFileName.length() - ".class".length());
        if (simpleName.contains("$") || simpleName.equals("package-info") || simpleName.equals("module-info")) {
            return;
        }
        names.add(packageName + "." + simpleName);
    }

    /**
     * Does {@code className} qualify as a wildcard match — the same two shapes {@link
     * #resolveUnits} accepts for an explicit FQN? Checked without initializing the class
     * (so scanning a package never runs an unrelated class's static initializer); a class
     * that can't even be loaded is a non-match, skipped silently like any other
     * non-holder in the package.
     */
    private static boolean isStepDefinitionHolder(String className, ClassLoader loader) {
        Class<?> rawClass;
        try {
            rawClass = Class.forName(className, false, loader);
        } catch (ClassNotFoundException | LinkageError e) {
            return false;
        }
        try {
            if (StepDefinitions.class.isAssignableFrom(rawClass)) {
                return !Modifier.isAbstract(rawClass.getModifiers());
            }
            for (Method m : rawClass.getMethods()) {
                if (Modifier.isStatic(m.getModifiers())
                        && m.getParameterCount() == 0
                        && StepDefinitions.class.isAssignableFrom(m.getReturnType())) {
                    return true;
                }
            }
        } catch (LinkageError e) {
            return false;
        }
        return false;
    }

    /**
     * Resolves one configured class name to its step-definition load units.
     * Either the class implements {@link StepDefinitions} (instantiated via its
     * no-arg constructor — the original path), or it exposes public static
     * no-arg methods whose return type is assignable to {@link StepDefinitions}
     * (each invoked; name-sorted for determinism). The static-factory shape is
     * what a Kotlin top-level {@code val steps = steps(...) {...}}
     * compiles to (a file-facade class with a static getter), but the check is
     * plain reflection — nothing Kotlin-specific.
     */
    private static List<StepDefinitions<?>> resolveUnits(String className, ClassLoader loader) {
        Class<?> rawClass;
        try {
            rawClass = Class.forName(className, true, loader);
        } catch (ClassNotFoundException e) {
            throw new IllegalArgumentException("step-definition class not found: " + className, e);
        }
        if (StepDefinitions.class.isAssignableFrom(rawClass)) {
            return List.of(instantiate(rawClass));
        }
        List<StepDefinitions<?>> units = new ArrayList<>();
        List<Method> factories = new ArrayList<>();
        for (Method m : rawClass.getMethods()) {
            if (Modifier.isStatic(m.getModifiers())
                    && m.getParameterCount() == 0
                    && StepDefinitions.class.isAssignableFrom(m.getReturnType())) {
                factories.add(m);
            }
        }
        factories.sort(Comparator.comparing(Method::getName));
        for (Method factory : factories) {
            try {
                units.add((StepDefinitions) factory.invoke(null));
            } catch (IllegalAccessException | InvocationTargetException e) {
                throw new IllegalStateException("cannot invoke static step-definition factory " + factory, e);
            }
        }
        if (units.isEmpty()) {
            throw new IllegalArgumentException(className
                    + " neither implements "
                    + StepDefinitions.class.getName()
                    + " nor exposes a public static no-arg method returning it");
        }
        return units;
    }

    private static StepDefinitions instantiate(Class<?> rawClass) {
        try {
            return (StepDefinitions) rawClass.getDeclaredConstructor().newInstance();
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException(rawClass.getName() + " has no public no-arg constructor", e);
        } catch (InstantiationException | IllegalAccessException | InvocationTargetException e) {
            throw new IllegalStateException("cannot instantiate " + rawClass.getName(), e);
        }
    }
}
