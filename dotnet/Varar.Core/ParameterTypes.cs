using System.Globalization;
using CucumberExpressions;

namespace Varar.Core;

/// <summary>Turns a parameter's captured regex groups into the handler's argument value.</summary>
public delegate Value ParameterTransform(IReadOnlyList<string?> groups);

/// <summary>Renders a value in the document's notation — display only, for a parameter mismatch's "actual" side.</summary>
public delegate string ParameterFormat(Value value);

/// <summary>
/// var's concrete <see cref="IParameterType"/>. The .NET cucumber-expressions package
/// ships only the interfaces (unlike the JS/JVM editions' built-in registry), so var
/// supplies its own parameter types — carrying, beyond the cucumber-facing metadata, a
/// <see cref="Transform"/> that converts captured text to a <see cref="Value"/>.
/// </summary>
public sealed class VararParameterType : IParameterType
{
    public VararParameterType(
        string name,
        string[] regexStrings,
        Type parameterType,
        ParameterTransform transform,
        int weight = 0,
        bool useForSnippets = true)
    {
        Name = name;
        RegexStrings = regexStrings;
        ParameterType = parameterType;
        Transform = transform;
        Weight = weight;
        UseForSnippets = useForSnippets;
    }

    public string[] RegexStrings { get; }

    public string Name { get; }

    public Type ParameterType { get; }

    public int Weight { get; }

    public bool UseForSnippets { get; }

    public ParameterTransform Transform { get; }
}

/// <summary>
/// var's <see cref="IParameterTypeRegistry"/>: a mutable name → type map, mirroring how JS
/// cucumber's <c>ParameterTypeRegistry</c> is shared-mutable across compilations. The
/// built-in set (int/float/double/word/string/anonymous) reuses the package's own
/// <see cref="ParameterTypeConstants"/> patterns so it stays byte-identical to every other port.
/// <para>Value transforms are wired here but only exercised once matching lands (T5).</para>
/// </summary>
public sealed class ParameterTypeRegistry : IParameterTypeRegistry
{
    private readonly Dictionary<string, IParameterType> _byName = new(StringComparer.Ordinal);

    public void Define(VararParameterType type)
    {
        if (_byName.ContainsKey(type.Name))
        {
            throw new InvalidOperationException($"a parameter type named '{type.Name}' is already defined");
        }

        _byName[type.Name] = type;
    }

    public IParameterType? LookupByTypeName(string name) =>
        _byName.TryGetValue(name, out var type) ? type : null;

    public IEnumerable<IParameterType> GetParameterTypes() => _byName.Values;

    /// <summary>A fresh registry pre-loaded with the standard cucumber-expressions built-ins.</summary>
    public static ParameterTypeRegistry CreateDefault()
    {
        var registry = new ParameterTypeRegistry();

        registry.Define(new VararParameterType(
            ParameterTypeConstants.IntParameterName,
            ParameterTypeConstants.IntParameterRegexps,
            typeof(long),
            groups => Value.Of(long.Parse(groups[0]!, CultureInfo.InvariantCulture))));

        registry.Define(new VararParameterType(
            ParameterTypeConstants.FloatParameterName,
            ParameterTypeConstants.FloatParameterRegexps,
            typeof(double),
            ParseFloat));

        registry.Define(new VararParameterType(
            ParameterTypeConstants.DoubleParameterName,
            ParameterTypeConstants.FloatParameterRegexps,
            typeof(double),
            ParseFloat));

        registry.Define(new VararParameterType(
            ParameterTypeConstants.WordParameterName,
            ParameterTypeConstants.WordParameterRegexps,
            typeof(string),
            groups => Value.Of(groups[0] ?? string.Empty)));

        registry.Define(new VararParameterType(
            ParameterTypeConstants.StringParameterName,
            ParameterTypeConstants.StringParameterRegexps,
            typeof(string),
            ParseString));

        // var's own built-in: Markdown emphasis. Only the inner text is the value
        // (the outermost delimiter pair is stripped). Kept byte-identical to the
        // other ports' EMPH regexp.
        registry.Define(new VararParameterType(
            "emph",
            [EmphRegex],
            typeof(string),
            ParseEmph,
            useForSnippets: false));

        // The anonymous {} parameter.
        registry.Define(new VararParameterType(
            string.Empty,
            [ParameterTypeConstants.AnonymousParameterRegex],
            typeof(string),
            groups => Value.Of(groups[0] ?? string.Empty),
            useForSnippets: false));

        return registry;
    }

    // Markdown emphasis, ordered longest-delimiter-first so `**x**` isn't half-eaten
    // by the `*` branch. Byte-identical to the other ports' EMPH regexp.
    internal const string EmphRegex =
        @"\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_";

    // The .NET cucumber-expressions build compiles a parameter's inner groups as
    // non-capturing, so the transform receives the whole match (e.g. `**Emma**`).
    // Strip the outermost delimiter run — 1..3 of the leading `*`/`_` from each end —
    // to yield the inner text (`**_Emma_**` → `_Emma_`). Robust if a build instead
    // hands us the already-inner text: its first char isn't a delimiter, so nothing
    // is stripped.
    private static Value ParseEmph(IReadOnlyList<string?> groups)
    {
        var raw = groups.FirstOrDefault(g => g is not null) ?? string.Empty;
        if (raw.Length == 0)
        {
            return Value.Of(raw);
        }

        var delimiter = raw[0];
        if (delimiter != '*' && delimiter != '_')
        {
            return Value.Of(raw);
        }

        var run = 0;
        while (run < raw.Length && raw[run] == delimiter)
        {
            run++;
        }

        return Value.Of(raw.Substring(run, raw.Length - (2 * run)));
    }

    // Note: float/string value transforms are placeholders until matching (T5) pins their
    // exact semantics against the plan/trace goldens (group separators, quote unescaping).
    private static Value ParseFloat(IReadOnlyList<string?> groups) =>
        Value.Of(double.Parse(groups[0]!, NumberStyles.Float, CultureInfo.InvariantCulture));

    private static Value ParseString(IReadOnlyList<string?> groups)
    {
        var raw = groups.FirstOrDefault(g => g is not null) ?? string.Empty;
        // The .NET cucumber-expressions build captures {string} WITH its surrounding quotes
        // (the inner groups are compiled non-capturing), so strip the quotes, then unescape.
        if (raw.Length >= 2 &&
            ((raw[0] == '"' && raw[^1] == '"') || (raw[0] == '\'' && raw[^1] == '\'')))
        {
            raw = raw[1..^1];
        }

        return Value.Of(raw.Replace("\\\"", "\"").Replace("\\'", "'"));
    }
}
