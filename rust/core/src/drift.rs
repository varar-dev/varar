//! Oath drift detection — port of `drift.ts` / `Drift.java`. A paragraph the
//! committed `varar.lock.json` baseline recorded as an example that now matches no
//! step. Byte-identical to the other ports (FNV-1a fingerprint, insertion-ordered
//! lockfile serializer, Jaccard word-similarity re-identification).

use crate::ast::Doc;
use crate::hash::hash_source;
use crate::json_value::parse_json_value;
use crate::plan::{ExecutionPlan, derive_example_name};
use crate::span::Span;
use crate::value::Value;
use regex::Regex;
use std::collections::{BTreeMap, HashSet};
use std::sync::LazyLock;

/// The word-similarity threshold for re-identifying a moved/reworded example.
pub const SIMILARITY_THRESHOLD: f64 = 0.5;

/// One example-producing paragraph, as recorded in the baseline.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BaselineExample {
    pub name: String,
    pub line: usize,
}

/// The committed baseline for one oath file.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OathBaseline {
    pub source_hash: String,
    pub examples: Vec<BaselineExample>,
}

/// The whole `varar.lock.json`: every oath keyed by its POSIX path.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LockFile {
    pub version: u32,
    pub oaths: BTreeMap<String, OathBaseline>,
}

/// A paragraph the baseline says was an example and now matches no step.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Drifted {
    pub name: String,
    pub line: usize,
    pub span: Span,
}

/// Persistence port for `varar.lock.json`. The core owns the format; adapters move
/// only raw text.
pub trait BaselineStore {
    /// The whole lockfile's contents, or `None` when there is no baseline yet.
    fn read(&self) -> Option<String>;

    fn write(&mut self, contents: &str);
}

static TOKEN_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[\p{L}\p{N}]+").unwrap());

// Do the two spans overlap at all (offset ranges intersect)? A candidate
// paragraph relates to its planned example either way round: a header-bound row
// sits *inside* its binding paragraph, while a merged example's span *covers*
// each of the candidates it absorbed (ADR 0012). Overlap catches both.
fn overlaps(a: Span, b: Span) -> bool {
    a.start_offset < b.end_offset && b.start_offset < a.end_offset
}

// A candidate paragraph is "live" (still an example) if it overlaps at least one
// planned example. A now-prose paragraph — one whose step def was renamed or
// deleted — overlaps none (it became a delimiter, splitting any example it was
// part of), so drift catches it.
fn is_live(candidate_span: Span, plan: &ExecutionPlan) -> bool {
    plan.examples
        .iter()
        .any(|pe| overlaps(pe.span, candidate_span))
}

fn tokenize(text: &str) -> HashSet<String> {
    TOKEN_RE
        .find_iter(&text.to_lowercase())
        .map(|m| m.as_str().to_string())
        .collect()
}

fn similarity(a: &HashSet<String>, b: &HashSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    let intersection = a.iter().filter(|t| b.contains(*t)).count();
    let union = a.len() + b.len() - intersection;
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}

/// The current example-producing paragraphs, in document order.
pub fn live_examples(doc: &Doc, plan: &ExecutionPlan) -> Vec<BaselineExample> {
    doc.examples
        .iter()
        .filter(|c| is_live(c.span, plan))
        .map(|c| BaselineExample {
            name: derive_example_name(&c.body),
            line: c.span.start_line,
        })
        .collect()
}

/// The full baseline record for an oath: fingerprint plus live examples.
pub fn derive_oath_baseline(source: &str, doc: &Doc, plan: &ExecutionPlan) -> OathBaseline {
    OathBaseline {
        source_hash: hash_source(source),
        examples: live_examples(doc, plan),
    }
}

