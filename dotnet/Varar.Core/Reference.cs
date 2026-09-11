using System.Collections.Immutable;
using System.Text.RegularExpressions;

namespace Varar.Core;

/// <summary>
/// One resolved reference block: the referenced oath's path (resolved against the referring doc's
/// own path), the GFM slug of the heading (empty for a whole-file link), and the link's text.
/// </summary>
public sealed record Reference(string Path, string Slug, string Text);

/// <summary>
/// What <see cref="Plan.Run"/> needs to resolve references: every oath by path, plus which sections
/// a reference block consumes somewhere in the project. A section that is referenced stops being a
/// standalone example, so this is whole-project knowledge — see ADR 0016 on why each runner builds
/// it at its once-per-run discovery pass.
/// </summary>
public sealed record OathWorkspace(
    ImmutableDictionary<string, Doc> Docs,
    ImmutableHashSet<string> Referenced);

/// <summary>
/// Reuse is a link (ADR 0016). A candidate block whose entire content is a single Markdown link to
/// an oath section is a REFERENCE BLOCK: it splices that section's steps in at its own position
/// instead of being prose.
/// <para>
/// Everything here is pure text and path arithmetic — no filesystem. The shell reads the documents;
/// <see cref="References"/> tells it which ones to read, and <see cref="BuildWorkspace"/> turns the
/// collection into what the planner needs.
/// </para>
/// </summary>
public static partial class Reference_
{
    // A candidate is a reference block iff its whole text is one Markdown link whose target is
    // oath-shaped. Anything else — a link with surrounding words, a link to https://…, to a .cs
    // file, to a mailto: — is ordinary content, so existing documents keep their meaning.
    [GeneratedRegex(@"^\[([^\]]*)\]\(\s*([^\s)]+)\s*\)$")]
    private static partial Regex LinkOnly();

    [GeneratedRegex(@"^[a-zA-Z][a-zA-Z0-9+.\-]*:")]
    private static partial Regex Protocol();

    [GeneratedRegex(@"[^\p{L}\p{N} _-]")]
    private static partial Regex NotSlug();

    [GeneratedRegex("`([^`]*)`")]
    private static partial Regex CodeSpan();

    [GeneratedRegex(@"\*\*([^*]*)\*\*")]
    private static partial Regex Strong();

    [GeneratedRegex(@"\*([^*]*)\*")]
    private static partial Regex Emph();

    [GeneratedRegex("_([^_]*)_")]
    private static partial Regex Under();

    /// <summary>The reference a block's text spells, or null when it is ordinary content.</summary>
    public static Reference? ReferenceOf(string text, string fromPath)
    {
        var m = LinkOnly().Match(text.Trim());
        if (!m.Success)
        {
            return null;
        }

        var linkText = m.Groups[1].Value;
        var target = m.Groups[2].Value;
        if (target.StartsWith('#'))
        {
            return new Reference(fromPath, NormalizeSlug(target[1..]), linkText);
        }

        var hash = target.IndexOf('#');
        var filePart = hash == -1 ? target : target[..hash];
        var fragment = hash == -1 ? string.Empty : target[(hash + 1)..];

        // Only a relative Markdown path is a reference. A protocol (https:, mailto:) or any other
        // extension is left alone — remote references are deliberately out of scope (ADR 0016).
        if (!filePart.EndsWith(".md", StringComparison.Ordinal)
            || Protocol().IsMatch(filePart)
            || filePart.StartsWith('/'))
        {
            return null;
        }

        return new Reference(JoinPosix(DirnamePosix(fromPath), filePart), NormalizeSlug(fragment), linkText);
    }

    /// <summary>
    /// GitHub's heading anchors: inline markup dropped, lowercased, spaces to hyphens, everything
    /// else that isn't a word character or hyphen removed. The same function produces the slug of a
    /// heading and normalizes the slug written in a link, so the two meet in the middle.
    /// </summary>
    public static string Slugify(string headingText)
    {
        var s = CodeSpan().Replace(headingText, "$1");
        s = Strong().Replace(s, "$1");
        s = Emph().Replace(s, "$1");
        s = Under().Replace(s, "$1");
        return NormalizeSlug(s);
    }

