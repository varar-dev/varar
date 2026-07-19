using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>A sentence within a block: its trimmed text plus the block-relative offsets.</summary>
public sealed record Sentence(string Text, int StartOffset, int EndOffset);

public static class Sentences
{
    private static readonly HashSet<string> Abbreviations = new(StringComparer.Ordinal)
    {
        "e.g.", "i.e.", "etc.", "cf.", "vs.",
    };

    /// <summary>
    /// Splits block text into sentences on <c>.</c>/<c>!</c>/<c>?</c>/newline, leaving terminators inside
    /// backtick spans, double-quoted strings, numbers, and known abbreviations alone. Port of
    /// <c>sentences.ts</c>.
    /// </summary>
    public static ImmutableArray<Sentence> Split(string text)
    {
        var outp = ImmutableArray.CreateBuilder<Sentence>();
        int i = 0;
        int segmentStart = 0;
        var skip = new bool[text.Length];

        // Mark backtick code spans and double-quoted strings as no-split zones.
        for (int j = 0; j < text.Length; j++)
        {
            char c = text[j];
            if (c == '`')
            {
                int close = text.IndexOf('`', j + 1);
                if (close == -1)
                {
                    break;
                }

                for (int k = j; k <= close; k++)
                {
                    skip[k] = true;
                }

                j = close;
            }
            else if (c == '"')
            {
                int close = text.IndexOf('"', j + 1);
                if (close == -1)
                {
                    break;
                }

                for (int k = j; k <= close; k++)
                {
                    skip[k] = true;
                }

                j = close;
            }
        }

        while (i < text.Length)
        {
            if (skip[i])
            {
                i++;
                continue;
            }

            char ch = text[i];
            if (ch == '\n' || ch == '.' || ch == '!' || ch == '?')
            {
                if (ch == '.' && IsInsideNumberOrAbbrev(text, i))
                {
                    i++;
                    continue;
                }

                int end = i + 1;
                PushSegment(outp, text, segmentStart, end);
                i = end;
                while (i < text.Length && (text[i] == ' ' || text[i] == '\n'))
                {
                    i++;
                }

                segmentStart = i;
                continue;
            }

            i++;
        }

        PushSegment(outp, text, segmentStart, text.Length);
        return outp.ToImmutable();
    }

    private static void PushSegment(ImmutableArray<Sentence>.Builder outp, string text, int start, int end)
    {
        if (end <= start)
        {
            return;
        }

        var seg = text.Substring(start, end - start);
        var slice = seg.Trim();
        if (slice.Length == 0)
        {
            return;
        }

        int trimmedStart = start + (seg.Length - seg.TrimStart().Length);
        int trimmedEnd = trimmedStart + slice.Length;
        outp.Add(new Sentence(slice, trimmedStart, trimmedEnd));
    }

    private static bool IsInsideNumberOrAbbrev(string text, int dotPos)
    {
        char prev = dotPos - 1 >= 0 ? text[dotPos - 1] : '\0';
        char next = dotPos + 1 < text.Length ? text[dotPos + 1] : '\0';
        if (prev >= '0' && prev <= '9' && next >= '0' && next <= '9')
        {
            return true;
        }

        foreach (var abbrev in Abbreviations)
        {
            int sliceStart = Math.Max(0, dotPos + 1 - abbrev.Length);
            if (text.Substring(sliceStart, dotPos + 1 - sliceStart) == abbrev)
            {
                return true;
            }
        }

        return next >= 'a' && next <= 'z';
    }
}
