//! Port of `reference.test.ts` — the path arithmetic behind reference blocks
//! (ADR 0016). Pure: no filesystem.

use varar_core::reference::{join_posix, reference_of};

#[test]
fn a_relative_link_resolves_against_the_referring_documents_directory() {
    let r = reference_of("[Setup](./shared.md#setup)", "varar/a.md").unwrap();
    assert_eq!("varar/shared.md", r.path);
    assert_eq!("setup", r.slug);
}

#[test]
fn a_link_climbing_above_the_workspace_root_keeps_its_leading_parent_segment() {
    // The oath-path convention spells an oath outside the root as `../x.md`;
    // the resolver must not swallow the `..` it has nothing to pop.
    let r = reference_of("[Up](../../shared/b.md#setup)", "varar/a.md").unwrap();
    assert_eq!("../shared/b.md", r.path);
    assert_eq!("setup", r.slug);
}

#[test]
fn a_link_from_an_oath_already_outside_the_root_climbs_further() {
    let r = reference_of("[Up](../b.md)", "../outside/a.md").unwrap();
    assert_eq!("../b.md", r.path);
    assert_eq!("", r.slug);
}

#[test]
fn join_posix_normalizes_dots_and_empty_segments() {
    assert_eq!("varar/b.md", join_posix("varar", "./b.md"));
    assert_eq!("b.md", join_posix("varar", "../b.md"));
    assert_eq!("../b.md", join_posix("", "../b.md"));
    assert_eq!("../../b.md", join_posix("x", "../../../b.md"));
    assert_eq!("varar/b.md", join_posix("varar", ".//b.md"));
}
