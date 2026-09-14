//! The cross-port wire format of `.varar/<oath_path>.json` (ADR 0014). Every port
//! builds this same value; the parsed result must match — see
//! `conformance/run-results/README.md` for what that pins, and why the bundle
//! goldens don't cover it.

use varar_core::json_value::parse_json_value;
use varar_core::result::{
    AnchorRange, CellFailure, ExampleFailure, ExampleResult, OathResults, ReferencedDocument,
    Status, to_wire_json,
};

fn results() -> OathResults {
    OathResults {
        version: 2,
        oath_path: "varar/library.md".to_string(),
        source_hash: "fnv1a:1622dfca".to_string(),
        documents: vec![ReferencedDocument {
            path: "varar/shared/loans.md".to_string(),
            source_hash: "fnv1a:2f0e1d3c".to_string(),
        }],
        examples: vec![
            ExampleResult {
                name: "Maya borrowed *Emma*, due back on June 1, 2026".to_string(),
                status: Status::Passed,
                lines: vec![3, 4],
                failure: None,
            },
            ExampleResult {
                name: "Ben borrowed *Dune* for £2.50 & kept it".to_string(),
                status: Status::Failed,
                lines: vec![13, 14],
                failure: Some(ExampleFailure {
                    line: 14,
                    message: "expected £2.50 but was £3.00\nand the library <refused>".to_string(),
                    stack: "<stack>".to_string(),
                    cells: Some(vec![CellFailure::new(71, 77, "£3.00")]),
                    anchor: Some(AnchorRange { from: 60, to: 90 }),
                    doc_path: None,
                }),
            },
            ExampleResult {
                name: "Noor borrowed *Kindred*".to_string(),
                status: Status::Failed,
                lines: vec![8, 9],
                failure: Some(ExampleFailure {
                    line: 9,
                    message: "expected the library to refuse".to_string(),
                    stack: "<stack>".to_string(),
                    cells: None,
                    anchor: None,
                    doc_path: None,
                }),
            },
            // A failure inside a section this oath referenced (ADR 0016): every
            // offset is into varar/shared/loans.md, named by doc_path and hashed
            // in documents. `lines` holds only this oath's own lines.
            ExampleResult {
                name: "An overdue loan blocks a new one".to_string(),
                status: Status::Failed,
                lines: vec![20],
                failure: Some(ExampleFailure {
                    line: 6,
                    message: "expected 3 but was 2".to_string(),
                    stack: "<stack>".to_string(),
                    cells: Some(vec![CellFailure::new(41, 42, "2")]),
                    anchor: Some(AnchorRange { from: 41, to: 42 }),
                    doc_path: Some("varar/shared/loans.md".to_string()),
                }),
            },
        ],
    }
}

#[test]
fn the_wire_format_matches_the_cross_port_fixture() {
    // By CONTENT: the file has to SAY the same thing in every port — field names,
    // the shapes, and an optional member absent rather than null.
    let expected = std::fs::read_to_string(
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../conformance/run-results/expected.json"),
    )
    .expect("the cross-port fixture is readable");
    assert_eq!(parse_json_value(&expected), parse_json_value(&to_wire_json(&results())));
}
