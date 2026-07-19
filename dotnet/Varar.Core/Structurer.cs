using System.Collections.Immutable;
using System.Text.RegularExpressions;

namespace Varar.Core;

/// <summary>
/// Turns the flat block stream into examples under heading scopes. Port of <c>structurer.ts</c>.
/// Paragraph/list-item/blockquote become candidate examples; headings are scope markers; tables and
/// fences immediately following a candidate (no blank line, heading, or thematic break between)
/// attach to it, otherwise they are orphans.
/// </summary>
public static partial class Structurer
{
    [GeneratedRegex(@"\n\s*\n")]
    private static partial Regex BlankLineRe();

    public static VarDoc Structure(string path, string source, ImmutableArray<Block> blocks)
    {
        var examples = new List<Example>();
        var orphanAttachments = ImmutableArray.CreateBuilder<Block>();
        var scopeStack = new List<(int Level, string Text)>();
        int lastExampleIdx = -1;
        bool attachmentOpen = false;

        foreach (var block in blocks)
        {
            switch (block)
            {
                case Heading heading:
                    while (scopeStack.Count > 0 && scopeStack[^1].Level >= heading.Level)
                    {
                        scopeStack.RemoveAt(scopeStack.Count - 1);
                    }

                    scopeStack.Add((heading.Level, heading.Text));
                    attachmentOpen = false;
                    break;

                case Paragraph:
                case ListItem:
                case Blockquote:
                    if (attachmentOpen && lastExampleIdx >= 0)
                    {
                        var prev = examples[lastExampleIdx];
                        var prevLast = prev.Body[^1];
                        bool lastIsAttachment = prevLast is Table or Fence;
                        if (lastIsAttachment &&
                            !BlankLineRe().IsMatch(Scanner.Slice(source, prev.Span.EndOffset, block.Span.StartOffset)))
                        {
                            var mergedSpan = Span.FromOffsets(source, prev.Span.StartOffset, block.Span.EndOffset);
                            examples[lastExampleIdx] = prev with { Span = mergedSpan, Body = prev.Body.Add(block) };
                            break;
                        }
                    }

                    examples.Add(new Example(
                        [.. scopeStack.Select(s => s.Text)],
                        block.Span,
                        [block]));
                    lastExampleIdx = examples.Count - 1;
                    attachmentOpen = true;
                    break;

                case Table:
                case Fence:
                    if (attachmentOpen && lastExampleIdx >= 0)
                    {
                        var prev = examples[lastExampleIdx];
                        var mergedSpan = Span.FromOffsets(source, prev.Span.StartOffset, block.Span.EndOffset);
                        examples[lastExampleIdx] = prev with { Span = mergedSpan, Body = prev.Body.Add(block) };
                        break;
                    }

                    orphanAttachments.Add(block);
                    break;

                case ThematicBreak:
                    attachmentOpen = false;
                    break;
            }
        }

        return new VarDoc(path, source, [.. examples], orphanAttachments.ToImmutable());
    }
}
