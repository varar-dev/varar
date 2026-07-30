using System.Text.Encodings.Web;
using System.Text.Json;

namespace Varar.Core;

/// <summary>
/// Projects <see cref="OathResults"/> onto the JSON of <c>.varar/&lt;oathPath&gt;.json</c> (ADR 0014):
/// the TypeScript field names, in declaration order, 2-space indent, with the optional members
/// absent rather than null so a reader that predates them still parses the file.
/// </summary>
/// <remarks>
/// Not <see cref="CanonicalJson"/>, which sorts keys for the conformance goldens: the reference
/// implementation writes the payload in declaration order, and this file is read by humans diffing
/// it as much as by the language server. The relaxed encoder matches <c>JSON.stringify</c>, which
/// emits non-ASCII (a £ in an oath, say) raw rather than as <c>£</c>.
/// </remarks>
public static class ResultJson
{
    private static readonly JsonWriterOptions Options = new()
    {
        Indented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>The file's contents without its trailing newline — the writer adds that.</summary>
    public static string ToWireJson(OathResults results)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer, Options))
        {
            writer.WriteStartObject();
            writer.WriteNumber("version", results.Version);
            writer.WriteString("oathPath", results.OathPath);
            writer.WriteString("sourceHash", results.SourceHash);
            writer.WriteStartArray("examples");
            foreach (var example in results.Examples)
            {
                WriteExample(writer, example);
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static void WriteExample(Utf8JsonWriter writer, ExampleResult example)
    {
        writer.WriteStartObject();
        writer.WriteString("name", example.Name);
        writer.WriteString("status", example.Status == ExampleStatus.Passed ? "passed" : "failed");
        writer.WriteStartArray("lines");
        foreach (var line in example.Lines)
        {
            writer.WriteNumberValue(line);
        }

        writer.WriteEndArray();
        if (example.Failure is not null)
        {
            writer.WritePropertyName("failure");
            WriteFailure(writer, example.Failure);
        }

        writer.WriteEndObject();
    }

    private static void WriteFailure(Utf8JsonWriter writer, ExampleFailure failure)
    {
        writer.WriteStartObject();
        writer.WriteNumber("line", failure.Line);
        writer.WriteString("message", failure.Message);
        writer.WriteString("stack", failure.Stack);
        if (failure.Cells is { Length: > 0 } cells)
        {
            writer.WriteStartArray("cells");
            foreach (var cell in cells)
            {
                writer.WriteStartObject();
                writer.WriteNumber("from", cell.From);
                writer.WriteNumber("to", cell.To);
                writer.WriteString("actual", cell.Actual);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
        }

        if (failure.Anchor is not null)
        {
            writer.WriteStartObject("anchor");
            writer.WriteNumber("from", failure.Anchor.From);
            writer.WriteNumber("to", failure.Anchor.To);
            writer.WriteEndObject();
        }

        writer.WriteEndObject();
    }
}
