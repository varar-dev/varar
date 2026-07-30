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
use varar_core::result::{ExampleResult, OathResults, to_wire_json};

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
}

impl Results {
    pub fn new() -> Results {
        Results::default()
    }

    pub fn record(&mut self, oath_path: &str, source: &str, result: ExampleResult) {
        self.sources
            .entry(oath_path.to_string())
            .or_insert_with(|| source.to_string());
        self.examples
            .entry(oath_path.to_string())
            .or_default()
            .push(result);
    }

    /// Writes every oath held, and forgets them. Errors are ignored on purpose:
    /// a read-only or missing workspace must not fail a test run whose results
    /// are otherwise fine — the editor simply shows nothing for it.
    pub fn flush_all(&mut self, root: &Path) {
        for (oath_path, examples) in std::mem::take(&mut self.examples) {
            let Some(source) = self.sources.get(&oath_path) else {
                continue;
            };
            let results = OathResults {
                version: 1,
                oath_path: oath_path.clone(),
                source_hash: hash_source(source),
                examples,
            };
            let _ = write_oath_results(root, &results);
        }
    }
}
