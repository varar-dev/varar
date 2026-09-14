//! Immutable run-result records — port of `result.ts` / `Result.java`. The
//! persisted `.varar/<oath>.json` file is a serialized [`OathResults`].

use crate::json_escape;
use std::fmt::Write;

/// One mismatched CELL as a source-offset range plus the runtime value.
/// `from`/`to` are absolute UTF-16 source offsets; `to` is exclusive.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CellFailure {
    pub from: usize,
    pub to: usize,
    pub actual: String,
}

impl CellFailure {
    pub fn new(from: usize, to: usize, actual: impl Into<String>) -> CellFailure {
        CellFailure {
            from,
            to,
            actual: actual.into(),
        }
    }
}

/// An example's run outcome.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Passed,
    Failed,
}

/// Where a failure points in the source: an offset range, `to` exclusive. The
/// failing step's match span, or the first mismatched cell's span (the
/// [`crate::failure_anchor`] rule). This is what lets a renderer underline the
/// step that failed rather than the whole line it sits on.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AnchorRange {
    pub from: usize,
    pub to: usize,
}

/// The failure payload of a failed [`ExampleResult`]. `cells` is `None`
/// when not applicable. `line` may be a caller-supplied fallback (`-1`).
/// `anchor` is `None` when the failure carries no location for this oath —
/// optional for the same reason `cells` is, and a renderer then falls back to
/// `line`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExampleFailure {
    pub line: i64,
    pub message: String,
    pub stack: String,
    pub cells: Option<Vec<CellFailure>>,
    pub anchor: Option<AnchorRange>,
    /// The document `line`, `cells` and `anchor` are offsets INTO. `None` — the
    /// overwhelming majority — means the oath itself. Set only when the failing
    /// step was spliced in from another oath by a reference block (ADR 0016):
    /// its spans belong to that document, and a renderer that placed them in
    /// this one would underline whatever text sat at those offsets.
    pub doc_path: Option<String>,
}

/// An oath other than this one that contributed steps to the run, with its
/// source hash as run (ADR 0016).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReferencedDocument {
    pub path: String,
    pub source_hash: String,
}

/// The run result for one BDD example.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExampleResult {
    pub name: String,
    pub status: Status,
    pub lines: Vec<usize>,
    pub failure: Option<ExampleFailure>,
}

/// The persisted run result for one oath file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OathResults {
    pub version: u32,
    pub oath_path: String,
    pub source_hash: String,
    /// Every OTHER document this run's steps came from — the oaths a reference
    /// block pulled steps in from (ADR 0016), with their hashes as run. Empty
    /// when no step was spliced in, which is the common case.
    pub documents: Vec<ReferencedDocument>,
    pub examples: Vec<ExampleResult>,
}

/// Projects [`OathResults`] onto the JSON of `.varar/<oath_path>.json` (ADR 0014):
/// the TypeScript field names, declaration order, 2-space indent, optional
/// members absent rather than null. No trailing newline — the writer adds it.
///
/// Written by hand because the reference implementation writes the payload in
/// declaration order, and this file is read by humans diffing it as much as by
/// the language server.
pub fn to_wire_json(results: &OathResults) -> String {
    let mut out = String::new();
    out.push_str("{\n");
    field(&mut out, 1, "version", &results.version.to_string(), true);
    string_field(&mut out, 1, "oathPath", &results.oath_path, true);
    string_field(&mut out, 1, "sourceHash", &results.source_hash, true);
    if !results.documents.is_empty() {
        indent(&mut out, 1);
        out.push_str("\"documents\": [\n");
        for (i, doc) in results.documents.iter().enumerate() {
            indent(&mut out, 2);
            out.push_str("{\n");
            string_field(&mut out, 3, "path", &doc.path, true);
            string_field(&mut out, 3, "sourceHash", &doc.source_hash, false);
            out.push('\n');
            indent(&mut out, 2);
            out.push('}');
            if i + 1 < results.documents.len() {
                out.push(',');
            }
            out.push('\n');
        }
        indent(&mut out, 1);
        out.push_str("],\n");
    }
    indent(&mut out, 1);
    out.push_str("\"examples\": ");
    write_examples(&mut out, &results.examples, 1);
    out.push('\n');
    out.push('}');
    out
}

