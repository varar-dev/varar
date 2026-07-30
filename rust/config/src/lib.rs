//! `varar-config` — the strict, fail-loud reader for `varar.config.json`.
//!
//! Port of `@varar/config` / Python `var_config`. The canonical shape is
//! `{ docs: { include, exclude }, steps, snippets }`; every key
//! is optional and defaults to empty. A missing file yields the empty config
//! (tools no-op); malformed JSON, wrong types, or unknown keys fail loudly with
//! the file path. Proven by the shared corpus at `conformance/config/cases/`.

use std::collections::BTreeMap;
use std::path::Path;

const KNOWN_KEYS: &[&str] = &["$schema", "docs", "steps", "snippets"];
const KNOWN_DOCS_KEYS: &[&str] = &["include", "exclude"];

/// The parsed configuration. All fields default to empty.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Config {
    pub docs_include: Vec<String>,
    pub docs_exclude: Vec<String>,
    pub steps: Vec<String>,
    pub snippets: BTreeMap<String, String>,
}

/// Read `<root>/varar.config.json`. The filesystem edge over [`parse_config`];
/// a missing file yields the empty config (tools no-op, as in every port).
pub fn read_config(root: &Path) -> Result<Config, String> {
    let path = root.join("varar.config.json");
    if !path.is_file() {
        return Ok(Config::default());
    }
    let loc = path.display().to_string();
    let text = std::fs::read_to_string(&path).map_err(|e| format!("{loc}: {e}"))?;
    parse_config(&text, &loc)
}

/// Parse `varar.config.json` TEXT. Pure — no filesystem.
///
/// `source` only labels errors (a path, a URL, `"<memory>"`); nothing is read from
/// it. Splitting this out from [`read_config`] is what lets a caller with the
/// text already in hand — an editor buffer, an in-memory fixture, the LSP —
/// validate it without inventing a file, and mirrors TypeScript's `parseConfig`
/// / Java's `Config.parse`. Any malformed input → `Err(message)` beginning with
/// `source`.
pub fn parse_config(text: &str, source: &str) -> Result<Config, String> {
    let loc = source;
    let data: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("{loc}: invalid JSON: {e}"))?;
    let obj = data
        .as_object()
        .ok_or_else(|| format!("{loc}: top level must be an object"))?;

    let unknown: Vec<&str> = obj
        .keys()
        .map(String::as_str)
        .filter(|k| !KNOWN_KEYS.contains(k))
        .collect();
    if !unknown.is_empty() {
        return Err(format!("{loc}: unknown key(s): {}", unknown.join(", ")));
    }

    let docs = obj.get("docs").cloned().unwrap_or(serde_json::Value::Null);
    let (docs_include, docs_exclude) = if docs.is_null() {
        (Vec::new(), Vec::new())
    } else {
        let docs_obj = docs
            .as_object()
            .ok_or_else(|| format!("{loc}: 'docs' must be an object"))?;
        let unknown_docs: Vec<&str> = docs_obj
            .keys()
            .map(String::as_str)
            .filter(|k| !KNOWN_DOCS_KEYS.contains(k))
            .collect();
        if !unknown_docs.is_empty() {
            return Err(format!("{loc}: unknown docs key(s): {}", unknown_docs.join(", ")));
        }
        (
            string_array(docs_obj.get("include"), "docs.include", &loc)?,
            string_array(docs_obj.get("exclude"), "docs.exclude", &loc)?,
        )
    };

    Ok(Config {
        docs_include,
        docs_exclude,
        steps: string_array(obj.get("steps"), "steps", &loc)?,
        snippets: string_map(obj.get("snippets"), &loc)?,
    })
}

fn string_array(
    value: Option<&serde_json::Value>,
    key: &str,
    loc: &impl std::fmt::Display,
) -> Result<Vec<String>, String> {
    match value {
        None | Some(serde_json::Value::Null) => Ok(Vec::new()),
        Some(serde_json::Value::Array(items)) => items
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_string)
                    .ok_or_else(|| format!("{loc}: '{key}' must be an array of strings"))
            })
            .collect(),
        Some(_) => Err(format!("{loc}: '{key}' must be an array of strings")),
    }
}

fn string_map(
    value: Option<&serde_json::Value>,
    loc: &impl std::fmt::Display,
) -> Result<BTreeMap<String, String>, String> {
    match value {
        None | Some(serde_json::Value::Null) => Ok(BTreeMap::new()),
        Some(serde_json::Value::Object(entries)) => entries
            .iter()
            .map(|(k, v)| {
                v.as_str()
                    .map(|s| (k.clone(), s.to_string()))
                    .ok_or_else(|| format!("{loc}: 'snippets' must be an object of strings"))
            })
            .collect(),
        Some(_) => Err(format!("{loc}: 'snippets' must be an object of strings")),
    }
}
