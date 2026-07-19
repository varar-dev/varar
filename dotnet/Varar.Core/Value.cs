using System.Collections.Immutable;

namespace Varar.Core;

/// <summary>
/// The dynamic value model — the C# replacement for TypeScript var-core's raw JS
/// values with <c>deepEqual</c> duck-typing (see <c>deep-equal.ts</c>), mirroring
/// the Rust port's <c>Value</c> enum. One closed hierarchy carries handler
/// arguments, handler returns, thread-through state, table rows, and the
/// conformance wire values.
/// <para>
/// Equality is structural (the analog of JS <c>deepEqual</c> / Java
/// <c>Objects.equals</c>): <c>Int(2) != Float(2.0)</c> (distinct cases),
/// <see cref="VList"/> is order-sensitive, and <see cref="VMap"/> is
/// order-insensitive.
/// </para>
/// </summary>
public abstract record Value
{
    public static readonly Value Null = VNull.Instance;

    public static Value Of(bool value) => new VBool(value);

    public static Value Of(int value) => new VInt(value);

    public static Value Of(long value) => new VInt(value);

    public static Value Of(double value) => new VFloat(value);

    public static Value Of(string value) => new VString(value);

    public static Value List(IEnumerable<Value> items) => new VList(items.ToImmutableArray());

    public static Value Map(IEnumerable<KeyValuePair<string, Value>> entries) =>
        new VMap(entries.ToImmutableDictionary(e => e.Key, e => e.Value));

    /// <summary>Short type name for <c>ReturnShapeError</c> messages (mirrors Java's <c>getSimpleName()</c>).</summary>
    public abstract string TypeName { get; }

    /// <summary>The <see cref="long"/> of a <see cref="VInt"/>, else throws.</summary>
    public long AsInt() =>
        this is VInt v ? v.Int : throw new InvalidOperationException($"expected Integer, got {TypeName}");

    /// <summary>The <see cref="string"/> of a <see cref="VString"/>, else throws.</summary>
    public string AsString() =>
        this is VString v ? v.Str : throw new InvalidOperationException($"expected String, got {TypeName}");

    /// <summary>Indexes into a <see cref="VMap"/>, else throws.</summary>
    public Value this[string key] =>
        this is VMap m && m.Entries.TryGetValue(key, out var v)
            ? v
            : throw new KeyNotFoundException($"no key '{key}' in {TypeName}");
}

public sealed record VNull : Value
{
    public static readonly VNull Instance = new();

    private VNull()
    {
    }

    public override string TypeName => "null";
}

public sealed record VBool(bool Bool) : Value
{
    public override string TypeName => "Boolean";
}

public sealed record VInt(long Int) : Value
{
    public override string TypeName => "Integer";
}

public sealed record VFloat(double Float) : Value
{
    public override string TypeName => "Double";
}

public sealed record VString(string Str) : Value
{
    public override string TypeName => "String";
}

/// <summary>An ordered list. Equality is element-wise and order-sensitive.</summary>
public sealed record VList(ImmutableArray<Value> Items) : Value
{
    public override string TypeName => "List";

    public bool Equals(VList? other) => other is not null && Items.SequenceEqual(other.Items);

    public override int GetHashCode()
    {
        var hash = new HashCode();
        foreach (var item in Items)
        {
            hash.Add(item);
        }

        return hash.ToHashCode();
    }
}

/// <summary>A string-keyed map. Equality is order-insensitive (by key/value pairs).</summary>
public sealed record VMap(ImmutableDictionary<string, Value> Entries) : Value
{
    public override string TypeName => "Map";

    public bool Equals(VMap? other)
    {
        if (other is null || Entries.Count != other.Entries.Count)
        {
            return false;
        }

        foreach (var (key, value) in Entries)
        {
            if (!other.Entries.TryGetValue(key, out var otherValue) || !value.Equals(otherValue))
            {
                return false;
            }
        }

        return true;
    }

    public override int GetHashCode()
    {
        // XOR of per-entry hashes → order-insensitive.
        var hash = 0;
        foreach (var (key, value) in Entries)
        {
            hash ^= HashCode.Combine(key, value);
        }

        return hash;
    }
}
