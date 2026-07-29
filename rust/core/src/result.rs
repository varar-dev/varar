//! Immutable run-result records — port of `result.ts` / `Result.java`. The
//! persisted `.varar/<oath>.json` file is a serialized [`OathResults`].

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
    pub examples: Vec<ExampleResult>,
}
