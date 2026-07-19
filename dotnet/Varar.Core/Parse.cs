using System.Collections.Immutable;

namespace Varar.Core;

public static class Parse
{
    /// <summary>Parses Markdown source into a <see cref="VarDoc"/>. Port of <c>parse.ts</c>.</summary>
    public static VarDoc Run(string path, string source, IReadOnlyList<IScannerPlugin>? plugins = null) =>
        Structurer.Structure(path, source, Scanner.Scan(source, plugins ?? Array.Empty<IScannerPlugin>()));
}
