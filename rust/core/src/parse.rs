//! Top-level parse entry point: `scan` then `structure` — port of `parse.ts` /
//! `Parse.java`.

use crate::ast::Doc;
use crate::{scanner, structurer};

/// Parses `source` into a [`Doc`].
pub fn parse(path: &str, source: &str) -> Doc {
    structurer::structure(path, source, scanner::scan(source))
}
