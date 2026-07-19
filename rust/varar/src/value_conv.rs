//! Converting between a step's slots and the author's own Rust types.
//!
//! A slot is a `Value` inside the core, but an author should never have to say
//! so: implement [`FromSlot`] to receive your type as a step parameter, and
//! [`ToSlot`] so a sensor can return it for comparison. The primitives and
//! `String` are implemented here; a domain type implements the pair once (the
//! serde-without-derive shape — Rust has no reflection to map structs for you).

use varar_core::error::HandlerError;
use varar_core::value::Value;

/// A type a step parameter can be read into.
pub trait FromSlot: Sized {
    fn from_slot(value: &Value) -> Result<Self, HandlerError>;
}

/// A type a sensor can return for comparison against the document.
pub trait ToSlot {
    fn to_slot(&self) -> Value;
}

fn mismatch(want: &str, got: &Value) -> HandlerError {
    HandlerError::new(format!("expected {want}, got {}", got.type_name()))
}

impl FromSlot for i64 {
    fn from_slot(value: &Value) -> Result<i64, HandlerError> {
        match value {
            Value::Int(i) => Ok(*i),
            other => Err(mismatch("an integer", other)),
        }
    }
}

impl FromSlot for i32 {
    fn from_slot(value: &Value) -> Result<i32, HandlerError> {
        i64::from_slot(value).map(|i| i as i32)
    }
}

impl FromSlot for f64 {
    fn from_slot(value: &Value) -> Result<f64, HandlerError> {
        match value {
            Value::Float(f) => Ok(*f),
            other => Err(mismatch("a number", other)),
        }
    }
}

impl FromSlot for bool {
    fn from_slot(value: &Value) -> Result<bool, HandlerError> {
        match value {
            Value::Bool(b) => Ok(*b),
            other => Err(mismatch("a boolean", other)),
        }
    }
}

impl FromSlot for String {
    fn from_slot(value: &Value) -> Result<String, HandlerError> {
        match value {
            Value::String(s) => Ok(s.clone()),
            other => Err(mismatch("a string", other)),
        }
    }
}

/// The escape hatch: a slot with no natural Rust spelling (a whole table, or a
/// custom parameter type that parses to a map) can still be taken as a `Value`.
impl FromSlot for Value {
    fn from_slot(value: &Value) -> Result<Value, HandlerError> {
        Ok(value.clone())
    }
}

/// A whole-table slot: the header row followed by the data rows.
impl FromSlot for Vec<Vec<String>> {
    fn from_slot(value: &Value) -> Result<Vec<Vec<String>>, HandlerError> {
        let Value::List(rows) = value else {
            return Err(mismatch("a table", value));
        };
        rows.iter()
            .map(|row| {
                let Value::List(cells) = row else {
                    return Err(mismatch("a table row", row));
                };
                Ok(cells
                    .iter()
                    .map(|c| match c {
                        Value::String(s) => s.clone(),
                        other => format!("{other:?}"),
                    })
                    .collect())
            })
            .collect()
    }
}

/// A computed table: rows of cells, compared positionally against the input
/// table's columns.
impl ToSlot for Vec<Vec<String>> {
    fn to_slot(&self) -> Value {
        Value::List(
            self.iter()
                .map(|row| Value::List(row.iter().map(|c| Value::String(c.clone())).collect()))
                .collect(),
        )
    }
}

impl ToSlot for i64 {
    fn to_slot(&self) -> Value {
        Value::Int(*self)
    }
}

impl ToSlot for i32 {
    fn to_slot(&self) -> Value {
        Value::Int(i64::from(*self))
    }
}

impl ToSlot for f64 {
    fn to_slot(&self) -> Value {
        Value::Float(*self)
    }
}

impl ToSlot for bool {
    fn to_slot(&self) -> Value {
        Value::Bool(*self)
    }
}

impl ToSlot for String {
    fn to_slot(&self) -> Value {
        Value::String(self.clone())
    }
}

impl ToSlot for &str {
    fn to_slot(&self) -> Value {
        Value::String((*self).to_string())
    }
}

impl ToSlot for Value {
    fn to_slot(&self) -> Value {
        self.clone()
    }
}

/// A header-bound row's computed columns, keyed by column name.
impl ToSlot for std::collections::BTreeMap<String, String> {
    fn to_slot(&self) -> Value {
        Value::Map(
            self.iter()
                .map(|(k, v)| (k.clone(), Value::String(v.clone())))
                .collect(),
        )
    }
}

/// A header-bound row as it arrives: the row's cells keyed by column name.
impl FromSlot for std::collections::BTreeMap<String, String> {
    fn from_slot(value: &Value) -> Result<Self, HandlerError> {
        let Value::Map(map) = value else {
            return Err(mismatch("a row", value));
        };
        Ok(map
            .iter()
            .map(|(k, v)| {
                let cell = match v {
                    Value::String(s) => s.clone(),
                    other => format!("{other:?}"),
                };
                (k.clone(), cell)
            })
            .collect())
    }
}
