//! Oath discovery: the shared glob→regex semantics (matching the Python/Ruby
//! runners byte-for-byte on `**`, `*`, `?`), recursive file walk, include/exclude.

use regex::Regex;
use std::path::{Path, PathBuf};
use varar_config::Config;

/// Translate a glob (`/**/`, `/**`, `**/`, `**`, `*`, `?`) to an anchored regex.
/// Port of `varar_runner.discovery._glob_to_regex`.
pub fn glob_to_regex(pattern: &str) -> Regex {
    let chars: Vec<char> = pattern.chars().collect();
    let n = chars.len();
    let starts = |i: usize, pat: &str| {
        pat.chars()
            .enumerate()
            .all(|(k, pc)| chars.get(i + k) == Some(&pc))
    };

    let mut out = String::from("^");
    let mut i = 0;
    while i < n {
        if chars[i] == '/' && starts(i, "/**/") {
            out.push_str("/(?:.+/)?");
            i += 4;
        } else if chars[i] == '/' && starts(i, "/**") && i + 3 == n {
            out.push_str("(?:/.*)?");
            i += 3;
        } else if chars[i] == '*' && starts(i, "**/") {
            out.push_str("(?:.*/)?");
            i += 3;
        } else if chars[i] == '*' && starts(i, "**") {
            out.push_str(".*");
            i += 2;
        } else if chars[i] == '*' {
            out.push_str("[^/]*");
            i += 1;
        } else if chars[i] == '?' {
            out.push_str("[^/]");
            i += 1;
        } else {
            out.push_str(&regex::escape(&chars[i].to_string()));
            i += 1;
        }
    }
    out.push('$');
    Regex::new(&out).expect("valid glob regex")
}

fn matches_any(rel: &str, globs: &[String]) -> bool {
    globs.iter().any(|g| glob_to_regex(g).is_match(rel))
}

/// The path relative to `root`, forward-slashed. Falls back to the file name
/// when `path` is not under `root`.
fn rel_posix(path: &Path, root: &Path) -> String {
    let rel = path.strip_prefix(root).unwrap_or(path);
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// Returns the literal directory prefix of a glob — the path segment up to the
/// last `/` before the first wildcard (`*` or `?`). Used to prune subtrees that
/// cannot possibly match.
///
/// Examples:
/// - `"README.md"`        → `""`          (literal file at root; no dir prefix)
/// - `"docs/loop.md"`     → `"docs"`
/// - `"src/**/*.md"`      → `"src"`
/// - `"a/b/c/*.md"`       → `"a/b/c"`
/// - `"**/*.md"`          → `""`          (starts with wildcard; no literal dir)
fn glob_literal_dir(glob: &str) -> &str {
    let wild = glob.find(['*', '?']).unwrap_or(glob.len());
    match glob[..wild].rfind('/') {
        Some(pos) => &glob[..pos],
        None => "",
    }
}

/// Returns `true` if any file under directory `dir_rel` (relative to root)
/// could potentially match one of the `include` globs.
///
/// A directory is prunable when every include glob is anchored to a different
/// part of the tree — e.g. `docs/loop.md` cannot match anything under `target/`.
/// Globs that start with a wildcard (`**/*.md`, `*.md`) are never prunable.
fn dir_could_match_include(dir_rel: &str, include: &[String]) -> bool {
    include.iter().any(|g| {
        let lit = glob_literal_dir(g);
        if lit.is_empty() {
            // Glob either starts with a wildcard (could match anywhere) or is a
            // bare filename like "README.md" that only lives at the root.
            // Prune subdirectories for bare root filenames; keep for wildcards.
            g.starts_with(['*', '?'])
        } else {
            // lit is something like "docs" or "src/components".
            // Keep if dir_rel is heading toward lit, is lit, or is already inside lit.
            lit == dir_rel
                || lit.starts_with(&format!("{dir_rel}/")) // target is deeper
                || dir_rel.starts_with(&format!("{lit}/")) // we're inside target
        }
    })
}

/// Returns `true` if the directory at `dir_rel` is broadly excluded — i.e.
/// any probe file under it (`dir_rel/x`) matches an exclude glob.
fn dir_is_excluded(dir_rel: &str, exclude: &[String]) -> bool {
    let probe = format!("{dir_rel}/x");
    exclude.iter().any(|g| glob_to_regex(g).is_match(&probe))
}

fn walk(dir: &Path, root: &Path, include: &[String], exclude: &[String], out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let child_rel = rel_posix(&path, root);
            if dir_could_match_include(&child_rel, include) && !dir_is_excluded(&child_rel, exclude)
            {
                walk(&path, root, include, exclude, out);
            }
        } else if path.is_file() {
            out.push(path);
        }
    }
}

/// True iff `path` (relative to `root`) matches an include glob and no exclude.
pub fn match_oath(path: &Path, include: &[String], exclude: &[String], root: &Path) -> bool {
    let rel = rel_posix(path, root);
    matches_any(&rel, include) && !matches_any(&rel, exclude)
}

/// Files under `root` matching any `docs.include` glob and no `docs.exclude`,
/// sorted.
pub fn find_oaths(config: &Config, root: &Path) -> Vec<PathBuf> {
    if config.docs_include.is_empty() {
        return Vec::new();
    }
    let mut files = Vec::new();
    walk(root, root, &config.docs_include, &config.docs_exclude, &mut files);
    let mut kept: Vec<PathBuf> = files
        .into_iter()
        .filter(|p| match_oath(p, &config.docs_include, &config.docs_exclude, root))
        .collect();
    kept.sort();
    kept
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmp(suffix: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("varar-discovery-{}-{suffix}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// `walk` itself must not collect files from a directory that the literal
    /// include prefix excludes.  The integration-level `find_oaths` tests only
    /// verify the final output; a post-walk filter would hide a missing prune
    /// there.  This test calls `walk` directly so there is no filter to rescue
    /// a bad walk.
    #[test]
    fn walk_skips_dir_outside_literal_include_prefix() {
        let root = tmp("walk-prune");
        std::fs::write(root.join("README.md"), "x").unwrap();
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(root.join("docs/loop.md"), "x").unwrap();
        std::fs::create_dir_all(root.join("target/debug")).unwrap();
        std::fs::write(root.join("target/debug/not_a_doc.md"), "x").unwrap();

        let include = vec!["README.md".to_string(), "docs/loop.md".to_string()];
        let exclude: Vec<String> = vec![];
        let mut out = Vec::new();
        walk(&root, &root, &include, &exclude, &mut out);

        assert!(
            !out.iter().any(|p| p.ends_with("not_a_doc.md")),
            "walk should not have entered target/: {out:?}"
        );
        assert_eq!(out.len(), 2, "expected README.md + docs/loop.md, got {out:?}");
    }

    /// Same guarantee for exclude-based pruning.
    #[test]
    fn walk_skips_excluded_dir() {
        let root = tmp("walk-excl");
        std::fs::write(root.join("good.md"), "x").unwrap();
        std::fs::create_dir_all(root.join("skip/nested")).unwrap();
        std::fs::write(root.join("skip/nested/bad.md"), "x").unwrap();

        let include = vec!["**/*.md".to_string()];
        let exclude = vec!["skip/**".to_string()];
        let mut out = Vec::new();
        walk(&root, &root, &include, &exclude, &mut out);

        assert!(
            !out.iter().any(|p| p.ends_with("bad.md")),
            "walk should not have entered skip/: {out:?}"
        );
        assert_eq!(out.len(), 1, "expected only good.md, got {out:?}");
    }
}