    // One hyphen per space, not per run of them: GitHub leaves the gap where it dropped
    // punctuation, so "Fees, VAT & rounding" slugs with a double hyphen.
    private static string NormalizeSlug(string s) =>
        NotSlug().Replace(s.Trim().ToLowerInvariant(), string.Empty).Replace(' ', '-');

    private static string DirnamePosix(string path)
    {
        var i = path.LastIndexOf('/');
        return i == -1 ? string.Empty : path[..i];
    }

    /// <summary>
    /// POSIX path arithmetic on oath paths (always '/'-separated, relative to the workspace root).
    /// The core may not touch the filesystem.
    /// </summary>
    public static string JoinPosix(string dir, string rel)
    {
        var segments = dir.Length == 0 ? [] : new List<string>(dir.Split('/'));
        foreach (var segment in rel.Split('/'))
        {
            if (segment.Length == 0 || segment == ".")
            {
                continue;
            }

            if (segment == "..")
            {
                if (segments.Count > 0)
                {
                    segments.RemoveAt(segments.Count - 1);
                }
            }
            else
            {
                segments.Add(segment);
            }
        }

        return string.Join("/", segments);
    }

    /// <summary>
    /// Every reference block in a document, in document order. The shell uses this to walk the
    /// closure of documents it must read before planning.
    /// </summary>
    public static ImmutableArray<Reference> References(Doc doc)
    {
        var out_ = ImmutableArray.CreateBuilder<Reference>();
        foreach (var ex in doc.Examples)
        {
            if (ex.Body.Length == 0 || TextOf(ex.Body[0]) is not { } text)
            {
                continue;
            }

            if (ReferenceOf(text, doc.Path) is { } reference)
            {
                out_.Add(reference);
            }
        }

        return out_.ToImmutable();
    }

    /// <summary>The text of a text-bearing block, or null for a table or fence.</summary>
    public static string? TextOf(Block block) => block switch
    {
        Paragraph p => p.Text,
        ListItem l => l.Text,
        Blockquote b => b.Text,
        _ => null,
    };

    /// <summary>A section's identity across the project.</summary>
    public static string SectionKey(string path, string slug) => $"{path}#{slug}";

    /// <summary>
    /// The workspace with no references at all: what a caller planning a single document in
    /// isolation passes.
    /// </summary>
    public static OathWorkspace EmptyWorkspace() =>
        new(ImmutableDictionary<string, Doc>.Empty, ImmutableHashSet<string>.Empty);

    /// <summary>Index every oath by path and record every consumed section.</summary>
    public static OathWorkspace BuildWorkspace(IEnumerable<Doc> docs)
    {
        var list = docs.ToList();
        var byPath = ImmutableDictionary.CreateBuilder<string, Doc>();
        foreach (var doc in list)
        {
            byPath[doc.Path] = doc;
        }

        var referenced = ImmutableHashSet.CreateBuilder<string>();
        foreach (var doc in list)
        {
            foreach (var r in References(doc))
            {
                referenced.Add(SectionKey(r.Path, r.Slug));
            }
        }

        return new OathWorkspace(byPath.ToImmutable(), referenced.ToImmutable());
    }

    /// <summary>
    /// The candidates that make up a section: those whose heading chain contains the slug. A
    /// whole-file reference (empty slug) is every candidate in the document. Section membership
    /// follows the document outline exactly — a heading's section runs until the next heading of the
    /// same or higher level, which is precisely the range over which it stays on the scope stack.
    /// </summary>
    public static ImmutableArray<Example> SectionCandidates(Doc doc, string slug) =>
        slug.Length == 0
            ? doc.Examples
            : [.. doc.Examples.Where(ex => ex.ScopeStack.Any(h => Slugify(h) == slug))];
}