/// Paragraphs the baseline recorded as examples that now match zero steps.
pub fn detect_drift(
    baseline: Option<&OathBaseline>,
    doc: &Doc,
    plan: &ExecutionPlan,
) -> Vec<Drifted> {
    let Some(baseline) = baseline else {
        return Vec::new();
    };
    let candidates = &doc.examples;
    let n = candidates.len();
    let tokens: Vec<HashSet<String>> = candidates
        .iter()
        .map(|c| tokenize(&derive_example_name(&c.body)))
        .collect();
    let live: Vec<bool> = candidates.iter().map(|c| is_live(c.span, plan)).collect();

    let mut drifts = Vec::new();
    for b in &baseline.examples {
        let b_tokens = tokenize(&b.name);
        let mut best_idx: Option<usize> = None;
        let mut best_score = 0.0f64;
        for i in 0..n {
            let score = similarity(&b_tokens, &tokens[i]);
            if score < SIMILARITY_THRESHOLD {
                continue;
            }
            let line = candidates[i].span.start_line as isize;
            let best_line = best_idx.map_or(0, |bi| candidates[bi].span.start_line as isize);
            let b_line = b.line as isize;
            if best_idx.is_none()
                || score > best_score
                || (score == best_score && (line - b_line).abs() < (best_line - b_line).abs())
            {
                best_idx = Some(i);
                best_score = score;
            }
        }
        if let Some(bi) = best_idx {
            if !live[bi] {
                let cand = &candidates[bi];
                drifts.push(Drifted {
                    name: b.name.clone(),
                    line: cand.span.start_line,
                    span: cand.span,
                });
            }
        }
    }
    drifts
}

/// The human-readable message for a drift.
pub fn message(drifted: &Drifted) -> String {
    format!(
        "This paragraph was an example and no longer matches any step (drift): \"{}\".\nFix the step so it matches again, or accept it as prose (run in update mode).",
        drifted.name
    )
}

/// One oath's baseline reconciliation against a [`BaselineStore`]. `update`
/// accepts all drift; otherwise detect drift and rewrite the baseline only on a
/// clean run.
pub fn reconcile_drift(
    store: &mut dyn BaselineStore,
    oath_path: &str,
    source: &str,
    doc: &Doc,
    plan: &ExecutionPlan,
    update: bool,
) -> Vec<Drifted> {
    let lock = store.read().as_deref().and_then(parse_lock_file);
    let drifts = if update {
        Vec::new()
    } else {
        detect_drift(lock.as_ref().and_then(|l| l.oaths.get(oath_path)), doc, plan)
    };
    if update || drifts.is_empty() {
        let next = derive_oath_baseline(source, doc, plan);
        let mut oaths = lock.map_or_else(BTreeMap::new, |l| l.oaths);
        oaths.insert(oath_path.to_string(), next);
        store.write(&stringify_lock_file(&LockFile { version: 2, oaths }));
    }
    drifts
}

/// Drops every baseline whose oath path is not in `keep_paths` — the entries left
/// behind when an oath is deleted or moved. Pure counterpart of [`parse_lock_file`]
/// / [`stringify_lock_file`]; the caller decides what "still exists" means.
pub fn prune_lock_file(lock: &LockFile, keep_paths: &[String]) -> LockFile {
    LockFile {
        version: 2,
        oaths: lock
            .oaths
            .iter()
            .filter(|(path, _)| keep_paths.iter().any(|k| k == *path))
            .map(|(path, baseline)| (path.clone(), baseline.clone()))
            .collect(),
    }
}

/// The whole-lock counterpart of [`reconcile_drift`], run ONCE per run rather than
/// per oath: reconciliation cannot see paths that no longer exist, so without this
/// the lock silently accumulates dead entries and stops being a faithful inventory
/// of the oath set (#70).
///
/// `keep_paths` MUST be everything the `docs` globs currently match — never the set
/// the run happened to execute. Runs are routinely filtered, and pruning against a
/// filtered set would delete live baselines.
///
/// Removal is still not *gated*: a deleted oath is a different signal from drift and
/// stays ungated (ADR 0002). This only stops preserving dead state, and only under
/// `update`. Returns the paths removed (or, without `update`, the ones that would be).
pub fn prune_baselines(
    store: &mut dyn BaselineStore,
    keep_paths: &[String],
    update: bool,
) -> Vec<String> {
    let Some(lock) = store.read().as_deref().and_then(parse_lock_file) else {
        return Vec::new();
    };
    let stale: Vec<String> = lock
        .oaths
        .keys()
        .filter(|path| !keep_paths.iter().any(|k| k == *path))
        .cloned()
        .collect();
    if update && !stale.is_empty() {
        store.write(&stringify_lock_file(&prune_lock_file(&lock, keep_paths)));
    }
    stale
}

