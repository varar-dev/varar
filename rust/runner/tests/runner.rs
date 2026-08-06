//! Unit tests for the runner shell: glob discovery, oath finding, and the
//! filesystem baseline store driving drift reconciliation.

use std::path::PathBuf;
use varar_config::Config;
use varar_core::drift::{BaselineStore, reconcile_drift};
use varar_core::handler::Handler;
use varar_core::parse::parse;
use varar_core::plan::plan;
use varar_core::registry::{add_step, create_registry};
use varar_core::step_kind::StepKind;
use varar_runner::discovery::glob_to_regex;
use varar_runner::{FileBaselineStore, find_oaths};

fn tmp(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("varar-runner-{}-{name}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn glob_star_stays_within_one_segment() {
    let re = glob_to_regex("*.md");
    assert!(re.is_match("a.md"));
    assert!(!re.is_match("sub/a.md"));
}

#[test]
fn leading_doublestar_matches_zero_or_more_segments() {
    let re = glob_to_regex("**/*.md");
    assert!(re.is_match("a.md"));
    assert!(re.is_match("sub/a.md"));
    assert!(re.is_match("x/y/a.md"));
}

#[test]
fn nested_doublestar_and_trailing_doublestar() {
    assert!(glob_to_regex("oaths/**/*.md").is_match("oaths/a.md"));
    assert!(glob_to_regex("oaths/**/*.md").is_match("oaths/x/a.md"));
    let wip = glob_to_regex("oaths/wip/**");
    assert!(wip.is_match("oaths/wip"));
    assert!(wip.is_match("oaths/wip/draft.md"));
}

#[test]
fn find_oaths_honours_include_and_exclude() {
    let root = tmp("find");
    std::fs::write(root.join("a.md"), "x").unwrap();
    std::fs::write(root.join("README.md"), "x").unwrap();
    std::fs::create_dir_all(root.join("sub")).unwrap();
    std::fs::write(root.join("sub/b.md"), "x").unwrap();

    let flat = Config {
        docs_include: vec!["*.md".to_string()],
        docs_exclude: vec!["README.md".to_string()],
        ..Default::default()
    };
    let names: Vec<String> = find_oaths(&flat, &root)
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec!["a.md"]);

    let recursive = Config {
        docs_include: vec!["**/*.md".to_string()],
        docs_exclude: vec!["README.md".to_string()],
        ..Default::default()
    };
    assert_eq!(find_oaths(&recursive, &root).len(), 2); // a.md + sub/b.md
}

/// Simulates a project that wants to scan README.md an and a tiny `docs/` tree
/// but has a huge `target/`.
#[test]
fn find_oaths_prunes_dirs_outside_literal_include_prefix() {
    let root = tmp("prune");
    std::fs::write(root.join("README.md"), "x").unwrap();
    std::fs::create_dir_all(root.join("docs")).unwrap();
    std::fs::write(root.join("docs/loop.md"), "x").unwrap();
    // A decoy directory that should be pruned: not reachable from either glob.
    std::fs::create_dir_all(root.join("target/debug")).unwrap();
    std::fs::write(root.join("target/debug/not_a_doc.md"), "x").unwrap();

    let config = Config {
        docs_include: vec!["README.md".to_string(), "docs/loop.md".to_string()],
        docs_exclude: vec![],
        ..Default::default()
    };
    let paths = find_oaths(&config, &root);
    let names: Vec<String> = paths
        .iter()
        .map(|p| {
            p.strip_prefix(&root)
                .unwrap()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    // target/ is unreachable from both globs and must not appear.
    assert_eq!(names, vec!["README.md", "docs/loop.md"]);
}

#[test]
fn find_oaths_prunes_dirs_matching_exclude() {
    let root = tmp("excl-prune");
    std::fs::write(root.join("good.md"), "x").unwrap();
    std::fs::create_dir_all(root.join("skip/nested")).unwrap();
    std::fs::write(root.join("skip/nested/bad.md"), "x").unwrap();

    let config = Config {
        docs_include: vec!["**/*.md".to_string()],
        docs_exclude: vec!["skip/**".to_string()],
        ..Default::default()
    };
    let names: Vec<String> = find_oaths(&config, &root)
        .iter()
        .map(|p| p.file_name().unwrap().to_string_lossy().into_owned())
        .collect();
    assert_eq!(names, vec!["good.md"]);
}

#[test]
fn baseline_store_round_trips_and_reconcile_writes_lock() {
    let root = tmp("drift");
    let mut store = FileBaselineStore::new(&root);
    assert!(store.read().is_none());

    let registry = add_step(
        &create_registry(),
        "I greet {string}",
        "s.rs",
        1,
        Handler::sync1(|state, _n| Ok(Some(state))),
        Some(StepKind::Stimulus),
    )
    .unwrap();
    let source = "# Hi\n\nI greet \"world\".";
    let doc = parse("hi.md", source);
    let execution = plan(&doc, &registry);

    // Clean run: no drift, and the baseline is written.
    let drifts = reconcile_drift(&mut store, "hi.md", source, &doc, &execution, false);
    assert!(drifts.is_empty());
    assert!(store.read().is_some(), "varar.lock.json should be written");
    assert!(root.join("varar.lock.json").is_file());
}
