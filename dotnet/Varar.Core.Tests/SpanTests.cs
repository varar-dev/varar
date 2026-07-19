using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Translated from span.test.ts.
public class SpanTests
{
    [Fact]
    public void ComputesLineAndColumnForSingleLineSource()
    {
        var span = Span.FromOffsets("hello world", 6, 11);
        Assert.Equal(new Span(6, 11, 1, 7, 1, 12), span);
    }

    [Fact]
    public void HandlesMultiLineSources()
    {
        // 'two' starts at offset 14, ends at 17 in "line one\nline two\nline three".
        var span = Span.FromOffsets("line one\nline two\nline three", 14, 17);
        Assert.Equal(new Span(14, 17, 2, 6, 2, 9), span);
    }

    [Fact]
    public void HandlesRangeCrossingANewline()
    {
        // From offset 1 ('b') to 4 ('d') in "ab\ncd".
        var span = Span.FromOffsets("ab\ncd", 1, 4);
        Assert.Equal(new Span(1, 4, 1, 2, 2, 2), span);
    }

    [Fact]
    public void CountsAstralCharactersAsTwoUtf16Units()
    {
        // "😀x": the emoji is 2 UTF-16 units, so 'x' sits at offset 2, column 3.
        var span = Span.FromOffsets("😀x", 2, 3);
        Assert.Equal(new Span(2, 3, 1, 3, 1, 4), span);
    }
}
