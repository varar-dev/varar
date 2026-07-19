using System.Collections.Immutable;
using System.Text;
using System.Text.RegularExpressions;
using Varar.Config;

namespace Varar.Runner;

/// <summary>
/// Spec discovery: the shared glob→regex semantics (matching every other runner byte-for-byte on
/// <c>**</c>, <c>*</c>, <c>?</c>), a recursive file walk, and include/exclude filtering. Port of the
/// runner <c>discovery</c> module.
/// </summary>
public static class Discovery
{
    /// <summary>Translate a glob (<c>/**/</c>, <c>/**</c>, <c>**/</c>, <c>**</c>, <c>*</c>, <c>?</c>) to an anchored regex.</summary>
    public static Regex GlobToRegex(string pattern)
    {
        int n = pattern.Length;

        bool Starts(int i, string pat)
        {
            for (int k = 0; k < pat.Length; k++)
            {
                if (i + k >= n || pattern[i + k] != pat[k])
                {
                    return false;
                }
            }

            return true;
        }

        var outp = new StringBuilder("^");
        int idx = 0;
        while (idx < n)
        {
            if (pattern[idx] == '/' && Starts(idx, "/**/"))
            {
                outp.Append("/(?:.+/)?");
                idx += 4;
            }
            else if (pattern[idx] == '/' && Starts(idx, "/**") && idx + 3 == n)
            {
                outp.Append("(?:/.*)?");
                idx += 3;
            }
            else if (pattern[idx] == '*' && Starts(idx, "**/"))
            {
                outp.Append("(?:.*/)?");
                idx += 3;
            }
            else if (pattern[idx] == '*' && Starts(idx, "**"))
            {
                outp.Append(".*");
                idx += 2;
            }
            else if (pattern[idx] == '*')
            {
                outp.Append("[^/]*");
                idx += 1;
            }
            else if (pattern[idx] == '?')
            {
                outp.Append("[^/]");
                idx += 1;
            }
            else
            {
                outp.Append(Regex.Escape(pattern[idx].ToString()));
                idx += 1;
            }
        }

        outp.Append('$');
        return new Regex(outp.ToString(), RegexOptions.None);
    }

    /// <summary>True iff <paramref name="relPosix"/> matches an include glob and no exclude glob.</summary>
    public static bool MatchSpec(string relPosix, ImmutableArray<string> include, ImmutableArray<string> exclude) =>
        include.Any(g => GlobToRegex(g).IsMatch(relPosix)) && !exclude.Any(g => GlobToRegex(g).IsMatch(relPosix));

    /// <summary>Files under <paramref name="root"/> matching <c>docs.include</c> and no <c>docs.exclude</c>, sorted.</summary>
    public static ImmutableArray<string> FindSpecs(ParsedVarConfig config, string root)
    {
        if (!Directory.Exists(root))
        {
            return [];
        }

        return
        [
            .. Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
                .Where(path => MatchSpec(RelPosix(path, root), config.Docs.Include, config.Docs.Exclude))
                .OrderBy(p => p, StringComparer.Ordinal),
        ];
    }

    /// <summary>The path relative to <paramref name="root"/>, forward-slashed.</summary>
    public static string RelPosix(string path, string root)
    {
        var rel = Path.GetRelativePath(root, path);
        return rel.Replace(Path.DirectorySeparatorChar, '/');
    }
}
