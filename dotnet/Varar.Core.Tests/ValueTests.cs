using System.Collections.Immutable;
using Varar.Core;
using Xunit;

namespace Varar.Core.Tests;

// Structural-equality semantics, mirroring deep-equal.ts intent adapted to the
// closed Value model (as the Rust/Java ports do).
public class ValueTests
{
    [Fact]
    public void PrimitivesCompareByValue()
    {
        Assert.Equal(Value.Of(3), Value.Of(3));
        Assert.NotEqual(Value.Of(3), Value.Of(4));
        Assert.Equal(Value.Of("a"), Value.Of("a"));
        Assert.Equal(Value.Null, Value.Null);
    }

    [Fact]
    public void IntAndFloatAreDistinctCases()
    {
        // Int(2) != Float(2.0) — mirrors Rust `Int(2) != Float(2.0)`.
        Assert.NotEqual(Value.Of(2L), Value.Of(2.0));
    }

    [Fact]
    public void NaNEqualsNaN()
    {
        Assert.Equal(Value.Of(double.NaN), Value.Of(double.NaN));
    }

    [Fact]
    public void ListsCompareElementWiseAndOrderSensitive()
    {
        Assert.Equal(
            Value.List([Value.Of(1), Value.Of(2), Value.Of(3)]),
            Value.List([Value.Of(1), Value.Of(2), Value.Of(3)]));
        Assert.NotEqual(
            Value.List([Value.Of(1), Value.Of(2)]),
            Value.List([Value.Of(1), Value.Of(2), Value.Of(3)]));
        Assert.NotEqual(
            Value.List([Value.Of(1), Value.Of(2)]),
            Value.List([Value.Of(2), Value.Of(1)]));
    }

    [Fact]
    public void MapsCompareByEntriesOrderInsensitive()
    {
        var ab = Value.Map([
            new("a", Value.Of(1)),
            new("b", Value.Map([new("c", Value.Of(2))])),
        ]);
        var ba = Value.Map([
            new("b", Value.Map([new("c", Value.Of(2))])),
            new("a", Value.Of(1)),
        ]);
        Assert.Equal(ab, ba); // insertion order does not matter

        Assert.NotEqual(
            Value.Map([new("a", Value.Of(1))]),
            Value.Map([new("a", Value.Of(1)), new("b", Value.Of(2))]));
    }

    [Fact]
    public void TypeNamesMatchTheReference()
    {
        Assert.Equal("null", Value.Null.TypeName);
        Assert.Equal("Boolean", Value.Of(true).TypeName);
        Assert.Equal("Integer", Value.Of(1).TypeName);
        Assert.Equal("Double", Value.Of(1.5).TypeName);
        Assert.Equal("String", Value.Of("x").TypeName);
        Assert.Equal("List", Value.List(ImmutableArray<Value>.Empty).TypeName);
        Assert.Equal("Map", Value.Map([]).TypeName);
    }

    [Fact]
    public void AccessorsReadScalarsAndMapKeys()
    {
        Assert.Equal(42L, Value.Of(42).AsInt());
        Assert.Equal("hi", Value.Of("hi").AsString());
        Assert.Equal(Value.Of(7), Value.Map([new("k", Value.Of(7))])["k"]);
    }
}
