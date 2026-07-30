namespace Varar.Core;

public static class Parse
{
    /// <summary>Parses Markdown source into a <see cref="Doc"/>. Port of <c>parse.ts</c>.</summary>
    public static Doc Run(string path, string source) =>
        Structurer.Structure(path, source, Scanner.Scan(source));
}
