using System;
using CucumberExpressions.Parsing;
using Xunit;

namespace Varar.Core.Tests;

/// <summary>
/// Guards the load-bearing assumption behind the whole port: the offsets
/// cucumber-expressions reports (via .NET <see cref="System.Text.RegularExpressions.Regex"/>
/// group indices) are UTF-16 code units — exactly the units the shared conformance
/// goldens encode. That is why the C# core needs no code-point→UTF-16 conversion
/// layer (unlike the Python port). If a future cucumber-expressions release ever
/// changed this, this test would fail before any golden did.
/// </summary>
public class CucumberOffsetTests
{
    [Fact]
    public void GroupOffsets_AreUtf16CodeUnits_NotCodePoints()
    {
        // "😀" (U+1F600) is 1 code point but 2 UTF-16 code units.
        const string subject = "😀 have 42 cukes";
        var group = new TreeRegexp(@"😀 have (\d+) cukes").Match(subject);

        int utf16Index = subject.IndexOf("42", StringComparison.Ordinal); // == 8 in UTF-16 units
        Assert.Equal(8, utf16Index);

        var captured = group.Children[0];
        Assert.Equal("42", captured.Value);
        Assert.Equal(utf16Index, captured.Start); // 8 (UTF-16), not 7 (code points)
        Assert.Equal(10, captured.End);
    }
}
