//! `read_var_config` is the filesystem edge over `parse_var_config` (issue #11).
//! These pin the pure half directly: a caller holding the text — an editor
//! buffer, the LSP, an in-memory fixture — must be able to validate it without
//! inventing a file. Byte-for-byte behaviour of both is gated by the shared
//! corpus in tests/conformance.rs.

use varar_config::{VarConfig, parse_var_config, read_var_config};

#[test]
fn parse_reads_every_key_without_touching_the_filesystem() {
    let cfg = parse_var_config(
        r#"{"docs": {"include": ["a/**/*.md"], "exclude": ["a/wip/**"]},
            "steps": ["src/varar/*.steps.rs"], "snippets": {"rust": "R"}}"#,
        "<memory>",
    )
    .unwrap();

    assert_eq!(cfg.docs_include, vec!["a/**/*.md"]);
    assert_eq!(cfg.docs_exclude, vec!["a/wip/**"]);
    assert_eq!(cfg.steps, vec!["src/varar/*.steps.rs"]);
    assert_eq!(cfg.snippets.get("rust").map(String::as_str), Some("R"));
}

#[test]
fn parse_labels_errors_with_the_given_source() {
    let err = parse_var_config("{oops", "buffer://untitled").unwrap_err();
    assert!(err.starts_with("buffer://untitled:"), "unexpected error: {err}");
}

#[test]
fn parse_of_an_empty_object_is_the_empty_config() {
    assert_eq!(parse_var_config("{}", "<memory>").unwrap(), VarConfig::default());
}

#[test]
fn read_returns_the_empty_config_when_there_is_no_file() {
    let root = std::env::temp_dir().join("varar-config-absent");
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();

    assert_eq!(read_var_config(&root).unwrap(), VarConfig::default());

    let _ = std::fs::remove_dir_all(&root);
}

#[test]
fn read_delegates_to_parse_and_labels_errors_with_the_path() {
    let root = std::env::temp_dir().join("varar-config-malformed");
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("varar.config.json"), "{oops").unwrap();

    let err = read_var_config(&root).unwrap_err();
    assert!(err.contains("varar.config.json"), "unexpected error: {err}");

    let _ = std::fs::remove_dir_all(&root);
}
