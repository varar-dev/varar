//! `parse_json_value` is what every conformance gate compares against, so the
//! number rule matters: an integral JSON number is `Int`, and `Value`'s derived
//! equality deliberately treats `Int(2)` and `Float(2.0)` as different.

use std::collections::BTreeMap;
use varar_core::json_value::parse_json_value;
use varar_core::value::Value;

#[test]
fn integral_numbers_parse_as_int_and_fractions_as_float() {
    assert_eq!(Some(Value::Int(2)), parse_json_value("2"));
    assert_eq!(Some(Value::Float(2.5)), parse_json_value("2.5"));
    assert_ne!(Some(Value::Float(2.0)), parse_json_value("2"));
}

#[test]
fn parses_containers_and_scalars() {
    let mut expected = BTreeMap::new();
    expected.insert(
        "a".to_string(),
        Value::List(vec![
            Value::Int(1),
            Value::String("x".to_string()),
            Value::Bool(true),
            Value::Null,
        ]),
    );
    expected.insert("b".to_string(), Value::Map(BTreeMap::new()));
    assert_eq!(
        Some(Value::Map(expected)),
        parse_json_value(r#"{"a": [1, "x", true, null], "b": {}}"#)
    );
}

#[test]
fn keeps_non_ascii_and_unescapes() {
    assert_eq!(
        Some(Value::String("café 😀\t\n".to_string())),
        parse_json_value("\"café 😀\\t\\n\"")
    );
}

#[test]
fn malformed_input_is_none() {
    assert_eq!(None, parse_json_value("{"));
    assert_eq!(None, parse_json_value("1 2"));
}