/// Serializes `varar.lock.json` deterministically (fixed field order, sorted oath
/// paths, two-space indent, trailing newline) — NOT [`crate::canonical_json`].
pub fn stringify_lock_file(lock: &LockFile) -> String {
    let mut sb = String::new();
    sb.push_str("{\n  \"version\": 2,\n  \"oaths\": ");
    if lock.oaths.is_empty() {
        sb.push_str("{}");
    } else {
        sb.push_str("{\n");
        let n = lock.oaths.len();
        // `BTreeMap` iterates oath paths in sorted order.
        for (p, (path, baseline)) in lock.oaths.iter().enumerate() {
            sb.push_str("    ");
            write_json_string(&mut sb, path);
            sb.push_str(": {\n      \"sourceHash\": ");
            write_json_string(&mut sb, &baseline.source_hash);
            sb.push_str(",\n      \"examples\": ");
            if baseline.examples.is_empty() {
                sb.push_str("[]");
            } else {
                sb.push_str("[\n");
                let en = baseline.examples.len();
                for (e, ex) in baseline.examples.iter().enumerate() {
                    sb.push_str("        {\n          \"name\": ");
                    write_json_string(&mut sb, &ex.name);
                    sb.push_str(",\n          \"line\": ");
                    sb.push_str(&ex.line.to_string());
                    sb.push_str("\n        }");
                    if e + 1 < en {
                        sb.push(',');
                    }
                    sb.push('\n');
                }
                sb.push_str("      ]");
            }
            sb.push_str("\n    }");
            if p + 1 < n {
                sb.push(',');
            }
            sb.push('\n');
        }
        sb.push_str("  }");
    }
    sb.push_str("\n}\n");
    sb
}

fn write_json_string(sb: &mut String, s: &str) {
    use std::fmt::Write;
    sb.push('"');
    for c in s.chars() {
        match c {
            '"' => sb.push_str("\\\""),
            '\\' => sb.push_str("\\\\"),
            '\n' => sb.push_str("\\n"),
            '\r' => sb.push_str("\\r"),
            '\t' => sb.push_str("\\t"),
            '\u{0008}' => sb.push_str("\\b"),
            '\u{000c}' => sb.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(sb, "\\u{:04x}", c as u32);
            }
            c => sb.push(c),
        }
    }
    sb.push('"');
}

/// Parses `varar.lock.json`; `None` on malformed input (treated as no baseline).
pub fn parse_lock_file(text: &str) -> Option<LockFile> {
    let parsed = parse_json_value(text)?;
    let Value::Map(obj) = parsed else { return None };
    if !matches!(obj.get("version"), Some(Value::Int(2))) {
        return None;
    }
    let Some(Value::Map(oaths_raw)) = obj.get("oaths") else {
        return None;
    };
    let mut oaths = BTreeMap::new();
    for (k, v) in oaths_raw {
        oaths.insert(k.clone(), parse_oath_baseline(v)?);
    }
    Some(LockFile { version: 2, oaths })
}

fn parse_oath_baseline(value: &Value) -> Option<OathBaseline> {
    let Value::Map(map) = value else { return None };
    let Some(Value::String(source_hash)) = map.get("sourceHash") else {
        return None;
    };
    let Some(Value::List(examples_raw)) = map.get("examples") else {
        return None;
    };
    let mut examples = Vec::new();
    for item in examples_raw {
        let Value::Map(e) = item else { return None };
        let Some(Value::String(name)) = e.get("name") else {
            return None;
        };
        let Some(Value::Int(line)) = e.get("line") else {
            return None;
        };
        examples.push(BaselineExample {
            name: name.clone(),
            line: *line as usize,
        });
    }
    Some(OathBaseline {
        source_hash: source_hash.clone(),
        examples,
    })
}
