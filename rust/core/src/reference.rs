//! Reuse is a link (ADR 0016). A candidate block whose entire content is a
//! single Markdown link to an oath section is a REFERENCE BLOCK: it splices
//! that section's steps in at its own position instead of being prose.
//!
//! Everything here is pure text and path arithmetic — no filesystem. The shell
//! reads the documents; [`references`] tells it which ones to read, and
//! [`build_workspace`] turns the collection into what `plan` needs.

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use regex::Regex;

use crate::ast::{Block, Doc, Example};

/// One resolved reference block: the referenced oath's path (resolved against
/// the referring doc's own path), the GFM slug of the heading (empty for a
/// whole-file link), and the link's visible text.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Reference {
    pub path: String,
    pub slug: String,
    pub text: String,
}

/// What `plan` needs to resolve references: every oath by path, plus which
/// sections a reference block consumes somewhere in the project. A section that
/// is referenced stops being a standalone example, so this is whole-project
/// knowledge — see ADR 0016 on why each runner builds it at its once-per-run
/// discovery pass.
#[derive(Clone, Default)]
pub struct OathWorkspace {
    pub docs: HashMap<String, Doc>,
    /// `"{path}#{slug}"` for every referenced section; a whole-file reference
    /// is recorded as `"{path}#"`.
    pub referenced: HashSet<String>,
}

// A candidate is a reference block iff its whole text is one Markdown link
// whose target is oath-shaped. Anything else — a link with surrounding words, a
// link to https://…, to a .rs file, to a mailto: — is ordinary content, so
// existing documents keep their meaning.
static LINK_ONLY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\[([^\]]*)\]\(\s*([^\s)]+)\s*\)$").unwrap());
static PROTOCOL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^[a-z][a-z0-9+.\-]*:").unwrap());
static NOT_SLUG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[^\p{L}\p{N} _-]").unwrap());
static CODE_SPAN: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"`([^`]*)`").unwrap());
static STRONG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\*\*([^*]*)\*\*").unwrap());
static EMPH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\*([^*]*)\*").unwrap());
static UNDER: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"_([^_]*)_").unwrap());

/// The reference a block's text spells, or `None` when it is ordinary content.
pub fn reference_of(text: &str, from_path: &str) -> Option<Reference> {
    let caps = LINK_ONLY.captures(text.trim())?;
    let link_text = caps.get(1).map_or("", |m| m.as_str()).to_string();
    let target = caps.get(2).map_or("", |m| m.as_str());
    if let Some(fragment) = target.strip_prefix('#') {
        return Some(Reference {
            path: from_path.to_string(),
            slug: normalize_slug(fragment),
            text: link_text,
        });
    }
    let (file_part, fragment) = match target.find('#') {
        Some(i) => (&target[..i], &target[i + 1..]),
        None => (target, ""),
    };
    // Only a relative Markdown path is a reference. A protocol (https:, mailto:)
    // or any other extension is left alone — remote references are deliberately
    // out of scope (ADR 0016).
    if !file_part.ends_with(".md") || PROTOCOL.is_match(file_part) || file_part.starts_with('/') {
        return None;
    }
    Some(Reference {
        path: join_posix(dirname_posix(from_path), file_part),
        slug: normalize_slug(fragment),
        text: link_text,
    })
}

/// GitHub's heading anchors: inline markup dropped, lowercased, spaces to
/// hyphens, everything else that isn't a word character or hyphen removed. The
/// same function produces the slug of a heading and normalizes the slug written
/// in a link, so the two meet in the middle.
pub fn slugify(heading_text: &str) -> String {
    let s = CODE_SPAN.replace_all(heading_text, "$1");
    let s = STRONG.replace_all(&s, "$1");
    let s = EMPH.replace_all(&s, "$1");
    let s = UNDER.replace_all(&s, "$1");
    normalize_slug(&s)
}

fn normalize_slug(s: &str) -> String {
    // One hyphen per space, not per run of them: GitHub leaves the gap where it
    // dropped punctuation, so "Fees, VAT & rounding" slugs with a double hyphen.
    NOT_SLUG
        .replace_all(s.trim().to_lowercase().as_str(), "")
        .replace(' ', "-")
}

fn dirname_posix(path: &str) -> &str {
    match path.rfind('/') {
        Some(i) => &path[..i],
        None => "",
    }
}

/// POSIX path arithmetic on oath paths (always '/'-separated, relative to the
/// workspace root). The core may not touch the filesystem.
pub fn join_posix(dir: &str, rel: &str) -> String {
    let mut segments: Vec<&str> = if dir.is_empty() {
        Vec::new()
    } else {
        dir.split('/').collect()
    };
    for segment in rel.split('/') {
        match segment {
            "" | "." => continue,
            ".." => {
                segments.pop();
            }
            other => segments.push(other),
        }
    }
    segments.join("/")
}

/// Every reference block in a document, in document order. The shell uses this
/// to walk the closure of documents it must read before planning.
pub fn references(doc: &Doc) -> Vec<Reference> {
    doc.examples
        .iter()
        .filter_map(|ex| block_text(ex.body.first()?).and_then(|t| reference_of(t, &doc.path)))
        .collect()
}

fn block_text(block: &Block) -> Option<&str> {
    match block {
        Block::Paragraph(p) => Some(&p.text),
        Block::ListItem(l) => Some(&l.text),
        Block::Blockquote(b) => Some(&b.text),
        _ => None,
    }
}

/// A section's identity across the project.
pub fn section_key(path: &str, slug: &str) -> String {
    format!("{path}#{slug}")
}

/// The workspace with no references at all: what a caller planning a single
/// document in isolation passes.
pub fn empty_workspace() -> OathWorkspace {
    OathWorkspace::default()
}

/// Index every oath by path and record every consumed section.
pub fn build_workspace(docs: &[Doc]) -> OathWorkspace {
    let mut ws = OathWorkspace::default();
    for doc in docs {
        ws.docs.insert(doc.path.clone(), doc.clone());
    }
    for doc in docs {
        for r in references(doc) {
            ws.referenced.insert(section_key(&r.path, &r.slug));
        }
    }
    ws
}

/// The candidates that make up a section: those whose heading chain contains
/// the slug. A whole-file reference (empty slug) is every candidate in the
/// document. Section membership follows the document outline exactly — a
/// heading's section runs until the next heading of the same or higher level,
/// which is precisely the range over which it stays on the scope stack.
pub fn section_candidates<'a>(doc: &'a Doc, slug: &str) -> Vec<&'a Example> {
    if slug.is_empty() {
        return doc.examples.iter().collect();
    }
    doc.examples
        .iter()
        .filter(|ex| ex.scope_stack.iter().any(|h| slugify(h) == slug))
        .collect()
}