fn write_examples(out: &mut String, examples: &[ExampleResult], depth: usize) {
    if examples.is_empty() {
        out.push_str("[]");
        return;
    }
    out.push_str("[\n");
    for (i, example) in examples.iter().enumerate() {
        indent(out, depth + 1);
        out.push_str("{\n");
        string_field(out, depth + 2, "name", &example.name, true);
        let status = match example.status {
            Status::Passed => "passed",
            Status::Failed => "failed",
        };
        string_field(out, depth + 2, "status", status, true);
        indent(out, depth + 2);
        out.push_str("\"lines\": ");
        write_ints(out, &example.lines, depth + 2);
        match &example.failure {
            Some(failure) => {
                out.push_str(",\n");
                indent(out, depth + 2);
                out.push_str("\"failure\": ");
                write_failure(out, failure, depth + 2);
                out.push('\n');
            }
            None => out.push('\n'),
        }
        indent(out, depth + 1);
        out.push('}');
        if i + 1 < examples.len() {
            out.push(',');
        }
        out.push('\n');
    }
    indent(out, depth);
    out.push(']');
}

fn write_failure(out: &mut String, failure: &ExampleFailure, depth: usize) {
    out.push_str("{\n");
    field(out, depth + 1, "line", &failure.line.to_string(), true);
    string_field(out, depth + 1, "message", &failure.message, true);
    let has_more =
        failure.cells.is_some() || failure.anchor.is_some() || failure.doc_path.is_some();
    string_field(out, depth + 1, "stack", &failure.stack, has_more);
    if let Some(cells) = &failure.cells {
        indent(out, depth + 1);
        out.push_str("\"cells\": [\n");
        for (i, cell) in cells.iter().enumerate() {
            indent(out, depth + 2);
            out.push_str("{\n");
            field(out, depth + 3, "from", &cell.from.to_string(), true);
            field(out, depth + 3, "to", &cell.to.to_string(), true);
            string_field(out, depth + 3, "actual", &cell.actual, false);
            indent(out, depth + 2);
            out.push('}');
            if i + 1 < cells.len() {
                out.push(',');
            }
            out.push('\n');
        }
        indent(out, depth + 1);
        out.push(']');
        out.push_str(if failure.anchor.is_some() || failure.doc_path.is_some() {
            ",\n"
        } else {
            "\n"
        });
    }
    if let Some(anchor) = &failure.anchor {
        indent(out, depth + 1);
        out.push_str("\"anchor\": {\n");
        field(out, depth + 2, "from", &anchor.from.to_string(), true);
        field(out, depth + 2, "to", &anchor.to.to_string(), false);
        indent(out, depth + 1);
        out.push('}');
        out.push_str(if failure.doc_path.is_some() {
            ",\n"
        } else {
            "\n"
        });
    }
    if let Some(doc_path) = &failure.doc_path {
        string_field(out, depth + 1, "docPath", doc_path, false);
        out.push('\n');
    }
    indent(out, depth);
    out.push('}');
}

fn write_ints(out: &mut String, values: &[usize], depth: usize) {
    if values.is_empty() {
        out.push_str("[]");
        return;
    }
    out.push_str("[\n");
    for (i, value) in values.iter().enumerate() {
        indent(out, depth + 1);
        let _ = write!(out, "{value}");
        if i + 1 < values.len() {
            out.push(',');
        }
        out.push('\n');
    }
    indent(out, depth);
    out.push(']');
}

fn field(out: &mut String, depth: usize, key: &str, raw_value: &str, comma: bool) {
    indent(out, depth);
    let _ = write!(out, "\"{key}\": {raw_value}");
    out.push_str(if comma { ",\n" } else { "\n" });
}

fn string_field(out: &mut String, depth: usize, key: &str, value: &str, comma: bool) {
    indent(out, depth);
    let _ = write!(out, "\"{key}\": ");
    json_escape::write_string(out, value);
    out.push_str(if comma { ",\n" } else { "\n" });
}

fn indent(out: &mut String, depth: usize) {
    for _ in 0..depth {
        out.push_str("  ");
    }
}
