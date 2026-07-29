//! Port of `ParseTest.java` / `parse.test.ts`.

use varar_core::parse::parse;

#[test]
fn parse_returns_a_doc_whose_examples_come_from_paragraphs_and_carry_the_heading_stack() {
    let source = "# Hello\n\nbody";
    let doc = parse("hello.md", source);
    assert_eq!("hello.md", doc.path);
    assert_eq!(source, doc.source);
    assert_eq!(1, doc.examples.len());
    assert_eq!(vec!["Hello".to_string()], doc.examples[0].scope_stack);
}
