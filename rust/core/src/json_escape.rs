//! JSON string escaping, reproducing `JSON.stringify`'s: control chars as
//! `\uXXXX`, non-ASCII raw. Shared by the writers that produce real files — the
//! run-result writer in [`crate::result`], and the lock-file writer.
//!
//! Conformance goldens do NOT go through a writer any more: a port must agree
//! with what a golden SAYS, so each gate parses it ([`crate::json_value`]) and
//! compares deep equality.

use std::fmt::Write;

/// JSON string escaping, shared with the run-result writer in [`crate::result`]:
/// both must escape exactly the way `JSON.stringify` does.
pub(crate) fn write_string(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{0008}' => out.push_str("\\b"),
            '\u{000c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            // Non-ASCII (and all other) characters are emitted raw.
            c => out.push(c),
        }
    }
    out.push('"');
}
