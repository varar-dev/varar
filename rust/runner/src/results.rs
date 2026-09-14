//! Persists run results for the language server (ADR 0014) — the shell half of
//! the contract the core builds the payload for. Writes
//! `<root>/.varar/<oath_path>.json`, which the (language-neutral) LSP reads to
//! turn a failure into an editor diagnostic.
//!
//! Lives in the runner so every adapter in this port feeds the same collector
//! and cannot drift from the TypeScript reporter this is a port of.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use varar_core::hash::hash_source;
use varar_core::result::{ExampleResult, OathResults, ReferencedDocument, to_wire_json};

/// `<root>/.varar/<oath_path>.json` — the file the LSP watches.
pub fn result_file_path(root: &Path, oath_path: &str) -> PathBuf {
    root.join(".varar").join(format!("{oath_path}.json"))
}

/// Writes one oath's results: 2-space indent plus a trailing newline, matching
/// `JSON.stringify(results, null, 2)` in the TypeScript port.
pub fn write_oath_results(root: &Path, results: &OathResults) -> std::io::Result<PathBuf> {
    let out = result_file_path(root, &results.oath_path);
    if let Some(parent) = out.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&out, format!("{}\n", to_wire_json(results)))?;
    Ok(out)
}

/// Sorts examples into document order.
///
/// A test framework reports examples in ITS order — `cargo test` runs them in
/// parallel, so the order results are recorded in is not the order they appear
/// in the oath. The file is a cross-port contract read by tools that diff runs,
/// so it is written in document order everywhere. The name breaks ties for
/// examples sharing a line.
fn document_order(examples: &mut [ExampleResult]) {
    examples.sort_by(|a, b| {
        let line = |e: &ExampleResult| e.lines.first().copied().unwrap_or(0);
        line(a).cmp(&line(b)).then_with(|| a.name.cmp(&b.name))
    });
}

/// Accumulates each oath's example results across a run, then writes them.
///
/// `cargo test` reports one test at a time and has no end-of-run hook of its
/// own, so the harness flushes this once `libtest_mimic::run` returns — the
/// first moment an oath's examples are all in. Passing oaths are written too: a
/// stale file would keep a diagnostic on screen that the run has just cleared.
#[derive(Default)]
pub struct Results {
    sources: BTreeMap<String, String>,
    examples: BTreeMap<String, Vec<ExampleResult>>,
    /// Per oath: the other documents its steps were spliced in from (ADR 0016),
    /// as path → source.
    documents: BTreeMap<String, BTreeMap<String, String>>,
}

impl Results {
    pub fn new() -> Results {
        Results::default()
    }

    /// Accumulates one example's outcome. `referenced_sources` carries the OTHER
    /// documents this oath's steps were spliced in from (ADR 0016), as
    /// path → source; their hashes go in the payload so a consumer can tell a
    /// stale failure from a live one.
    pub fn record(
        &mut self,
        oath_path: &str,
        source: &str,
        result: ExampleResult,
        referenced_sources: &BTreeMap<String, String>,
    ) {
        self.sources
            .entry(oath_path.to_string())
            .or_insert_with(|| source.to_string());
        self.examples
            .entry(oath_path.to_string())
            .or_default()
            .push(result);
        if !referenced_sources.is_empty() {
            self.documents
                .entry(oath_path.to_string())
                .or_default()
                .extend(
                    referenced_sources
                        .iter()
                        .map(|(k, v)| (k.clone(), v.clone())),
                );
        }
    }

    /// Writes every oath held, and forgets them. Errors are ignored on purpose:
    /// a read-only or missing workspace must not fail a test run whose results
    /// are otherwise fine — the editor simply shows nothing for it.
    pub fn flush_all(&mut self, root: &Path) {
        for (oath_path, mut examples) in std::mem::take(&mut self.examples) {
            let Some(source) = self.sources.get(&oath_path) else {
                continue;
            };
            document_order(&mut examples);
            let documents = self
                .documents
                .get(&oath_path)
                .map(|docs| {
                    docs.iter()
                        .map(|(path, text)| ReferencedDocument {
                            path: path.clone(),
                            source_hash: hash_source(text),
                        })
                        .collect()
                })
                .unwrap_or_default();
            let results = OathResults {
                version: 2,
                oath_path: oath_path.clone(),
                source_hash: hash_source(source),
                documents,
                examples,
            };
            let _ = write_oath_results(root, &results);
        }
    }
}
