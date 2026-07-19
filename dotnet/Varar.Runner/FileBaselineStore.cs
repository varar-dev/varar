using System.IO;
using Varar.Core;

namespace Varar.Runner;

/// <summary>
/// The filesystem <see cref="IBaselineStore"/>: the committed drift baseline lives at the project
/// root as <c>varar.lock.json</c>. The core owns the format; this only reads/writes the raw text.
/// </summary>
public sealed class FileBaselineStore : IBaselineStore
{
    private readonly string _path;

    public FileBaselineStore(string root) => _path = Path.Combine(root, "varar.lock.json");

    public string? Read() => File.Exists(_path) ? File.ReadAllText(_path) : null;

    public void Write(string contents) => File.WriteAllText(_path, contents);
}
